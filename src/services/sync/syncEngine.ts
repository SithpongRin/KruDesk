import {
  collection,
  doc,
  FieldPath,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { KruDeskDatabase, OutboxEntry } from '../../db/database';
import type {
  Attendance,
  AttendanceSession,
  Holiday,
  MonthlyScore,
  SchoolClass,
  SemesterExam,
  Student,
} from '../../types/domain';
import type { CardTemplate } from '../../types/template';
import { toLocalDateKey } from '../../lib/khmerDate';
import { buildBackupPayload, type KruDeskBackupPayload } from '../backup';
import {
  listCloudSnapshots,
  MAX_CLOUD_SNAPSHOTS,
  pruneOldCloudSnapshots,
  saveBackupPayloadToCloudSnapshot,
  type CloudSnapshotMeta,
} from './cloudSnapshot';
import { compressPhotoBlobForSync, dataUrlToPhotoBlob } from './photoCompression';
import { shrinkImagesInSettingValue } from './settingImageCompression';
import {
  buildAttendanceDocEntry,
  buildAttendanceSessionDocEntry,
  buildClassDocEntry,
  buildHolidayDocEntry,
  buildMonthlyScoreDocEntry,
  buildPhotoDocEntry,
  buildSemesterExamDocEntry,
  buildSettingDocEntry,
  buildStudentDocEntry,
  buildTemplateDocEntry,
  decodeSafeKey,
  estimateJsonBytes,
  getDocApplyPriority,
  getDocKindFromId,
  isSyncedSettingKey,
  isSyncTombstone,
  makeTombstone,
  MAX_SYNC_DOC_BYTES,
  parseAttendanceAbsenceRowKey,
  parseAttendanceSessionRowKey,
  stripUndefinedDeep,
  SYNC_DEVICE_ID_KEY,
  SYNC_INITIAL_DONE_KEY,
  SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY,
  SYNC_LAST_PULLED_AT_KEY,
  SYNC_PENDING_FULL_REPLACE_KEY,
  SYNC_PENDING_PHOTOS_KEY,
  SYNC_SCHEMA_VERSION,
  type SyncAbsenceRow,
  type SyncAttendanceSessionRow,
  type SyncPhotoRow,
} from './syncCodec';

export type SyncStatusState = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

export interface SyncStatusSnapshot {
  state: SyncStatusState;
  pendingCount: number;
  lastSyncedAt: number | null;
  errorMessage: string | null;
}

export interface SyncEngineOptions {
  localDb: KruDeskDatabase;
  firestore: Firestore;
  uid: string;
  deviceId?: string;
  debounceMs?: number;
  /**
   * When true (default — safer for app runtime), blocks all push/pull/syncNow/
   * debounced pushes until `syncInitialDone === true` in local settings, preventing a silent
   * merge before the first sign-in decision (§1.6). First sign-in helpers pass an explicit
   * internal `bypassInitialSyncGuard: true` flag once the decision is made. Low-level unit/
   * emulator tests that construct SyncEngine directly without first sign-in pass `false`.
   */
  requireInitialDone?: boolean;
  /**
   * When true, `start()` (once the first sign-in is done) attaches ONE onSnapshot listener to the
   * tiny change-marker doc `users/{uid}/sync/marker` and pulls when another device pushes, plus a
   * 5-minute fallback pull while the page is visible. Default false (tests opt in explicitly).
   */
  liveUpdates?: boolean;
  /** Fallback pull interval while visible and online (default 5 minutes). */
  fallbackPullIntervalMs?: number;
  /**
   * When true, automatically saves one compressed `'daily'` Cloud snapshot on the first
   * successful sync of each local calendar day (only when online and `syncInitialDone === true`)
   * and keeps the newest `maxCloudSnapshots` (default 10). Default false (app runtime opts in).
   */
  dailySnapshots?: boolean;
  /** Maximum Cloud snapshots to keep per user when pruning after a daily snapshot (default 10). */
  maxCloudSnapshots?: number;
  /** Optional clock provider for deterministic daily-snapshot tests (defaults to `Date.now`). */
  dailySnapshotNow?: () => number;
  /** Optional test hook to override saving the daily snapshot payload. */
  saveDailySnapshot?: (
    firestore: Firestore,
    uid: string,
    payload: KruDeskBackupPayload,
    now: number
  ) => Promise<CloudSnapshotMeta>;
  onStatusChange?: (snapshot: SyncStatusSnapshot) => void;
  onError?: (khmerMessage: string) => void;
}

/** Location of the per-teacher live change marker (see firestore.rules `match /sync/{docId}`). */
export const SYNC_MARKER_COLLECTION = 'sync';
export const SYNC_MARKER_DOC_ID = 'marker';
/** Minimum gap between two pulls triggered by focus / visibility / page show. */
export const FOCUS_PULL_THROTTLE_MS = 5_000;

export interface PushOutboxOptions {
  /** Internal bypass used exclusively by the first sign-in flow after deciding Replace/Upload. */
  bypassInitialSyncGuard?: boolean;
}

export interface PushOutboxResult {
  pushedEntriesCount: number;
  pushedDocsCount: number;
  skippedOversizedDocIds: string[];
  failedPhotoDocIds: string[];
}

export interface PullChangesOptions {
  forceAll?: boolean;
  /** Internal bypass used exclusively by the first sign-in flow after deciding Pull/Replace. */
  bypassInitialSyncGuard?: boolean;
  /** Optional test/diagnostic hook invoked right before each pulled doc is applied. */
  onBeforeApplyDoc?: (docId: string) => Promise<void> | void;
}

export interface PullChangesResult {
  pulledDocsCount: number;
  requeuedCount: number;
}

interface ResolvedOutboxWrite {
  entry: OutboxEntry;
  /** Final Firestore value to write at `rows.<rowKey>` (row object or tombstone). */
  firestoreValue: unknown;
  /** If true, no cloud write is needed (e.g. stale pending photo for a deleted student); just clear outbox. */
  dropWithoutWrite?: boolean;
  /** If true, photo Blob could not be read/compressed: keep in outbox without writing or tombstoning. */
  failedPhoto?: boolean;
}

const OVERSIZED_DOC_KHMER_ERROR =
  'ទំហំទិន្នន័យលើសកំណត់ Cloud (900 KB) — សូមបង្រួមរូបភាព ឬកាត់បន្ថយទិន្នន័យ។ ទិន្នន័យផ្សេងទៀតនៅតែបន្ត sync ធម្មតា។';

const UNREADABLE_PHOTO_KHMER_ERROR =
  'មិនអាចបញ្ជូនរូបថតសិស្សខ្លះទៅ Cloud បានទេ — សូមដាក់រូបថតម្ដងទៀត។';

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function extractTimestampMs(val: unknown): number | null {
  if (!val) return null;
  if (typeof val === 'number') return val;
  if (typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof (val as { seconds?: number }).seconds === 'number') {
    const s = (val as { seconds: number }).seconds;
    const ns = (val as { nanoseconds?: number }).nanoseconds ?? 0;
    return s * 1000 + Math.floor(ns / 1_000_000);
  }
  return null;
}

function isFirestoreDocSizeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '').toLowerCase();
  const message = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    (code === 'invalid-argument' && (message.includes('size') || message.includes('exceed'))) ||
    message.includes('maximum size') ||
    message.includes('exceeds the maximum')
  );
}

async function readPendingPhotosMap(
  localDb: KruDeskDatabase
): Promise<Record<string, SyncPhotoRow>> {
  const row = await localDb.settings.get(SYNC_PENDING_PHOTOS_KEY);
  if (row?.value && typeof row.value === 'object' && !Array.isArray(row.value)) {
    return { ...(row.value as Record<string, SyncPhotoRow>) };
  }
  return {};
}

async function writePendingPhotosMap(
  localDb: KruDeskDatabase,
  map: Record<string, SyncPhotoRow>
): Promise<void> {
  if (Object.keys(map).length === 0) {
    await localDb.settings.delete(SYNC_PENDING_PHOTOS_KEY);
  } else {
    await localDb.settings.put({ key: SYNC_PENDING_PHOTOS_KEY, value: map });
  }
}

async function loadFreshPendingRowKeys(
  localDb: KruDeskDatabase,
  docId: string,
  extraPendingRowKeys?: Set<string>
): Promise<Set<string>> {
  const rows = await localDb.outbox.where('docId').equals(docId).toArray();
  const set = new Set<string>(extraPendingRowKeys ? Array.from(extraPendingRowKeys) : []);
  for (const r of rows) {
    set.add(r.rowKey);
  }
  return set;
}

