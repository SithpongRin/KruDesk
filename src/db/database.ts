import Dexie, {
  type DBCore,
  type DBCoreMutateRequest,
  type DBCoreTable,
  type Table,
  type Transaction,
} from 'dexie';
import type {
  AppSetting,
  Attendance,
  AttendanceSession,
  Holiday,
  MonthlyScore,
  Profile,
  SchoolClass,
  SemesterExam,
  Student,
  ThemeMode,
} from '../types/domain';
import type { CardTemplate } from '../types/template';
import {
  buildAttendanceDocEntry,
  buildAttendanceSessionDocEntry,
  buildClassDocEntry,
  buildHolidayDocEntry,
  buildMonthlyScoreDocEntry,
  buildSemesterExamDocEntry,
  buildSettingDocEntry,
  buildStudentDocEntry,
  buildTemplateDocEntry,
  encodeSafeKey,
  isSyncedSettingKey,
  SYNC_DEVICE_ID_KEY,
  SYNC_INITIAL_DONE_KEY,
  SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY,
  SYNC_LAST_PULL_WALL_AT_KEY,
  SYNC_LAST_PULLED_AT_KEY,
  SYNC_PENDING_FULL_REPLACE_KEY,
} from '../services/sync/syncCodec';
import { normalizeMigratedClassSubjects } from './subjectMigration';

export const LEGACY_DB_NAME = 'KruDeskDB';

export interface OutboxEntry {
  docId: string;
  rowKey: string;
  op: 'put' | 'delete';
  value?: unknown;
  /**
   * True when a student photo change was recorded atomically with the student write.
   * The actual Blob is read from `students.photoBlob` and compressed at push time.
   */
  pendingPhoto?: boolean;
  ts: number;
}

const SYNCED_TABLE_NAMES = new Set<string>([
  'settings',
  'classes',
  'students',
  'attendance',
  'attendanceSessions',
  'holidays',
  'monthlyScores',
  'semesterExams',
  'templates',
]);

const recentGeneratedIds = new Set<number>();
let lastBaseMs = 0;

function randomUnder1000(): number {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0]! % 1000;
  }
  return Math.floor(Math.random() * 1000);
}

/**
 * Generates a collision-safe random integer primary key (`Date.now() * 1000 + random(0..999)`)
 * guaranteed to be a positive safe integer (`<= Number.MAX_SAFE_INTEGER`).
 * Two devices working offline will not collide on sequential `1, 2, 3...` IDs.
 */
export function generateSafeId(nowMs: number = Date.now()): number {
  let baseMs = Math.max(Math.floor(nowMs), lastBaseMs);
  if (baseMs > lastBaseMs) {
    recentGeneratedIds.clear();
    lastBaseMs = baseMs;
  }

  const startSlot = randomUnder1000();
  for (let offset = 0; offset < 1000; offset++) {
    const slot = (startSlot + offset) % 1000;
    const candidate = baseMs * 1000 + slot;
    if (
      candidate > 0 &&
      candidate <= Number.MAX_SAFE_INTEGER &&
      Number.isSafeInteger(candidate) &&
      !recentGeneratedIds.has(candidate)
    ) {
      recentGeneratedIds.add(candidate);
      return candidate;
    }
  }

  // All 1000 slots in baseMs were used in the same millisecond: advance by 1ms
  baseMs += 1;
  lastBaseMs = baseMs;
  recentGeneratedIds.clear();
  const slot = randomUnder1000();
  const fallback = baseMs * 1000 + slot;
  recentGeneratedIds.add(fallback);
  return fallback;
}

/**
 * Derives one AttendanceSession per unique (classId, date) from existing absence rows.
 * Shared by Dexie v2 upgrade and v1 backup restore so historical data stays counted.
 */
