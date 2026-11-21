import Dexie, { type Table } from 'dexie';
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
import { normalizeMigratedClassSubjects } from './subjectMigration';

export const LEGACY_DB_NAME = 'KruDeskDB';

export interface OutboxEntry {
  docId: string;
  rowKey: string;
  op: 'put' | 'delete';
  value?: unknown;
  ts: number;
}

const recentGeneratedIds = new Set<number>();
let lastBaseMs = 0;

function randomUnder1000(): number {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
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

  constructor(dbName: string = LEGACY_DB_NAME) {
    super(dbName);
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
    // via creating hooks on classes, students, and holidays (§1.2).
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

    const assignSafeNumericId = (
      primKey: number | undefined,
      obj: { id?: number }
    ): number | undefined => {
      if (primKey === undefined && obj.id === undefined) {
        return generateSafeId();
      }
      return undefined;
    };

    this.classes.hook('creating', function (primKey, obj) {
      return assignSafeNumericId(primKey, obj);
    });
    this.students.hook('creating', function (primKey, obj) {
      return assignSafeNumericId(primKey, obj);
    });
    this.holidays.hook('creating', function (primKey, obj) {
      return assignSafeNumericId(primKey, obj);
    });
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
  db = new KruDeskDatabase(targetName);
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
    db = new KruDeskDatabase(LEGACY_DB_NAME);
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

export async function clearAllAppData(targetDb: KruDeskDatabase = db): Promise<void> {
  await targetDb.transaction(
    'rw',
    [
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
    ],
    async () => {
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
    }
  );
}