/**
 * Reconstructs the current local `rows` map for a given `docId` so we can estimate the
 * WHOLE Firestore document size (existing rows + incoming outbox mutations) before pushing.
 */
async function buildCurrentLocalRowsForDoc(
  localDb: KruDeskDatabase,
  docId: string
): Promise<Record<string, unknown>> {
  const kind = getDocKindFromId(docId);
  const rows: Record<string, unknown> = {};

  switch (kind) {
    case 'setting': {
      const key = docId.slice('settings__'.length);
      if (isSyncedSettingKey(key)) {
        const setting = await localDb.settings.get(key);
        if (setting) {
          rows['v'] = buildSettingDocEntry(setting).value;
        }
      }
      return rows;
    }

    case 'class': {
      const classId = Number(docId.slice('class__'.length));
      if (Number.isFinite(classId)) {
        const cls = await localDb.classes.get(classId);
        if (cls) {
          rows[`c_${classId}`] = buildClassDocEntry({ ...cls, id: classId }).value;
        }
      }
      return rows;
    }

    case 'students': {
      const classId = Number(docId.slice('students__'.length));
      if (Number.isFinite(classId)) {
        const list = await localDb.students.where('classId').equals(classId).toArray();
        for (const s of list) {
          if (s.id !== undefined) {
            const entry = buildStudentDocEntry({ ...s, id: s.id });
            rows[entry.rowKey] = entry.value;
          }
        }
      }
      return rows;
    }

    case 'photo': {
      // Photo doc only ever holds one photo row (`p_<studentId>`), overlaid by the resolved entry.
      return rows;
    }

    case 'attendance': {
      const match = /^att__(\d+)__(\d{4}-\d{2})$/.exec(docId);
      if (!match) return rows;
      const classId = Number(match[1]);
      const month = match[2]!;
      const lowerDate = `${month}-01`;
      const upperDate = `${month}-31\uffff`;
      const [absences, sessions] = await Promise.all([
        localDb.attendance
          .where('[classId+date]')
          .between([classId, lowerDate], [classId, upperDate])
          .toArray(),
        localDb.attendanceSessions
          .where('[classId+date]')
          .between([classId, lowerDate], [classId, upperDate])
          .toArray(),
      ]);
      for (const a of absences) {
        const entry = buildAttendanceDocEntry(a);
        rows[entry.rowKey] = entry.value;
      }
      for (const s of sessions) {
        const entry = buildAttendanceSessionDocEntry(s);
        rows[entry.rowKey] = entry.value;
      }
      return rows;
    }

    case 'monthlyScores': {
      const match = /^ms__(\d+)__(\d{4}-\d{2})$/.exec(docId);
      if (!match) return rows;
      const classId = Number(match[1]);
      const month = match[2]!;
      const list = await localDb.monthlyScores
        .where('[classId+month]')
        .equals([classId, month])
        .toArray();
      for (const ms of list) {
        const entry = buildMonthlyScoreDocEntry(ms);
        rows[entry.rowKey] = entry.value;
      }
      return rows;
    }

    case 'semesterExams': {
      const match = /^se__(\d+)__([12])$/.exec(docId);
      if (!match) return rows;
      const classId = Number(match[1]);
      const semester = Number(match[2]) as 1 | 2;
      const list = await localDb.semesterExams
        .where('[classId+semester]')
        .equals([classId, semester])
        .toArray();
      for (const se of list) {
        const entry = buildSemesterExamDocEntry(se);
        rows[entry.rowKey] = entry.value;
      }
      return rows;
    }

    case 'holidays': {
      const list = await localDb.holidays.toArray();
      for (const h of list) {
        if (h.id !== undefined) {
          const entry = buildHolidayDocEntry({ ...h, id: h.id });
          rows[entry.rowKey] = entry.value;
        }
      }
      return rows;
    }

    case 'template': {
      const safeId = docId.slice('template__'.length);
      const decodedId = decodeSafeKey(safeId);
      const tpl = await localDb.templates.get(decodedId);
      if (tpl) {
        const entry = buildTemplateDocEntry(tpl);
        rows[entry.rowKey] = entry.value;
      }
      return rows;
    }
  }
}

export async function estimateFullDocBytes(
  localDb: KruDeskDatabase,
  docId: string,
  resolvedWrites: Array<{ rowKey: string; firestoreValue: unknown }>,
  deviceId: string
): Promise<number> {
  const kind = getDocKindFromId(docId);
  const rows = await buildCurrentLocalRowsForDoc(localDb, docId);
  for (const w of resolvedWrites) {
    rows[w.rowKey] = w.firestoreValue;
  }
  return estimateJsonBytes({
    kind,
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: 0,
    updatedBy: deviceId,
    rows,
  });
}

/**
 * Applies a single remote Firestore document to Dexie inside a per-transaction remote scope.
 * - Never sets any global flag: concurrent teacher edits still record into `outbox`.
 * - Reads fresh pending outbox keys inside the SAME Dexie transaction so concurrent edits are never overwritten.
 * - Deletes local rows ONLY when the remote doc contains an explicit tombstone `{ __deleted: true, ts }`.
 * - Local rows missing from the remote doc without a tombstone are preserved and re-queued into `outbox` (self-heal).
 * - Student photos arriving before their student row are stored durably in `syncPendingPhotos` until the student arrives.
 */