export function deriveSessionsFromAbsenceRows(
  rows: Array<Pick<Attendance, 'classId' | 'date'>>,
  savedAt: number = Date.now()
): AttendanceSession[] {
  const seen = new Set<string>();
  const sessions: AttendanceSession[] = [];
  for (const r of rows) {
    const key = `${r.classId}|${r.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      sessions.push({ classId: r.classId, date: r.date, savedAt, migrated: true });
    }
  }
  return sessions;
}

/**
 * Returns sessions that should be marked `migrated: true` because their `savedAt`
 * timestamp is shared by 2 or more sessions (created in one batch by the v2 upgrade).
 */
export function markMigratedSessionsInBatch(sessions: AttendanceSession[]): AttendanceSession[] {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    counts.set(s.savedAt, (counts.get(s.savedAt) ?? 0) + 1);
  }
  return sessions
    .filter((s) => !s.migrated && (counts.get(s.savedAt) ?? 0) >= 2)
    .map((s) => ({ ...s, migrated: true }));
}

function transHasStore(trans: object, storeName: string): boolean {
  const names = (trans as { objectStoreNames?: DOMStringList }).objectStoreNames;
  if (!names || typeof names.contains !== 'function') {
    return true;
  }
  return names.contains(storeName);
}

function buildOutboxEntriesForPut(
  tableName: string,
  finalKey: unknown,
  newObj: unknown,
  oldObj: unknown,
  changeSpec: Record<string, unknown> | undefined,
  ts: number
): OutboxEntry[] {
  if (!newObj || typeof newObj !== 'object') return [];

  switch (tableName) {
    case 'settings': {
      const setting = newObj as AppSetting;
      const key = String(finalKey ?? setting.key ?? '');
      if (!key || !isSyncedSettingKey(key)) return [];
      const entry = buildSettingDocEntry({ key, value: setting.value });
      return [{ ...entry, op: 'put', ts }];
    }

    case 'classes': {
      const cls = newObj as SchoolClass;
      const id = Number(finalKey ?? cls.id);
      if (!Number.isFinite(id)) return [];
      const entry = buildClassDocEntry({ ...cls, id });
      return [{ ...entry, op: 'put', ts }];
    }

    case 'students': {
      const student = newObj as Student;
      const oldStudent = oldObj as Student | undefined;
      const id = Number(finalKey ?? student.id);
      if (!Number.isFinite(id)) return [];

      const out: OutboxEntry[] = [];
      if (oldStudent && oldStudent.classId !== student.classId) {
        out.push({
          docId: `students__${oldStudent.classId}`,
          rowKey: `s_${id}`,
          op: 'delete',
          ts,
        });
      }

      const entry = buildStudentDocEntry({ ...student, id });
      out.push({ ...entry, op: 'put', ts });

      if (changeSpec) {
        // Explicit update / modify: only touch photo outbox if photoBlob was part of the update spec
        if (Object.prototype.hasOwnProperty.call(changeSpec, 'photoBlob')) {
          if (student.photoBlob) {
            out.push({
              docId: `photo__${id}`,
              rowKey: `p_${id}`,
              op: 'put',
              pendingPhoto: true,
              value: { studentId: id, classId: student.classId },
              ts,
            });
          } else {
            out.push({
              docId: `photo__${id}`,
              rowKey: `p_${id}`,
              op: 'delete',
              ts,
            });
          }
        }
      } else if (!oldStudent) {
        if (student.photoBlob) {
          out.push({
            docId: `photo__${id}`,
            rowKey: `p_${id}`,
            op: 'put',
            pendingPhoto: true,
            value: { studentId: id, classId: student.classId },
            ts,
          });
        }
      } else {
        if (!oldStudent.photoBlob && student.photoBlob) {
          out.push({
            docId: `photo__${id}`,
            rowKey: `p_${id}`,
            op: 'put',
            pendingPhoto: true,
            value: { studentId: id, classId: student.classId },
            ts,
          });
        } else if (oldStudent.photoBlob && !student.photoBlob) {
          out.push({
            docId: `photo__${id}`,
            rowKey: `p_${id}`,
            op: 'delete',
            ts,
          });
        } else if (
          oldStudent.photoBlob &&
          student.photoBlob &&
          oldStudent.photoBlob !== student.photoBlob
        ) {
          out.push({
            docId: `photo__${id}`,
            rowKey: `p_${id}`,
            op: 'put',
            pendingPhoto: true,
            value: { studentId: id, classId: student.classId },
            ts,
          });
        }
      }

      return out;
    }

    case 'attendance': {
      const entry = buildAttendanceDocEntry(newObj as Attendance);
      return [{ ...entry, op: 'put', ts }];
    }

    case 'attendanceSessions': {
      const entry = buildAttendanceSessionDocEntry(newObj as AttendanceSession);
      return [{ ...entry, op: 'put', ts }];
    }

    case 'holidays': {
      const holiday = newObj as Holiday;
      const id = Number(finalKey ?? holiday.id);
      if (!Number.isFinite(id)) return [];
      const entry = buildHolidayDocEntry({ ...holiday, id });
      return [{ ...entry, op: 'put', ts }];
    }

    case 'monthlyScores': {
      const entry = buildMonthlyScoreDocEntry(newObj as MonthlyScore);
      return [{ ...entry, op: 'put', ts }];
    }

    case 'semesterExams': {
      const entry = buildSemesterExamDocEntry(newObj as SemesterExam);
      return [{ ...entry, op: 'put', ts }];
    }

    case 'templates': {
      const entry = buildTemplateDocEntry(newObj as CardTemplate);
      return [{ ...entry, op: 'put', ts }];
    }

    default:
      return [];
  }
}

function buildOutboxEntriesForDelete(
  tableName: string,
  primKey: unknown,
  oldObj: unknown,
  ts: number
): OutboxEntry[] {
  switch (tableName) {
    case 'settings': {
      const key = String(primKey ?? (oldObj as AppSetting | undefined)?.key ?? '');
      if (!key || !isSyncedSettingKey(key)) return [];
      return [
        {
          docId: `settings__${key}`,
          rowKey: 'v',
          op: 'delete',
          ts,
        },
      ];
    }

    case 'classes': {
      const id = Number(primKey ?? (oldObj as SchoolClass | undefined)?.id);
      if (!Number.isFinite(id)) return [];
      return [
        {
          docId: `class__${id}`,
          rowKey: `c_${id}`,
          op: 'delete',
          ts,
        },
      ];
    }

    case 'students': {
      const oldStudent = oldObj as Student | undefined;
      const id = Number(primKey ?? oldStudent?.id);
      if (!Number.isFinite(id)) return [];
      const out: OutboxEntry[] = [];
      if (typeof oldStudent?.classId === 'number') {
        out.push({
          docId: `students__${oldStudent.classId}`,
          rowKey: `s_${id}`,
          op: 'delete',
          ts,
        });
      }
      out.push({
        docId: `photo__${id}`,
        rowKey: `p_${id}`,
        op: 'delete',
        ts,
      });
      return out;
    }

    case 'attendance': {
      const oldAtt = oldObj as Attendance | undefined;
      const tuple = Array.isArray(primKey) ? primKey : [];
      const classId = oldAtt?.classId ?? (tuple[0] as number | undefined);
      const date = oldAtt?.date ?? (tuple[1] as string | undefined);
      const studentRef = oldAtt?.studentRef ?? (tuple[2] as number | undefined);
      if (classId === undefined || !date || studentRef === undefined) return [];
      const month = date.slice(0, 7);
      const safeDate = date.replace(/-/g, '_');
      return [
        {
          docId: `att__${classId}__${month}`,
          rowKey: `a_${studentRef}_${safeDate}`,
          op: 'delete',
          ts,
        },
      ];
    }

    case 'attendanceSessions': {
      const oldSess = oldObj as AttendanceSession | undefined;
      const tuple = Array.isArray(primKey) ? primKey : [];
      const classId = oldSess?.classId ?? (tuple[0] as number | undefined);
      const date = oldSess?.date ?? (tuple[1] as string | undefined);
      if (classId === undefined || !date) return [];
      const month = date.slice(0, 7);
      const safeDate = date.replace(/-/g, '_');
      return [
        {
          docId: `att__${classId}__${month}`,
          rowKey: `sess_${safeDate}`,
          op: 'delete',
          ts,
        },
      ];
    }

    case 'holidays': {
      const id = Number(primKey ?? (oldObj as Holiday | undefined)?.id);
      if (!Number.isFinite(id)) return [];
      return [
        {
          docId: 'holidays',
          rowKey: `h_${id}`,
          op: 'delete',
          ts,
        },
      ];
    }

    case 'monthlyScores': {
      const oldScore = oldObj as MonthlyScore | undefined;
      const tuple = Array.isArray(primKey) ? primKey : [];
      const classId = oldScore?.classId ?? (tuple[0] as number | undefined);
      const month = oldScore?.month ?? (tuple[1] as string | undefined);
      const studentRef = oldScore?.studentRef ?? (tuple[2] as number | undefined);
      if (classId === undefined || !month || studentRef === undefined) return [];
      return [
        {
          docId: `ms__${classId}__${month}`,
          rowKey: `m_${studentRef}`,
          op: 'delete',
          ts,
        },
      ];
    }

    case 'semesterExams': {
      const oldExam = oldObj as SemesterExam | undefined;
      const tuple = Array.isArray(primKey) ? primKey : [];
      const classId = oldExam?.classId ?? (tuple[0] as number | undefined);
      const semester = oldExam?.semester ?? (tuple[1] as 1 | 2 | undefined);
      const studentRef = oldExam?.studentRef ?? (tuple[2] as number | undefined);
      if (classId === undefined || semester === undefined || studentRef === undefined) return [];
      return [
        {
          docId: `se__${classId}__${semester}`,
          rowKey: `e_${studentRef}`,
          op: 'delete',
          ts,
        },
      ];
    }

    case 'templates': {
      const id = String(primKey ?? (oldObj as CardTemplate | undefined)?.id ?? '');
      if (!id) return [];
      const safeId = encodeSafeKey(id);
      return [
        {
          docId: `template__${safeId}`,
          rowKey: `t_${safeId}`,
          op: 'delete',
          ts,
        },
      ];
    }

    default:
      return [];
  }
}

function deduplicateOutboxEntries(entries: OutboxEntry[]): OutboxEntry[] {
  if (entries.length <= 1) return entries;
  const map = new Map<string, OutboxEntry>();
  for (const e of entries) {
    map.set(`${e.docId}|${e.rowKey}`, e);
  }
  return Array.from(map.values());
}

export interface KruDeskDatabaseOptions {
  /**
   * Enables atomic outbox recording for cloud sync.
   * Defaults to `dbName !== LEGACY_DB_NAME` so legacy `KruDeskDB` (and GitHub Pages
   * local-only builds) never duplicate writes into `outbox`, while `KruDeskDB_<uid>`
   * accounts always record outbox entries.
   */
  enableOutbox?: boolean;
}

export class KruDeskDatabase extends Dexie {
  settings!: Table<AppSetting, string>;
  classes!: Table<SchoolClass, number>;
  students!: Table<Student, number>;
  attendance!: Table<Attendance, [number, string, number]>;
  attendanceSessions!: Table<AttendanceSession, [number, string]>;
  holidays!: Table<Holiday, number>;
  monthlyScores!: Table<MonthlyScore, [number, string, number]>;
  semesterExams!: Table<SemesterExam, [number, 1 | 2, number]>;
  templates!: Table<CardTemplate, string>;
  outbox!: Table<OutboxEntry, [string, string]>;

  readonly outboxEnabled: boolean;

  /** Per-transaction skip markers so concurrent local edits NEVER miss the outbox during a pull. */
  private skipOutboxTransactions = new WeakSet<Transaction>();
  private skipOutboxCoreTransactions = new WeakSet<object>();
  private pendingNotifyTransactions = new WeakSet<Transaction>();
  private outboxListeners = new Set<() => void>();
  private lastOutboxTs = 0;

  constructor(dbName: string = LEGACY_DB_NAME, options?: KruDeskDatabaseOptions) {
    super(dbName);
    this.outboxEnabled = options?.enableOutbox ?? dbName !== LEGACY_DB_NAME;
    this.version(1).stores({
      settings: '&key',
      classes: '++id, name, academicYear',
      students: '++id, classId, [classId+order], studentId',
      attendance: '[classId+date+studentRef], [classId+date], classId',
      holidays: '++id, &date',
      monthlyScores: '[classId+month+studentRef], [classId+month]',
      semesterExams: '[classId+semester+studentRef], [classId+semester]',
      templates: '&id, name, isDefault, isReference, updatedAt',
    });

    this.version(2)
      .stores({
        settings: '&key',
        classes: '++id, name, academicYear',
        students: '++id, classId, [classId+order], studentId',
        attendance: '[classId+date+studentRef], [classId+date], classId',
        attendanceSessions: '[classId+date], classId',
        holidays: '++id, &date',
        monthlyScores: '[classId+month+studentRef], [classId+month]',
        semesterExams: '[classId+semester+studentRef], [classId+semester]',
        templates: '&id, name, isDefault, isReference, updatedAt',
      })
      .upgrade(async (tx) => {
        const existingRows = (await tx.table('attendance').toArray()) as Attendance[];
        const sessions = deriveSessionsFromAbsenceRows(existingRows);
        if (sessions.length > 0) {
          await tx.table('attendanceSessions').bulkPut(sessions);
        }
      });

    this.version(3)
      .stores({
        settings: '&key',
        classes: '++id, name, academicYear',
        students: '++id, classId, [classId+order], studentId',
        attendance: '[classId+date+studentRef], [classId+date], classId',
        attendanceSessions: '[classId+date], classId',
        holidays: '++id, &date',
        monthlyScores: '[classId+month+studentRef], [classId+month]',
        semesterExams: '[classId+semester+studentRef], [classId+semester]',
        templates: '&id, name, isDefault, isReference, updatedAt',
      })
      .upgrade(async (tx) => {
        const existingSessions = (await tx
          .table('attendanceSessions')
          .toArray()) as AttendanceSession[];
        const toUpdate = markMigratedSessionsInBatch(existingSessions);
        if (toUpdate.length > 0) {
          await tx.table('attendanceSessions').bulkPut(toUpdate);
        }
      });

    this.version(4)
      .stores({
        settings: '&key',
        classes: '++id, name, academicYear',
        students: '++id, classId, [classId+order], studentId',
        attendance: '[classId+date+studentRef], [classId+date], classId',
        attendanceSessions: '[classId+date], classId',
        holidays: '++id, &date',
        monthlyScores: '[classId+month+studentRef], [classId+month]',
        semesterExams: '[classId+semester+studentRef], [classId+semester]',
        templates: '&id, name, isDefault, isReference, updatedAt',
      })
      .upgrade(async (tx) => {
        const [classes, monthlyRows, examRows] = await Promise.all([
          tx.table('classes').toArray() as Promise<SchoolClass[]>,
          tx.table('monthlyScores').toArray() as Promise<MonthlyScore[]>,
          tx.table('semesterExams').toArray() as Promise<SemesterExam[]>,
        ]);

        const updatedClasses: SchoolClass[] = [];
        for (const cls of classes) {
          if (cls.id === undefined) continue;
          const clsMonthly = monthlyRows.filter((r) => r.classId === cls.id);
          const clsExams = examRows.filter((r) => r.classId === cls.id);
          const { subjects, changed } = normalizeMigratedClassSubjects(
            cls.subjects ?? [],
            clsMonthly,
            clsExams
          );
          if (changed) {
            updatedClasses.push({ ...cls, subjects });
          }
        }
        if (updatedClasses.length > 0) {
          await tx.table('classes').bulkPut(updatedClasses);
        }
      });

    // Version 5: adds local sync outbox table and assigns safe random integer IDs
    // via creating hooks on classes, students, and holidays (§1.2, §1.4).
    this.version(5).stores({
      settings: '&key',
      classes: '++id, name, academicYear',
      students: '++id, classId, [classId+order], studentId',
      attendance: '[classId+date+studentRef], [classId+date], classId',
      attendanceSessions: '[classId+date], classId',
      holidays: '++id, &date',
      monthlyScores: '[classId+month+studentRef], [classId+month]',
      semesterExams: '[classId+semester+studentRef], [classId+semester]',
      templates: '&id, name, isDefault, isReference, updatedAt',
      outbox: '[docId+rowKey], docId, ts',
    });

    this.installSafeIdHooks();
    if (this.outboxEnabled) {
      this.installSyncOutboxMiddleware();
    }
  }

  nextOutboxTs(): number {
    const now = Date.now();
    this.lastOutboxTs = Math.max(now, this.lastOutboxTs + 1);
    return this.lastOutboxTs;
  }

  onOutboxQueued(listener: () => void): () => void {
    this.outboxListeners.add(listener);
    return () => {
      this.outboxListeners.delete(listener);
    };
  }

  notifyOutboxListeners(): void {
    for (const listener of this.outboxListeners) {
      listener();
    }
  }

  /**
   * Marks a single Dexie transaction (and its underlying DBCore transaction) so writes
   * inside it do not append to `outbox`. Other concurrent transactions remain unaffected.
   */
  markTransactionSkipOutbox(tx: Transaction | null | undefined): void {
    if (!tx) return;
    this.skipOutboxTransactions.add(tx);
    const coreTx = (tx as unknown as { idbtrans?: object }).idbtrans;
    if (coreTx) {
      this.skipOutboxCoreTransactions.add(coreTx);
    }
  }

  private isSkipOutboxDexieTransaction(tx: Transaction | null | undefined): boolean {
    let cur = tx ?? null;
    while (cur) {
      if (this.skipOutboxTransactions.has(cur)) {
        return true;
      }
      cur = cur.parent ?? null;
    }
    return false;
  }

  isSkipOutboxContext(coreTrans: object | null | undefined): boolean {
    if (coreTrans && this.skipOutboxCoreTransactions.has(coreTrans)) {
      return true;
    }
    return this.isSkipOutboxDexieTransaction(Dexie.currentTransaction);
  }

  /**
   * Runs a readwrite Dexie transaction marked per-transaction as remote/internal
   * so writes inside it skip the outbox while concurrent teacher edits still record outbox entries.
   */
  async runRemoteTransaction<U>(
    tables: Table | readonly Table[],
    scope: (trans: Transaction) => PromiseLike<U> | U
  ): Promise<U> {
    const tableList = Array.isArray(tables) ? tables : [tables];
    return this.transaction('rw', tableList, (tx) => {
      this.markTransactionSkipOutbox(tx);
      return scope(tx);
    });
  }

  private installSafeIdHooks(): void {
    this.classes.hook('creating', function (primKey, obj) {
      if (primKey === undefined && obj.id === undefined) {
        return generateSafeId();
      }
      return undefined;
    });
    this.students.hook('creating', function (primKey, obj) {
      if (primKey === undefined && obj.id === undefined) {
        return generateSafeId();
      }
      return undefined;
    });
    this.holidays.hook('creating', function (primKey, obj) {
      if (primKey === undefined && obj.id === undefined) {
        return generateSafeId();
      }
      return undefined;
    });
  }

  /**
   * DBCore middleware at level 1 (above Observability=0, below HooksMiddleware=2):
   * - Automatically includes `outbox` in every readwrite transaction touching a synced table.
   * - Writes outbox entries (including `pendingPhoto: true` and `deleteRange`/`Table.clear()`)
   *   atomically inside the EXACT SAME IndexedDB transaction as the data mutation.
   * - Respects per-transaction skip markers (`Dexie.currentTransaction` / `req.trans`).
   */
  private installSyncOutboxMiddleware(): void {
    const self = this;

    this.use({
      stack: 'dbcore',
      name: 'KruDeskSyncOutboxMiddleware',
      level: 1,
      create(downCore: DBCore): Partial<DBCore> {
        const hasOutboxSchema = downCore.schema.tables.some((t) => t.name === 'outbox');
        if (!hasOutboxSchema) {
          return {};
        }

        const outboxDownTable = downCore.table('outbox');

        return {
          transaction(stores, mode, options) {
            let effectiveStores = stores;
            if (
              mode === 'readwrite' &&
              !stores.includes('outbox') &&
              stores.some((name) => SYNCED_TABLE_NAMES.has(name))
            ) {
              effectiveStores = [...stores, 'outbox'];
            }
            const coreTx = downCore.transaction(effectiveStores, mode, options);
            if (self.isSkipOutboxDexieTransaction(Dexie.currentTransaction)) {
              self.skipOutboxCoreTransactions.add(coreTx);
            }
            return coreTx;
          },

          table(tableName: string): DBCoreTable {
            const downTable = downCore.table(tableName);
            if (!SYNCED_TABLE_NAMES.has(tableName)) {
              return downTable;
            }

            const primaryKey = downTable.schema.primaryKey;

            return {
              ...downTable,
              async mutate(req: DBCoreMutateRequest) {
                if (
                  self.isSkipOutboxContext(req.trans) ||
                  !transHasStore(req.trans, 'outbox')
                ) {
                  return downTable.mutate(req);
                }

                const ts = self.nextOutboxTs();

                if (req.type === 'add' || req.type === 'put') {
                  const effectiveKeys =
                    req.keys ?? req.values.map((val) => primaryKey.extractKey?.(val));

                  // For `students` put, read previous rows inside the same transaction so we detect
                  // class transfers and photoBlob additions/removals/changes accurately.
                  const existingByIndex = new Map<number, unknown>();
                  if (tableName === 'students' && req.type === 'put') {
                    const validIndices: number[] = [];
                    const validKeys: unknown[] = [];
                    for (let i = 0; i < effectiveKeys.length; i++) {
                      const k = effectiveKeys[i];
                      if (k !== undefined && k !== null) {
                        validIndices.push(i);
                        validKeys.push(k);
                      }
                    }
                    if (validKeys.length > 0) {
                      const fetched = await downTable.getMany({
                        trans: req.trans,
                        keys: validKeys,
                      });
                      for (let j = 0; j < validIndices.length; j++) {
                        existingByIndex.set(validIndices[j]!, fetched[j]);
                      }
                    }
                  }

                  const res = await downTable.mutate(req);
                  const outboxEntries: OutboxEntry[] = [];

                  for (let i = 0; i < req.values.length; i++) {
                    if (res.failures && i in res.failures) continue;
                    const finalKey = res.results?.[i] ?? effectiveKeys[i];
                    const itemChangeSpec =
                      req.type === 'put'
                        ? (req.updates?.changeSpecs?.[i] ?? req.changeSpec)
                        : undefined;
                    const built = buildOutboxEntriesForPut(
                      tableName,
                      finalKey,
                      req.values[i],
                      existingByIndex.get(i),
                      itemChangeSpec,
                      ts
                    );
                    outboxEntries.push(...built);
                  }

                  const deduped = deduplicateOutboxEntries(outboxEntries);
                  if (deduped.length > 0) {
                    await outboxDownTable.mutate({
                      trans: req.trans,
                      type: 'put',
                      values: deduped,
                    });
                    self.scheduleOutboxNotifyOnCommit();
                  }

                  return res;
                }

                if (req.type === 'delete') {
                  const validIndices: number[] = [];
                  const validKeys: unknown[] = [];
                  for (let i = 0; i < req.keys.length; i++) {
                    const k = req.keys[i];
                    if (k !== undefined && k !== null) {
                      validIndices.push(i);
                      validKeys.push(k);
                    }
                  }
                  const existingByIndex = new Map<number, unknown>();
                  if (validKeys.length > 0) {
                    const fetched = await downTable.getMany({
                      trans: req.trans,
                      keys: validKeys,
                    });
                    for (let j = 0; j < validIndices.length; j++) {
                      existingByIndex.set(validIndices[j]!, fetched[j]);
                    }
                  }

                  const res = await downTable.mutate(req);
                  const outboxEntries: OutboxEntry[] = [];

                  for (let i = 0; i < req.keys.length; i++) {
                    if (res.failures && i in res.failures) continue;
                    const oldObj = existingByIndex.get(i);
                    if (oldObj === undefined) continue;
                    const built = buildOutboxEntriesForDelete(tableName, req.keys[i], oldObj, ts);
                    outboxEntries.push(...built);
                  }

                  const deduped = deduplicateOutboxEntries(outboxEntries);
                  if (deduped.length > 0) {
                    await outboxDownTable.mutate({
                      trans: req.trans,
                      type: 'put',
                      values: deduped,
                    });
                    self.scheduleOutboxNotifyOnCommit();
                  }

                  return res;
                }

                if (req.type === 'deleteRange') {
                  // Covers Table.clear() and Collection.delete() range deletes
                  const queryRes = await downTable.query({
                    trans: req.trans,
                    query: {
                      index: primaryKey,
                      range: req.range,
                    },
                    values: true,
                  });

                  const res = await downTable.mutate(req);
                  if (res.numFailures === 0 && queryRes.result.length > 0) {
                    const outboxEntries: OutboxEntry[] = [];
                    for (const oldObj of queryRes.result) {
                      const key = primaryKey.extractKey?.(oldObj);
                      const built = buildOutboxEntriesForDelete(tableName, key, oldObj, ts);
                      outboxEntries.push(...built);
                    }
                    const deduped = deduplicateOutboxEntries(outboxEntries);
                    if (deduped.length > 0) {
                      await outboxDownTable.mutate({
                        trans: req.trans,
                        type: 'put',
                        values: deduped,
                      });
                      self.scheduleOutboxNotifyOnCommit();
                    }
                  }

                  return res;
                }

                return downTable.mutate(req);
              },
            };
          },
        };
      },
    });
  }

  private scheduleOutboxNotifyOnCommit(): void {
    const dxTrans = Dexie.currentTransaction;
    if (dxTrans) {
      if (!this.pendingNotifyTransactions.has(dxTrans)) {
        this.pendingNotifyTransactions.add(dxTrans);
        dxTrans.on('complete', () => {
          this.notifyOutboxListeners();
        });
      }
    } else {
      this.notifyOutboxListeners();
    }
  }
}

export let db: KruDeskDatabase = new KruDeskDatabase(LEGACY_DB_NAME);

export function getUserDbName(uid: string): string {
  const clean = uid.trim();
  if (!clean) {
    throw new Error('Cannot build user database name for empty uid');
  }
  return `${LEGACY_DB_NAME}_${clean}`;
}

export function getActiveDbName(): string {
  return db.name;
}

/**
 * Switches the exported `db` singleton to `KruDeskDB_<uid>` and opens it.
 * Never deletes the old `KruDeskDB` or any other account's database.
 */
export async function openDbForUser(uid: string): Promise<KruDeskDatabase> {
  const targetName = getUserDbName(uid);
  if (db.name === targetName) {
    if (!db.isOpen()) {
      await db.open();
    }
    return db;
  }

  db.close();
  db = new KruDeskDatabase(targetName, { enableOutbox: true });
  await db.open();
  return db;
}

/**
 * Closes the current user's database on sign-out and resets the `db` reference
 * to an unopened `KruDeskDB` instance without deleting any data.
 */
export function closeUserDb(): void {
  db.close();
  if (db.name !== LEGACY_DB_NAME) {
    db = new KruDeskDatabase(LEGACY_DB_NAME, { enableOutbox: false });
  }
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getProfile(): Promise<Profile | undefined> {
  return getSetting<Profile>('profile');
}

export async function saveProfile(profile: Profile): Promise<void> {
  await setSetting('profile', profile);
}

export async function getThemeSetting(): Promise<ThemeMode> {
  const saved = await getSetting<ThemeMode>('theme');
  return saved ?? 'system';
}

export interface ClearAllAppDataOptions {
  /**
   * When true (user-initiated «លុបទិន្នន័យទាំងអស់»), clears all synced tables through the
   * outbox middleware and flags a pending full cloud replace so every device is cleared.
   * Default false (local-only reset for tests/sign-in init).
   */
  syncToCloud?: boolean;
}

export async function clearAllAppData(
  targetDb: KruDeskDatabase = db,
  options?: ClearAllAppDataOptions
): Promise<void> {
  const allTables = [
    targetDb.settings,
    targetDb.classes,
    targetDb.students,
    targetDb.attendance,
    targetDb.attendanceSessions,
    targetDb.holidays,
    targetDb.monthlyScores,
    targetDb.semesterExams,
    targetDb.templates,
    targetDb.outbox,
  ];

  if (options?.syncToCloud && targetDb.outboxEnabled) {
    await targetDb.transaction('rw', allTables, async () => {
      const [deviceIdRow, lastPulledRow, lastPullWallRow, initialDoneRow, lastDailySnapshotRow] =
        await Promise.all([
          targetDb.settings.get(SYNC_DEVICE_ID_KEY),
          targetDb.settings.get(SYNC_LAST_PULLED_AT_KEY),
          targetDb.settings.get(SYNC_LAST_PULL_WALL_AT_KEY),
          targetDb.settings.get(SYNC_INITIAL_DONE_KEY),
          targetDb.settings.get(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY),
        ]);

      await Promise.all([
        targetDb.settings.clear(),
        targetDb.classes.clear(),
        targetDb.students.clear(),
        targetDb.attendance.clear(),
        targetDb.attendanceSessions.clear(),
        targetDb.holidays.clear(),
        targetDb.monthlyScores.clear(),
        targetDb.semesterExams.clear(),
        targetDb.templates.clear(),
      ]);

      // Preserve device-local sync metadata and mark full replace for cloud sync
      if (deviceIdRow) {
        await targetDb.settings.put(deviceIdRow);
      }
      if (lastPulledRow) {
        await targetDb.settings.put(lastPulledRow);
      }
      if (lastPullWallRow) {
        await targetDb.settings.put(lastPullWallRow);
      }
      if (initialDoneRow) {
        await targetDb.settings.put(initialDoneRow);
      }
      if (lastDailySnapshotRow) {
        await targetDb.settings.put(lastDailySnapshotRow);
      }
      await targetDb.settings.put({
        key: SYNC_PENDING_FULL_REPLACE_KEY,
        value: Date.now(),
      });
    });
    targetDb.notifyOutboxListeners();
    return;
  }

  await targetDb.runRemoteTransaction(allTables, async () => {
    await Promise.all([
      targetDb.settings.clear(),
      targetDb.classes.clear(),
      targetDb.students.clear(),
      targetDb.attendance.clear(),
      targetDb.attendanceSessions.clear(),
      targetDb.holidays.clear(),
      targetDb.monthlyScores.clear(),
      targetDb.semesterExams.clear(),
      targetDb.templates.clear(),
      targetDb.outbox.clear(),
    ]);
  });
}