export async function applyRemoteDocToDexie(
  localDb: KruDeskDatabase,
  docId: string,
  rawDocData: Record<string, unknown>,
  extraPendingRowKeys?: Set<string>
): Promise<{ requeuedCount: number }> {
  const kind = getDocKindFromId(docId);
  const remoteRows =
    rawDocData.rows && typeof rawDocData.rows === 'object'
      ? (rawDocData.rows as Record<string, unknown>)
      : {};

  let requeuedCount = 0;

  switch (kind) {
    case 'setting': {
      const key = docId.slice('settings__'.length);
      if (!isSyncedSettingKey(key)) {
        return { requeuedCount: 0 };
      }

      await localDb.runRemoteTransaction([localDb.settings, localDb.outbox], async () => {
        const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
        if (pendingRowKeys.has('v')) return;

        if (!hasOwn(remoteRows, 'v')) {
          // Missing without tombstone -> self-heal if present locally
          const localSetting = await localDb.settings.get(key);
          if (localSetting) {
            const entry = buildSettingDocEntry(localSetting);
            await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
            requeuedCount++;
          }
          return;
        }

        const rawVal = remoteRows['v'];
        if (isSyncTombstone(rawVal)) {
          await localDb.settings.delete(key);
        } else if (rawVal && typeof rawVal === 'object' && hasOwn(rawVal as Record<string, unknown>, 'value')) {
          const entry = rawVal as { key?: string; value?: unknown };
          await localDb.settings.put({ key, value: entry.value });
        }
      });
      return { requeuedCount };
    }

    case 'class': {
      const classId = Number(docId.slice('class__'.length));
      if (!Number.isFinite(classId)) return { requeuedCount: 0 };
      const rowKey = `c_${classId}`;

      await localDb.runRemoteTransaction([localDb.classes, localDb.outbox], async () => {
        const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
        if (pendingRowKeys.has(rowKey)) return;

        if (!hasOwn(remoteRows, rowKey)) {
          const localCls = await localDb.classes.get(classId);
          if (localCls) {
            const entry = buildClassDocEntry({ ...localCls, id: classId });
            await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
            requeuedCount++;
          }
          return;
        }

        const rawVal = remoteRows[rowKey];
        if (isSyncTombstone(rawVal)) {
          await localDb.classes.delete(classId);
        } else if (rawVal && typeof rawVal === 'object') {
          await localDb.classes.put({ ...(rawVal as SchoolClass), id: classId });
        }
      });
      return { requeuedCount };
    }

    case 'students': {
      const classId = Number(docId.slice('students__'.length));
      if (!Number.isFinite(classId)) return { requeuedCount: 0 };

      await localDb.runRemoteTransaction(
        [localDb.students, localDb.settings, localDb.outbox],
        async () => {
          const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
          const pendingPhotos = await readPendingPhotosMap(localDb);
          let pendingPhotosDirty = false;

          const existingList = await localDb.students.where('classId').equals(classId).toArray();
          const existingById = new Map<number, Student>();
          for (const s of existingList) {
            if (s.id !== undefined) {
              existingById.set(s.id, s);
            }
          }

          for (const [rk, rawVal] of Object.entries(remoteRows)) {
            if (!rk.startsWith('s_')) continue;
            const parsedId = Number(rk.slice(2));
            const studentId =
              rawVal &&
              typeof rawVal === 'object' &&
              !isSyncTombstone(rawVal) &&
              typeof (rawVal as Student).id === 'number'
                ? (rawVal as Student).id!
                : parsedId;
            if (!Number.isFinite(studentId)) continue;

            if (pendingRowKeys.has(`s_${studentId}`)) {
              continue;
            }

            if (isSyncTombstone(rawVal)) {
              // Delete ONLY if the student is still in this class (guards class transfers)
              const localInClass = existingById.get(studentId);
              if (localInClass) {
                await localDb.students.delete(studentId);
              }
              continue;
            }

            if (!rawVal || typeof rawVal !== 'object') continue;
            const remoteStudent = rawVal as Student;
            const existing = existingById.get(studentId) ?? (await localDb.students.get(studentId));

            let photoBlob = existing?.photoBlob;
            const pendingPhotoRow = pendingPhotos[String(studentId)];
            if (pendingPhotoRow?.dataUrl) {
              const localPhotoOutbox = await localDb.outbox.get([
                `photo__${studentId}`,
                `p_${studentId}`,
              ]);
              if (!localPhotoOutbox) {
                const decoded = dataUrlToPhotoBlob(pendingPhotoRow.dataUrl);
                if (decoded) {
                  photoBlob = decoded;
                }
              }
              delete pendingPhotos[String(studentId)];
              pendingPhotosDirty = true;
            }

            await localDb.students.put({
              ...remoteStudent,
              id: studentId,
              classId,
              ...(photoBlob ? { photoBlob } : {}),
            });
          }

          // Self-heal: any local student in this class missing from remoteRows (no value & no tombstone)
          // is preserved and re-queued into outbox.
          for (const localStudent of existingList) {
            const sid = localStudent.id;
            if (sid === undefined) continue;
            const rk = `s_${sid}`;
            if (!hasOwn(remoteRows, rk) && !pendingRowKeys.has(rk)) {
              const entry = buildStudentDocEntry({ ...localStudent, id: sid });
              await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
              requeuedCount++;
            }
          }

          if (pendingPhotosDirty) {
            await writePendingPhotosMap(localDb, pendingPhotos);
          }
        }
      );
      return { requeuedCount };
    }

    case 'photo': {
      const studentId = Number(docId.slice('photo__'.length));
      if (!Number.isFinite(studentId)) return { requeuedCount: 0 };
      const rowKey = `p_${studentId}`;

      await localDb.runRemoteTransaction(
        [localDb.students, localDb.settings, localDb.outbox],
        async () => {
          const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
          if (pendingRowKeys.has(rowKey)) return;

          const student = await localDb.students.get(studentId);
          const pendingPhotos = await readPendingPhotosMap(localDb);
          let pendingPhotosDirty = false;

          if (!hasOwn(remoteRows, rowKey)) {
            // Missing without tombstone -> self-heal if student has a local photoBlob
            if (student?.photoBlob) {
              await localDb.outbox.put({
                docId,
                rowKey,
                op: 'put',
                pendingPhoto: true,
                value: { studentId, classId: student.classId },
                ts: localDb.nextOutboxTs(),
              });
              requeuedCount++;
            }
            return;
          }

          const rawVal = remoteRows[rowKey];
          if (isSyncTombstone(rawVal)) {
            if (hasOwn(pendingPhotos, String(studentId))) {
              delete pendingPhotos[String(studentId)];
              pendingPhotosDirty = true;
            }
            if (student?.photoBlob) {
              const copy = { ...student };
              delete copy.photoBlob;
              await localDb.students.put(copy);
            }
          } else if (rawVal && typeof rawVal === 'object') {
            const photoRow = rawVal as SyncPhotoRow;
            if (photoRow.dataUrl) {
              if (student) {
                const blob = dataUrlToPhotoBlob(photoRow.dataUrl);
                if (blob) {
                  await localDb.students.put({ ...student, photoBlob: blob });
                }
                if (hasOwn(pendingPhotos, String(studentId))) {
                  delete pendingPhotos[String(studentId)];
                  pendingPhotosDirty = true;
                }
              } else {
                // Student row has not been pulled/applied yet -> keep photo pending durably
                pendingPhotos[String(studentId)] = photoRow;
                pendingPhotosDirty = true;
              }
            }
          }

          if (pendingPhotosDirty) {
            await writePendingPhotosMap(localDb, pendingPhotos);
          }
        }
      );
      return { requeuedCount };
    }

    case 'attendance': {
      const match = /^att__(\d+)__(\d{4}-\d{2})$/.exec(docId);
      if (!match) return { requeuedCount: 0 };
      const classId = Number(match[1]);
      const month = match[2]!;
      const lowerDate = `${month}-01`;
      const upperDate = `${month}-31\uffff`;

      await localDb.runRemoteTransaction(
        [localDb.attendance, localDb.attendanceSessions, localDb.outbox],
        async () => {
          const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
          const [localAbsences, localSessions] = await Promise.all([
            localDb.attendance
              .where('[classId+date]')
              .between([classId, lowerDate], [classId, upperDate])
              .toArray(),
            localDb.attendanceSessions
              .where('[classId+date]')
              .between([classId, lowerDate], [classId, upperDate])
              .toArray(),
          ]);

          for (const [rk, rawVal] of Object.entries(remoteRows)) {
            if (pendingRowKeys.has(rk)) continue;

            if (isSyncTombstone(rawVal)) {
              if (rk.startsWith('a_')) {
                const parsed = parseAttendanceAbsenceRowKey(rk);
                if (parsed) {
                  await localDb.attendance.delete([classId, parsed.date, parsed.studentRef]);
                }
              } else if (rk.startsWith('sess_')) {
                const parsed = parseAttendanceSessionRowKey(rk);
                if (parsed) {
                  await localDb.attendanceSessions.delete([classId, parsed.date]);
                }
              }
              continue;
            }

            if (!rawVal || typeof rawVal !== 'object') continue;
            if (rk.startsWith('a_')) {
              const a = rawVal as SyncAbsenceRow;
              const record: Attendance = {
                classId: a.classId ?? classId,
                studentRef: a.studentRef,
                date: a.date,
                status: a.status,
              };
              await localDb.attendance.put(record);
            } else if (rk.startsWith('sess_')) {
              const s = rawVal as SyncAttendanceSessionRow;
              const record: AttendanceSession = {
                classId: s.classId ?? classId,
                date: s.date,
                savedAt: s.savedAt,
                ...(s.migrated ? { migrated: true } : {}),
              };
              await localDb.attendanceSessions.put(record);
            }
          }

          // Self-heal missing absences & sessions (never delete without tombstone)
          for (const loc of localAbsences) {
            const rk = `a_${loc.studentRef}_${loc.date.replace(/-/g, '_')}`;
            if (!hasOwn(remoteRows, rk) && !pendingRowKeys.has(rk)) {
              const entry = buildAttendanceDocEntry(loc);
              await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
              requeuedCount++;
            }
          }

          for (const locSess of localSessions) {
            const rk = `sess_${locSess.date.replace(/-/g, '_')}`;
            if (!hasOwn(remoteRows, rk) && !pendingRowKeys.has(rk)) {
              const entry = buildAttendanceSessionDocEntry(locSess);
              await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
              requeuedCount++;
            }
          }
        }
      );
      return { requeuedCount };
    }

    case 'monthlyScores': {
      const match = /^ms__(\d+)__(\d{4}-\d{2})$/.exec(docId);
      if (!match) return { requeuedCount: 0 };
      const classId = Number(match[1]);
      const month = match[2]!;

      await localDb.runRemoteTransaction([localDb.monthlyScores, localDb.outbox], async () => {
        const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
        const localRows = await localDb.monthlyScores
          .where('[classId+month]')
          .equals([classId, month])
          .toArray();

        for (const [rk, rawVal] of Object.entries(remoteRows)) {
          if (pendingRowKeys.has(rk) || !rk.startsWith('m_')) continue;
          const studentRef = Number(rk.slice(2));
          if (isSyncTombstone(rawVal)) {
            if (Number.isFinite(studentRef)) {
              await localDb.monthlyScores.delete([classId, month, studentRef]);
            }
            continue;
          }
          if (!rawVal || typeof rawVal !== 'object') continue;
          const ms = rawVal as MonthlyScore;
          await localDb.monthlyScores.put({
            ...ms,
            classId: ms.classId ?? classId,
            month: ms.month ?? month,
          });
        }

        for (const loc of localRows) {
          const rk = `m_${loc.studentRef}`;
          if (!hasOwn(remoteRows, rk) && !pendingRowKeys.has(rk)) {
            const entry = buildMonthlyScoreDocEntry(loc);
            await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
            requeuedCount++;
          }
        }
      });
      return { requeuedCount };
    }

    case 'semesterExams': {
      const match = /^se__(\d+)__([12])$/.exec(docId);
      if (!match) return { requeuedCount: 0 };
      const classId = Number(match[1]);
      const semester = Number(match[2]) as 1 | 2;

      await localDb.runRemoteTransaction([localDb.semesterExams, localDb.outbox], async () => {
        const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
        const localRows = await localDb.semesterExams
          .where('[classId+semester]')
          .equals([classId, semester])
          .toArray();

        for (const [rk, rawVal] of Object.entries(remoteRows)) {
          if (pendingRowKeys.has(rk) || !rk.startsWith('e_')) continue;
          const studentRef = Number(rk.slice(2));
          if (isSyncTombstone(rawVal)) {
            if (Number.isFinite(studentRef)) {
              await localDb.semesterExams.delete([classId, semester, studentRef]);
            }
            continue;
          }
          if (!rawVal || typeof rawVal !== 'object') continue;
          const se = rawVal as SemesterExam;
          await localDb.semesterExams.put({
            ...se,
            classId: se.classId ?? classId,
            semester: se.semester ?? semester,
          });
        }

        for (const loc of localRows) {
          const rk = `e_${loc.studentRef}`;
          if (!hasOwn(remoteRows, rk) && !pendingRowKeys.has(rk)) {
            const entry = buildSemesterExamDocEntry(loc);
            await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
            requeuedCount++;
          }
        }
      });
      return { requeuedCount };
    }

    case 'holidays': {
      await localDb.runRemoteTransaction([localDb.holidays, localDb.outbox], async () => {
        const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
        const localRows = await localDb.holidays.toArray();

        for (const [rk, rawVal] of Object.entries(remoteRows)) {
          if (pendingRowKeys.has(rk) || !rk.startsWith('h_')) continue;
          const parsedId = Number(rk.slice(2));
          if (isSyncTombstone(rawVal)) {
            if (Number.isFinite(parsedId)) {
              await localDb.holidays.delete(parsedId);
            }
            continue;
          }
          if (!rawVal || typeof rawVal !== 'object') continue;
          const h = rawVal as Holiday;
          const id = typeof h.id === 'number' ? h.id : parsedId;
          if (!Number.isFinite(id)) continue;
          await localDb.holidays.put({ ...h, id });
        }

        for (const loc of localRows) {
          if (loc.id === undefined) continue;
          const rk = `h_${loc.id}`;
          if (!hasOwn(remoteRows, rk) && !pendingRowKeys.has(rk)) {
            const entry = buildHolidayDocEntry({ ...loc, id: loc.id });
            await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
            requeuedCount++;
          }
        }
      });
      return { requeuedCount };
    }

    case 'template': {
      const safeId = docId.slice('template__'.length);
      const rk = `t_${safeId}`;
      const decodedId = decodeSafeKey(safeId);

      await localDb.runRemoteTransaction([localDb.templates, localDb.outbox], async () => {
        const pendingRowKeys = await loadFreshPendingRowKeys(localDb, docId, extraPendingRowKeys);
        if (pendingRowKeys.has(rk)) return;

        if (!hasOwn(remoteRows, rk)) {
          const localTpl = await localDb.templates.get(decodedId);
          if (localTpl) {
            const entry = buildTemplateDocEntry(localTpl);
            await localDb.outbox.put({ ...entry, op: 'put', ts: localDb.nextOutboxTs() });
            requeuedCount++;
          }
          return;
        }

        const rawVal = remoteRows[rk];
        if (isSyncTombstone(rawVal)) {
          await localDb.templates.delete(decodedId);
        } else if (rawVal && typeof rawVal === 'object' && (rawVal as CardTemplate).id) {
          await localDb.templates.put(rawVal as CardTemplate);
        }
      });
      return { requeuedCount };
    }
  }
}

/**
 * Builds the complete map `docId -> (rowKey -> value)` representing all synced rows currently
 * in local Dexie (compressing any student photos on demand). Used by `pushFullReplace()`.
 * Unreadable photo Blobs are skipped per-student and reported in `failedPhotoDocIds` so they
 * never abort the full replace or block other documents.
 */
async function buildFullLocalDocMap(
  localDb: KruDeskDatabase,
  ts: number
): Promise<{ docs: Map<string, Map<string, unknown>>; failedPhotoDocIds: string[] }> {
  const docs = new Map<string, Map<string, unknown>>();
  const failedPhotoDocIds: string[] = [];
  const putRow = (docId: string, rowKey: string, value: unknown) => {
    let rows = docs.get(docId);
    if (!rows) {
      rows = new Map<string, unknown>();
      docs.set(docId, rows);
    }
    rows.set(rowKey, stripUndefinedDeep(value));
  };

  const [
    settings,
    classes,
    students,
    attendance,
    attendanceSessions,
    holidays,
    monthlyScores,
    semesterExams,
    templates,
  ] = await Promise.all([
    localDb.settings.toArray(),
    localDb.classes.toArray(),
    localDb.students.toArray(),
    localDb.attendance.toArray(),
    localDb.attendanceSessions.toArray(),
    localDb.holidays.toArray(),
    localDb.monthlyScores.toArray(),
    localDb.semesterExams.toArray(),
    localDb.templates.toArray(),
  ]);

  for (const s of settings) {
    if (!isSyncedSettingKey(s.key)) continue;
    const entry = buildSettingDocEntry(s);
    putRow(entry.docId, entry.rowKey, await shrinkImagesInSettingValue(entry.value));
  }

  for (const cls of classes) {
    if (cls.id === undefined) continue;
    const entry = buildClassDocEntry({ ...cls, id: cls.id });
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  for (const st of students) {
    if (st.id === undefined) continue;
    const entry = buildStudentDocEntry({ ...st, id: st.id });
    putRow(entry.docId, entry.rowKey, entry.value);
    if (st.photoBlob) {
      try {
        const dataUrl = await compressPhotoBlobForSync(st.photoBlob);
        if (!dataUrl || !dataUrl.startsWith('data:')) {
          throw new Error('Empty or invalid photo data URL');
        }
        const photoEntry = buildPhotoDocEntry(st.id, st.classId, dataUrl, ts);
        putRow(photoEntry.docId, photoEntry.rowKey, photoEntry.value);
      } catch (err) {
        console.error(`[SyncEngine] Failed to read photo during full replace for student ${st.id}:`, err);
        failedPhotoDocIds.push(`photo__${st.id}`);
      }
    }
  }

  for (const a of attendance) {
    const entry = buildAttendanceDocEntry(a);
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  for (const sess of attendanceSessions) {
    const entry = buildAttendanceSessionDocEntry(sess);
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  for (const h of holidays) {
    if (h.id === undefined) continue;
    const entry = buildHolidayDocEntry({ ...h, id: h.id });
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  for (const ms of monthlyScores) {
    const entry = buildMonthlyScoreDocEntry(ms);
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  for (const se of semesterExams) {
    const entry = buildSemesterExamDocEntry(se);
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  for (const tpl of templates) {
    const entry = buildTemplateDocEntry(tpl);
    putRow(entry.docId, entry.rowKey, entry.value);
  }

  return { docs, failedPhotoDocIds };
}

export class SyncEngine {
  private readonly localDb: KruDeskDatabase;
  private readonly firestore: Firestore;
  private readonly uid: string;
  private deviceId: string;
  private readonly debounceMs: number;
  private readonly requireInitialDone: boolean;
  private readonly onStatusChange?: (snapshot: SyncStatusSnapshot) => void;
  private readonly onError?: (khmerMessage: string) => void;

  private offlineMode = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubOutboxHook: (() => void) | null = null;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private isSyncing = false;
  private lastFocusPullAt = 0;
  private readonly liveUpdates: boolean;
  private readonly fallbackPullIntervalMs: number;
  private readonly dailySnapshots: boolean;
  private readonly maxCloudSnapshots: number;
  private readonly dailySnapshotNow: () => number;
  private readonly saveDailySnapshotFn?: (
    firestore: Firestore,
    uid: string,
    payload: KruDeskBackupPayload,
    now: number
  ) => Promise<CloudSnapshotMeta>;
  private stopped = false;
  private dailySnapshotInFlight: Promise<CloudSnapshotMeta | null> | null = null;
  private markerUnsub: (() => void) | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private remotePullTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cached flag once `syncInitialDone === true` has been verified from IndexedDB. */
  private initialSyncConfirmed = false;
  /** Single-flight promise chain so push/pull/full-replace operations never overlap. */
  private opChain: Promise<unknown> = Promise.resolve();

  constructor(options: SyncEngineOptions) {
    this.localDb = options.localDb;
    this.firestore = options.firestore;
    this.uid = options.uid;
    this.deviceId = options.deviceId || `dev_${Math.random().toString(36).slice(2, 10)}`;
    this.debounceMs = options.debounceMs ?? 2000;
    this.requireInitialDone = options.requireInitialDone ?? true;
    this.liveUpdates = options.liveUpdates ?? false;
    this.fallbackPullIntervalMs = options.fallbackPullIntervalMs ?? 5 * 60_000;
    this.dailySnapshots = options.dailySnapshots ?? false;
    this.maxCloudSnapshots = options.maxCloudSnapshots ?? MAX_CLOUD_SNAPSHOTS;
    this.dailySnapshotNow = options.dailySnapshotNow ?? (() => Date.now());
    this.saveDailySnapshotFn = options.saveDailySnapshot;
    this.onStatusChange = options.onStatusChange;
    this.onError = options.onError;
  }

  private async isBlockedByInitialSync(bypass?: boolean): Promise<boolean> {
    if (!this.requireInitialDone || bypass) return false;
    if (!this.localDb.isOpen()) return true;
    const row = await this.localDb.settings.get(SYNC_INITIAL_DONE_KEY);
    const done = row?.value === true;
    this.initialSyncConfirmed = done;
    return !done;
  }

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opChain.then(fn, fn);
    this.opChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Simulates or sets offline mode on this client.
   * When going back online (`offline = false`), automatically pushes pending outbox and pulls changes.
   */
  setOffline(offline: boolean): void {
    const wasOffline = this.offlineMode;
    this.offlineMode = offline;
    if (offline) {
      this.clearDebounceTimer();
      void this.emitStatus();
    } else if (wasOffline) {
      if (this.requireInitialDone && !this.initialSyncConfirmed) {
        void this.emitStatus();
        return;
      }
      void this.syncNow();
    }
  }

  isOffline(): boolean {
    if (this.offlineMode) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return false;
  }

  async start(options?: { skipInitialSync?: boolean }): Promise<void> {
    this.stopped = false;
    await this.localDb.runRemoteTransaction([this.localDb.settings], async () => {
      const saved = await this.localDb.settings.get(SYNC_DEVICE_ID_KEY);
      if (typeof saved?.value === 'string' && saved.value) {
        this.deviceId = saved.value;
      } else {
        await this.localDb.settings.put({ key: SYNC_DEVICE_ID_KEY, value: this.deviceId });
      }
    });

    if (this.requireInitialDone) {
      const initRow = await this.localDb.settings.get(SYNC_INITIAL_DONE_KEY);
      this.initialSyncConfirmed = initRow?.value === true;
    }

    if (!this.unsubOutboxHook) {
      this.unsubOutboxHook = this.localDb.onOutboxQueued(() => {
        this.scheduleDebouncedPush();
      });
    }

    // Live updates only once the first sign-in decision is done (never before — §1.6 guard).
    if (this.liveUpdates && (!this.requireInitialDone || this.initialSyncConfirmed)) {
      this.startLiveUpdates();
    }

    if (options?.skipInitialSync) {
      await this.emitStatus();
      return;
    }

    await this.syncNow();
  }

  stop(): void {
    this.stopped = true;
    this.clearDebounceTimer();
    if (this.unsubOutboxHook) {
      this.unsubOutboxHook();
      this.unsubOutboxHook = null;
    }
    this.stopLiveUpdates();
  }

  /**
   * Runs at most one daily Cloud snapshot per local calendar day (`YYYY-MM-DD`, UTC+7 safe)
   * when online and `syncInitialDone === true`.
   * - Checks existing Cloud snapshots in ONE list query so a second device on the same day
   *   does not write a duplicate daily snapshot, and reuses the same list to prune snapshots
   *   beyond `maxCloudSnapshots` (default 10, deleting both metadata and chunk docs).
   * - Never throws or fails normal sync; logs errors and marks today so it retries tomorrow.
   */
  async runDailySnapshotIfDue(now: number = this.dailySnapshotNow()): Promise<CloudSnapshotMeta | null> {
    if (this.stopped || this.isOffline() || !this.localDb.isOpen()) {
      return null;
    }

    if (this.dailySnapshotInFlight) {
      return this.dailySnapshotInFlight;
    }

    const todayKey = toLocalDateKey(new Date(now));

    const recordTodayLocally = async () => {
      if (this.stopped || !this.localDb.isOpen()) return;
      await this.localDb.runRemoteTransaction([this.localDb.settings], async () => {
        await this.localDb.settings.put({
          key: SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY,
          value: todayKey,
        });
      });
    };

    const task = (async (): Promise<CloudSnapshotMeta | null> => {
      try {
        const [initRow, lastDayRow] = await Promise.all([
          this.localDb.settings.get(SYNC_INITIAL_DONE_KEY),
          this.localDb.settings.get(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY),
        ]);
        if (this.stopped || !this.localDb.isOpen() || this.isOffline()) {
          return null;
        }
        if (initRow?.value !== true) {
          return null;
        }
        if (lastDayRow?.value === todayKey) {
          return null;
        }

        // 1. One query to see existing snapshots (prevents duplicate daily snapshots across devices
        //    AND provides the list for pruning without a second query).
        const existing = await listCloudSnapshots(this.firestore, this.uid);
        if (this.stopped || !this.localDb.isOpen()) return null;

        const alreadyTakenToday = existing.some(
          (snap) => snap.source === 'daily' && toLocalDateKey(new Date(snap.createdAt)) === todayKey
        );

        if (alreadyTakenToday) {
          if (existing.length > this.maxCloudSnapshots) {
            try {
              await pruneOldCloudSnapshots(
                this.firestore,
                this.uid,
                this.maxCloudSnapshots,
                existing
              );
            } catch (pruneErr) {
              console.warn('[SyncEngine] Failed to prune old cloud snapshots:', pruneErr);
            }
          }
          await recordTodayLocally();
          return null;
        }

        // 2. Build local backup payload (excludes internal sync keys) & upload gzipped chunks
        const payload = await buildBackupPayload(now, this.localDb);
        if (this.stopped || !this.localDb.isOpen()) return null;

        const savedMeta = this.saveDailySnapshotFn
          ? await this.saveDailySnapshotFn(this.firestore, this.uid, payload, now)
          : await saveBackupPayloadToCloudSnapshot(this.firestore, this.uid, payload, 'daily', {
              now,
            });

        // 3. Keep only the newest maxCloudSnapshots (default 10), deleting old meta + chunks
        try {
          await pruneOldCloudSnapshots(this.firestore, this.uid, this.maxCloudSnapshots, [
            savedMeta,
            ...existing,
          ]);
        } catch (pruneErr) {
          console.warn('[SyncEngine] Failed to prune old cloud snapshots:', pruneErr);
        }

        await recordTodayLocally();
        return savedMeta;
      } catch (err) {
        console.warn(
          '[SyncEngine] Daily cloud snapshot failed (normal sync unaffected; will try again tomorrow):',
          err
        );
        if (!this.stopped && this.localDb.isOpen() && !this.isOffline()) {
          try {
            await recordTodayLocally();
          } catch {
            /* ignore local write error on failure */
          }
        }
        return null;
      }
    })();

    this.dailySnapshotInFlight = task;
    try {
      return await task;
    } finally {
      if (this.dailySnapshotInFlight === task) {
        this.dailySnapshotInFlight = null;
      }
    }
  }

  /**
   * Fire-and-forget trigger for the background daily snapshot after a successful sync.
   * Never blocks or rejects normal sync operations.
   */
  triggerDailySnapshotIfDue(): void {
    if (
      !this.dailySnapshots ||
      this.stopped ||
      this.isOffline() ||
      !this.localDb.isOpen() ||
      this.dailySnapshotInFlight
    ) {
      return;
    }
    void this.runDailySnapshotIfDue(this.dailySnapshotNow()).catch(() => {});
  }

  /** Awaits any currently running background daily snapshot (helper for deterministic tests). */
  async waitForPendingDailySnapshot(): Promise<void> {
    if (this.dailySnapshotInFlight) {
      await this.dailySnapshotInFlight;
    }
  }

  /** True while the change-marker listener is attached (exposed for tests / diagnostics). */
  isLiveUpdatesActive(): boolean {
    return this.markerUnsub !== null;
  }

  private markerRef() {
    return doc(this.firestore, 'users', this.uid, SYNC_MARKER_COLLECTION, SYNC_MARKER_DOC_ID);
  }

  /**
   * Attaches ONE onSnapshot listener to `users/{uid}/sync/marker` (1 read per remote change)
   * and a fallback pull every `fallbackPullIntervalMs` while the page is visible and online.
   * Idempotent.
   */
  startLiveUpdates(): void {
    if (!this.markerUnsub) {
      this.markerUnsub = onSnapshot(
        this.markerRef(),
        (snap) => {
          if (snap.metadata.fromCache || snap.metadata.hasPendingWrites || !snap.exists()) return;
          const by = snap.get('updatedBy');
          if (by === this.deviceId) return; // our own push — nothing new to pull
          this.scheduleRemotePull();
        },
        (err) => {
          console.warn('[SyncEngine] Change-marker listener error:', err);
          this.markerUnsub = null; // fallback timer / focus pulls keep working
        }
      );
    }
    if (!this.fallbackTimer && this.fallbackPullIntervalMs > 0) {
      this.fallbackTimer = setInterval(() => {
        const visible =
          typeof document === 'undefined' || document.visibilityState === 'visible';
        if (visible && !this.isOffline()) {
          void this.pullChanges().catch(() => {});
        }
      }, this.fallbackPullIntervalMs);
    }
  }

  stopLiveUpdates(): void {
    if (this.markerUnsub) {
      this.markerUnsub();
      this.markerUnsub = null;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.remotePullTimer) {
      clearTimeout(this.remotePullTimer);
      this.remotePullTimer = null;
    }
  }

  /** Coalesces bursts of marker snapshots into a single pull. */
  private scheduleRemotePull(): void {
    if (this.remotePullTimer) return;
    this.remotePullTimer = setTimeout(() => {
      this.remotePullTimer = null;
      void this.pullChanges().catch(() => {});
    }, 300);
  }

  /**
   * Best-effort, fire-and-forget bump of the change marker after a successful push so other
   * devices' listeners pull. Never blocks or fails the push (data is already committed).
   */
  private touchChangeMarker(): void {
    void setDoc(this.markerRef(), {
      updatedAt: serverTimestamp(),
      updatedBy: this.deviceId,
    }).catch((err) => {
      console.warn('[SyncEngine] Could not update change marker:', err);
    });
  }

  scheduleDebouncedPush(): void {
    if (this.isOffline()) {
      void this.emitStatus();
      return;
    }
    if (this.requireInitialDone && !this.initialSyncConfirmed) {
      void this.emitStatus();
      return;
    }
    this.clearDebounceTimer();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.pushOutbox();
    }, this.debounceMs);
    void this.emitStatus();
  }

  async getPendingOutboxCount(): Promise<number> {
    if (!this.localDb.isOpen()) return 0;
    return this.localDb.outbox.count();
  }

  private async emitStatus(overrideState?: SyncStatusState): Promise<void> {
    const pendingCount = await this.getPendingOutboxCount();
    let state: SyncStatusState = overrideState ?? 'synced';
    if (!overrideState) {
      if (this.isOffline()) {
        state = 'offline';
      } else if (this.isSyncing) {
        state = 'syncing';
      } else if (this.lastError) {
        state = 'error';
      } else if (pendingCount > 0) {
        state = 'pending';
      } else {
        state = 'synced';
      }
    }
    this.onStatusChange?.({
      state,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.lastError,
    });
  }

  private async resolveOutboxEntry(entry: OutboxEntry): Promise<ResolvedOutboxWrite> {
    if (entry.op === 'delete') {
      return {
        entry,
        firestoreValue: makeTombstone(entry.ts),
      };
    }

    if (entry.pendingPhoto) {
      const meta = entry.value as { studentId?: number; classId?: number } | undefined;
      const studentId =
        typeof meta?.studentId === 'number'
          ? meta.studentId
          : Number(entry.docId.slice('photo__'.length));
      const student = Number.isFinite(studentId)
        ? await this.localDb.students.get(studentId)
        : undefined;

      if (!student) {
        return {
          entry,
          firestoreValue: makeTombstone(entry.ts),
          dropWithoutWrite: true,
        };
      }
      if (!student.photoBlob) {
        return {
          entry,
          firestoreValue: makeTombstone(entry.ts),
        };
      }

      try {
        const dataUrl = await compressPhotoBlobForSync(student.photoBlob);
        if (!dataUrl || !dataUrl.startsWith('data:')) {
          throw new Error('Empty or invalid photo data URL');
        }
        const photoEntry = buildPhotoDocEntry(studentId, student.classId, dataUrl, entry.ts);
        return {
          entry,
          firestoreValue: stripUndefinedDeep(photoEntry.value),
        };
      } catch (err) {
        console.error(
          `[SyncEngine] Failed to read/compress photo for student ${studentId}:`,
          err
        );
        return {
          entry,
          firestoreValue: undefined,
          failedPhoto: true,
        };
      }
    }

    // Stamp / signature / border images can exceed the Cloud doc limit: send a smaller copy
    // (the original stays on this device). See settingImageCompression.ts.
    const value = entry.docId.startsWith('settings__')
      ? await shrinkImagesInSettingValue(entry.value)
      : entry.value;
    return {
      entry,
      firestoreValue: stripUndefinedDeep(value),
    };
  }

  private addDocWritesToBatch(
    batch: ReturnType<typeof writeBatch>,
    docId: string,
    writes: Array<{ rowKey: string; firestoreValue: unknown }>
  ): void {
    const kind = getDocKindFromId(docId);
    const docRef = doc(this.firestore, 'users', this.uid, 'docs', docId);

    // 1. Ensure document exists with top-level metadata without overwriting existing `rows`
    batch.set(
      docRef,
      {
        kind,
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
        updatedBy: this.deviceId,
      },
      { merge: true }
    );

    // 2. Apply field-level updates to `rows.<rowKey>` (values or tombstones)
    const updateArgs: unknown[] = [
      'kind',
      kind,
      'schemaVersion',
      SYNC_SCHEMA_VERSION,
      'updatedAt',
      serverTimestamp(),
      'updatedBy',
      this.deviceId,
    ];
    for (const w of writes) {
      updateArgs.push(new FieldPath('rows', w.rowKey), w.firestoreValue);
    }

    batch.update(
      docRef,
      updateArgs[0] as string,
      updateArgs[1],
      ...(updateArgs.slice(2) as [])
    );
  }

  private async deleteCommittedOutboxEntries(committedEntries: OutboxEntry[]): Promise<void> {
    if (committedEntries.length === 0) return;
    await this.localDb.transaction('rw', this.localDb.outbox, async () => {
      for (const pushed of committedEntries) {
        const current = await this.localDb.outbox.get([pushed.docId, pushed.rowKey]);
        if (current && current.ts <= pushed.ts) {
          await this.localDb.outbox.delete([pushed.docId, pushed.rowKey]);
        }
      }
    });
  }

  /**
   * Replaces cloud documents to match current local Dexie state as a whole:
   * - Tombstones every remote cloud row that no longer exists locally.
   * - Uploads every current local synced row (including compressed student photos).
   * Used after restore ('replace') or «លុបទិន្នន័យទាំងអស់» (`syncToCloud: true`).
   */
  pushFullReplace(options?: PushOutboxOptions): Promise<PushOutboxResult> {
    return this.runSerialized(() => this._pushFullReplaceInternal(options)).then((res) => {
      this.triggerDailySnapshotIfDue();
      return res;
    });
  }

  private async _pushFullReplaceInternal(options?: PushOutboxOptions): Promise<PushOutboxResult> {
    this.clearDebounceTimer();
    if (!this.localDb.isOpen()) {
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }
    if (await this.isBlockedByInitialSync(options?.bypassInitialSyncGuard)) {
      await this.emitStatus();
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }
    if (this.isOffline()) {
      await this.emitStatus('offline');
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.emitStatus('syncing');

    const skippedOversizedDocIds: string[] = [];
    let failedPhotoDocIds: string[] = [];
    let pushedEntriesCount = 0;
    let pushedDocsCount = 0;

    try {
      const replaceTs = this.localDb.nextOutboxTs();
      const pendingFlagRow = await this.localDb.settings.get(SYNC_PENDING_FULL_REPLACE_KEY);
      const pendingFlagVal = pendingFlagRow?.value;

      // 1. Snapshot all desired local rows + all existing cloud docs
      const [localResult, remoteSnap] = await Promise.all([
        buildFullLocalDocMap(this.localDb, replaceTs),
        getDocs(collection(this.firestore, 'users', this.uid, 'docs')),
      ]);
      const localDocsMap = localResult.docs;
      failedPhotoDocIds = localResult.failedPhotoDocIds;
      const failedPhotoSet = new Set(failedPhotoDocIds);
      if (failedPhotoDocIds.length > 0) {
        this.lastError = UNREADABLE_PHOTO_KHMER_ERROR;
        this.onError?.(UNREADABLE_PHOTO_KHMER_ERROR);
      }

      // 2. Build the union of doc updates:
      //    - remote non-tombstone rows missing locally -> tombstone (skip unreadable local photos!)
      //    - all current local rows -> put
      const writesByDoc = new Map<string, Array<{ rowKey: string; firestoreValue: unknown }>>();
      const pushWrite = (docId: string, rowKey: string, firestoreValue: unknown) => {
        let list = writesByDoc.get(docId);
        if (!list) {
          list = [];
          writesByDoc.set(docId, list);
        }
        list.push({ rowKey, firestoreValue });
      };

      for (const remoteDoc of remoteSnap.docs) {
        const docId = remoteDoc.id;
        if (failedPhotoSet.has(docId)) {
          // Do not tombstone an existing cloud photo when the local photo Blob could not be read
          continue;
        }
        const data = remoteDoc.data() as Record<string, unknown>;
        const remoteRows =
          data.rows && typeof data.rows === 'object'
            ? (data.rows as Record<string, unknown>)
            : {};
        const localRows = localDocsMap.get(docId);

        for (const [rk, rawVal] of Object.entries(remoteRows)) {
          if (isSyncTombstone(rawVal)) continue;
          if (!localRows || !localRows.has(rk)) {
            pushWrite(docId, rk, makeTombstone(replaceTs));
          }
        }
      }

      for (const [docId, localRows] of localDocsMap.entries()) {
        for (const [rk, val] of localRows.entries()) {
          pushWrite(docId, rk, val);
        }
      }

      const docGroups = Array.from(writesByDoc.entries());
      const CHUNK_SIZE = 200;

      for (let i = 0; i < docGroups.length; i += CHUNK_SIZE) {
        const slice = docGroups.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(this.firestore);
        const batchDocs: Array<{
          docId: string;
          writes: Array<{ rowKey: string; firestoreValue: unknown }>;
        }> = [];

        for (const [docId, writes] of slice) {
          const totalBytes = await estimateFullDocBytes(
            this.localDb,
            docId,
            writes,
            this.deviceId
          );
          if (totalBytes > MAX_SYNC_DOC_BYTES) {
            console.error(
              `[SyncEngine] Full replace doc ${docId} exceeds ${MAX_SYNC_DOC_BYTES} bytes (${totalBytes})`
            );
            this.lastError = OVERSIZED_DOC_KHMER_ERROR;
            this.onError?.(OVERSIZED_DOC_KHMER_ERROR);
            skippedOversizedDocIds.push(docId);
            continue;
          }

          this.addDocWritesToBatch(batch, docId, writes);
          batchDocs.push({ docId, writes });
        }

        if (batchDocs.length > 0) {
          await batch.commit();
          pushedDocsCount += batchDocs.length;
          for (const d of batchDocs) {
            pushedEntriesCount += d.writes.length;
          }
        }
      }

      // Clear outbox entries from <= replaceTs for docs that were NOT skipped (oversized/unreadable),
      // and clear the pending full-replace flag if it was not overwritten by a newer replace.
      const keepInOutboxSet = new Set([...skippedOversizedDocIds, ...failedPhotoDocIds]);
      await this.localDb.runRemoteTransaction(
        [this.localDb.outbox, this.localDb.settings],
        async () => {
          const allOutbox = await this.localDb.outbox.toArray();
          for (const entry of allOutbox) {
            if (!keepInOutboxSet.has(entry.docId) && entry.ts <= replaceTs) {
              await this.localDb.outbox.delete([entry.docId, entry.rowKey]);
            }
          }
          if (skippedOversizedDocIds.length === 0) {
            const latestFlag = await this.localDb.settings.get(SYNC_PENDING_FULL_REPLACE_KEY);
            if (latestFlag && latestFlag.value === pendingFlagVal) {
              await this.localDb.settings.delete(SYNC_PENDING_FULL_REPLACE_KEY);
            }
          }
        }
      );

      this.lastSyncedAt = Date.now();
      if (pushedEntriesCount > 0 || pushedDocsCount > 0) this.touchChangeMarker();
      return {
        pushedEntriesCount,
        pushedDocsCount,
        skippedOversizedDocIds,
        failedPhotoDocIds,
      };
    } catch (err) {
      this.lastError =
        err instanceof Error ? err.message : 'មិនអាចបញ្ជូនទិន្នន័យទៅ Cloud បានទេ។';
      throw err;
    } finally {
      this.isSyncing = false;
      await this.emitStatus();
    }
  }

  /**
   * Pushes all pending local outbox entries to Firestore `users/{uid}/docs/{docId}`
   * using field-level updates (`new FieldPath('rows', rowKey)`) and tombstones `{ __deleted: true, ts }`.
   * - Compresses `pendingPhoto` entries on demand from `students.photoBlob`; an unreadable photo
   *   stays in outbox with a Khmer error and never blocks other entries or docs.
   * - Checks the WHOLE document size (existing rows + incoming writes) against 900 KB;
   *   oversized docs are kept in outbox (never dropped) with a Khmer error and do not block other docs.
   */
  pushOutbox(options?: PushOutboxOptions): Promise<PushOutboxResult> {
    return this.runSerialized(() => this._pushOutboxInternal(options)).then((res) => {
      this.triggerDailySnapshotIfDue();
      return res;
    });
  }

  private async _pushOutboxInternal(options?: PushOutboxOptions): Promise<PushOutboxResult> {
    this.clearDebounceTimer();
    if (!this.localDb.isOpen()) {
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }

    if (await this.isBlockedByInitialSync(options?.bypassInitialSyncGuard)) {
      await this.emitStatus();
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }

    if (this.isOffline()) {
      await this.emitStatus('offline');
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }

    const pendingFullReplace = await this.localDb.settings.get(SYNC_PENDING_FULL_REPLACE_KEY);
    if (pendingFullReplace) {
      return this._pushFullReplaceInternal(options);
    }

    const entries = await this.localDb.outbox.toArray();
    if (entries.length === 0) {
      await this.emitStatus();
      return {
        pushedEntriesCount: 0,
        pushedDocsCount: 0,
        skippedOversizedDocIds: [],
        failedPhotoDocIds: [],
      };
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.emitStatus('syncing');

    const skippedOversizedDocIds: string[] = [];
    const failedPhotoDocIds: string[] = [];
    let photoErrorReported = false;

    try {
      // Group entries by docId
      const byDocId = new Map<string, OutboxEntry[]>();
      for (const entry of entries) {
        const list = byDocId.get(entry.docId) ?? [];
        list.push(entry);
        byDocId.set(entry.docId, list);
      }

      const docGroups = Array.from(byDocId.entries());
      let pushedEntriesCount = 0;
      let pushedDocsCount = 0;

      // Each doc uses 2 ops in writeBatch (set merge + field-level update), so chunk by 200 docs (<= 400 ops)
      const CHUNK_SIZE = 200;
      for (let i = 0; i < docGroups.length; i += CHUNK_SIZE) {
        const slice = docGroups.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(this.firestore);
        const batchPrepared: Array<{
          docId: string;
          writes: Array<{ rowKey: string; firestoreValue: unknown }>;
          entries: OutboxEntry[];
        }> = [];
        const droppedEntries: OutboxEntry[] = [];

        for (const [docId, docEntries] of slice) {
          const resolvedList = await Promise.all(
            docEntries.map((entry) =>
              this.resolveOutboxEntry(entry).catch((err): ResolvedOutboxWrite => {
                console.error(
                  `[SyncEngine] Failed to resolve outbox entry ${entry.docId}/${entry.rowKey}:`,
                  err
                );
                return {
                  entry,
                  firestoreValue: undefined,
                  failedPhoto: true,
                };
              })
            )
          );

          const activeResolved: ResolvedOutboxWrite[] = [];
          for (const r of resolvedList) {
            if (r.failedPhoto) {
              // Keep failed photo entry in outbox (do NOT drop, do NOT tombstone)
              failedPhotoDocIds.push(r.entry.docId);
              this.lastError = UNREADABLE_PHOTO_KHMER_ERROR;
              if (!photoErrorReported) {
                photoErrorReported = true;
                this.onError?.(UNREADABLE_PHOTO_KHMER_ERROR);
              }
            } else if (r.dropWithoutWrite) {
              droppedEntries.push(r.entry);
            } else {
              activeResolved.push(r);
            }
          }

          if (activeResolved.length === 0) {
            continue;
          }

          const writes = activeResolved.map((r) => ({
            rowKey: r.entry.rowKey,
            firestoreValue: r.firestoreValue,
          }));

          // Check WHOLE document size (all existing local rows + new writes + metadata <= 900 KB)
          const totalBytes = await estimateFullDocBytes(
            this.localDb,
            docId,
            writes,
            this.deviceId
          );
          if (totalBytes > MAX_SYNC_DOC_BYTES) {
            console.error(
              `[SyncEngine] Document ${docId} exceeds ${MAX_SYNC_DOC_BYTES} bytes (${totalBytes})`
            );
            this.lastError = OVERSIZED_DOC_KHMER_ERROR;
            this.onError?.(OVERSIZED_DOC_KHMER_ERROR);
            skippedOversizedDocIds.push(docId);
            // Keep oversized entries in outbox (never silently drop them!) and continue with other docs
            continue;
          }

          this.addDocWritesToBatch(batch, docId, writes);
          batchPrepared.push({
            docId,
            writes,
            entries: activeResolved.map((r) => r.entry),
          });
        }

        if (droppedEntries.length > 0) {
          await this.deleteCommittedOutboxEntries(droppedEntries);
        }

        if (batchPrepared.length > 0) {
          try {
            await batch.commit();
            const committedEntries = batchPrepared.flatMap((d) => d.entries);
            pushedEntriesCount += committedEntries.length;
            pushedDocsCount += batchPrepared.length;
            await this.deleteCommittedOutboxEntries(committedEntries);
          } catch (batchErr) {
            if (isFirestoreDocSizeError(batchErr)) {
              // Isolate oversized doc(s) so other docs in the same chunk still succeed
              for (const item of batchPrepared) {
                const singleBatch = writeBatch(this.firestore);
                this.addDocWritesToBatch(singleBatch, item.docId, item.writes);
                try {
                  await singleBatch.commit();
                  pushedEntriesCount += item.entries.length;
                  pushedDocsCount++;
                  await this.deleteCommittedOutboxEntries(item.entries);
                } catch (singleErr) {
                  if (isFirestoreDocSizeError(singleErr)) {
                    this.lastError = OVERSIZED_DOC_KHMER_ERROR;
                    this.onError?.(OVERSIZED_DOC_KHMER_ERROR);
                    skippedOversizedDocIds.push(item.docId);
                  } else {
                    throw singleErr;
                  }
                }
              }
            } else {
              throw batchErr;
            }
          }
        }
      }

      this.lastSyncedAt = Date.now();
      if (pushedEntriesCount > 0 || pushedDocsCount > 0) this.touchChangeMarker();
      return {
        pushedEntriesCount,
        pushedDocsCount,
        skippedOversizedDocIds,
        failedPhotoDocIds,
      };
    } catch (err) {
      this.lastError =
        err instanceof Error ? err.message : 'មិនអាចបញ្ជូនទិន្នន័យទៅ Cloud បានទេ។';
      throw err;
    } finally {
      this.isSyncing = false;
      await this.emitStatus();
    }
  }

  /**
   * Pulls changed documents from Firestore (`updatedAt >= lastPulledAt - 2ms`) and applies them
   * to Dexie in dependency order (`class -> students -> photo -> others`), preserving unpushed
   * local outbox entries and self-healing any local rows missing from cloud docs without tombstones.
   */
  pullChanges(options?: PullChangesOptions): Promise<PullChangesResult> {
    return this.runSerialized(() => this._pullChangesInternal(options)).then((res) => {
      this.triggerDailySnapshotIfDue();
      return res;
    });
  }

  private async _pullChangesInternal(options?: PullChangesOptions): Promise<PullChangesResult> {
    if (!this.localDb.isOpen() || this.isOffline()) {
      await this.emitStatus();
      return { pulledDocsCount: 0, requeuedCount: 0 };
    }
    if (await this.isBlockedByInitialSync(options?.bypassInitialSyncGuard)) {
      await this.emitStatus();
      return { pulledDocsCount: 0, requeuedCount: 0 };
    }

    this.isSyncing = true;
    await this.emitStatus('syncing');

    try {
      const savedLastPulledRow = await this.localDb.settings.get(SYNC_LAST_PULLED_AT_KEY);
      const lastPulledAtMs =
        options?.forceAll === true || typeof savedLastPulledRow?.value !== 'number'
          ? 0
          : savedLastPulledRow.value;

      const docsCol = collection(this.firestore, 'users', this.uid, 'docs');
      const q =
        lastPulledAtMs > 0
          ? query(
              docsCol,
              where('updatedAt', '>=', Timestamp.fromMillis(Math.max(0, lastPulledAtMs - 2))),
              orderBy('updatedAt', 'asc')
            )
          : query(docsCol, orderBy('updatedAt', 'asc'));

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        this.lastSyncedAt = Date.now();
        return { pulledDocsCount: 0, requeuedCount: 0 };
      }

      // Compute maxUpdatedAtMs from all returned docs and sort by dependency priority:
      // class -> students -> photo -> others (preserving updatedAt order within each priority)
      let maxUpdatedAtMs = lastPulledAtMs;
      const orderedDocs = snapshot.docs
        .map((docSnap, index) => {
          const data = docSnap.data() as Record<string, unknown>;
          const updatedAtMs = extractTimestampMs(data.updatedAt) ?? 0;
          if (updatedAtMs > maxUpdatedAtMs) {
            maxUpdatedAtMs = updatedAtMs;
          }
          return {
            id: docSnap.id,
            data,
            priority: getDocApplyPriority(docSnap.id),
            index,
          };
        })
        .sort((a, b) => a.priority - b.priority || a.index - b.index);

      let pulledDocsCount = 0;
      let totalRequeued = 0;

      for (const item of orderedDocs) {
        if (options?.onBeforeApplyDoc) {
          await options.onBeforeApplyDoc(item.id);
        }
        const { requeuedCount } = await applyRemoteDocToDexie(this.localDb, item.id, item.data);
        totalRequeued += requeuedCount;
        pulledDocsCount++;
      }

      if (maxUpdatedAtMs > lastPulledAtMs) {
        await this.localDb.runRemoteTransaction([this.localDb.settings], async () => {
          await this.localDb.settings.put({
            key: SYNC_LAST_PULLED_AT_KEY,
            value: maxUpdatedAtMs,
          });
        });
      }

      if (totalRequeued > 0 && !this.isOffline()) {
        this.scheduleDebouncedPush();
      }

      this.lastSyncedAt = Date.now();
      return { pulledDocsCount, requeuedCount: totalRequeued };
    } catch (err) {
      this.lastError =
        err instanceof Error ? err.message : 'មិនអាចទាញទិន្នន័យពី Cloud បានទេ។';
      throw err;
    } finally {
      this.isSyncing = false;
      await this.emitStatus();
    }
  }

  /**
   * Pushes all pending outbox changes first, then pulls remote updates — serialized on the
   * engine's single-flight lock so concurrent triggers (start, focus, online, timer) never overlap.
   */
  syncNow(): Promise<{
    pushedEntriesCount: number;
    pulledDocsCount: number;
    requeuedCount: number;
    skippedOversizedDocIds: string[];
    failedPhotoDocIds: string[];
  }> {
    return this.runSerialized(async () => {
      if (this.isOffline()) {
        await this.emitStatus('offline');
        return {
          pushedEntriesCount: 0,
          pulledDocsCount: 0,
          requeuedCount: 0,
          skippedOversizedDocIds: [],
          failedPhotoDocIds: [],
        };
      }
      if (await this.isBlockedByInitialSync()) {
        await this.emitStatus();
        return {
          pushedEntriesCount: 0,
          pulledDocsCount: 0,
          requeuedCount: 0,
          skippedOversizedDocIds: [],
          failedPhotoDocIds: [],
        };
      }
      const pushRes = await this._pushOutboxInternal();
      const pullRes = await this._pullChangesInternal();
      this.triggerDailySnapshotIfDue();
      return {
        pushedEntriesCount: pushRes.pushedEntriesCount,
        pulledDocsCount: pullRes.pulledDocsCount,
        requeuedCount: pullRes.requeuedCount,
        skippedOversizedDocIds: pushRes.skippedOversizedDocIds,
        failedPhotoDocIds: pushRes.failedPhotoDocIds,
      };
    });
  }

  /**
   * Sync on window focus / visibility / page show (iOS PWA resume), throttled to
   * FOCUS_PULL_THROTTLE_MS so returning to the app shows other devices' edits right away.
   */
  async onWindowFocus(): Promise<void> {
    if (await this.isBlockedByInitialSync()) {
      return;
    }
    const now = Date.now();
    if (now - this.lastFocusPullAt < FOCUS_PULL_THROTTLE_MS) {
      return;
    }
    this.lastFocusPullAt = now;
    await this.syncNow();
  }
}
