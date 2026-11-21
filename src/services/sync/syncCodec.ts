import type {
  AppSetting,
  Attendance,
  AttendanceSession,
  Holiday,
  MonthlyScore,
  SchoolClass,
  SemesterExam,
  Student,
} from '../../types/domain';
import type { CardTemplate } from '../../types/template';

export const SYNC_SCHEMA_VERSION = 1 as const;

/** Keep every Firestore document safely below the 1 MiB limit (§1.3). */
export const MAX_SYNC_DOC_BYTES = 900 * 1024;

export const SYNC_DEVICE_ID_KEY = 'syncDeviceId';
export const SYNC_LAST_PULLED_AT_KEY = 'syncLastPulledAt';
export const SYNC_PENDING_PHOTOS_KEY = 'syncPendingPhotos';
export const SYNC_PENDING_FULL_REPLACE_KEY = 'syncPendingFullReplace';

export const INTERNAL_SYNC_SETTING_KEYS = new Set<string>([
  SYNC_DEVICE_ID_KEY,
  SYNC_LAST_PULLED_AT_KEY,
  SYNC_PENDING_PHOTOS_KEY,
  SYNC_PENDING_FULL_REPLACE_KEY,
]);

export function isInternalSyncSettingKey(key: string): boolean {
  return INTERNAL_SYNC_SETTING_KEYS.has(key);
}

export interface SyncTombstone {
  __deleted: true;
  ts: number;
}

export function makeTombstone(ts: number = Date.now()): SyncTombstone {
  return { __deleted: true, ts };
}

export function isSyncTombstone(val: unknown): val is SyncTombstone {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).__deleted === true
  );
}

export type SyncDocKind =
  | 'setting'
  | 'class'
  | 'students'
  | 'photo'
  | 'attendance'
  | 'monthlyScores'
  | 'semesterExams'
  | 'holidays'
  | 'template';

/**
 * Explicit allow-list of settings that sync across a teacher's devices (§1.3).
 * Device-only UI preferences (`theme`, `selectedMonth`, `selectedClassId`, `lastBackupAt`, etc.)
 * are intentionally excluded.
 */
export const SYNCED_SETTING_KEYS = new Set<string>([
  'profile',
  'scoreConfig',
  'attendanceConfig',
  'useKhmerNumerals',
  'documentPlace',
  'documentLunarDate',
  'documentDateHandwritten',
  'certificateGradeWords',
  'directorStamp',
  'directorSignature',
  'teacherSignature',
  'certificateBorder',
  'honorRollBorder',
  'honorRollNameBanner',
  'activeTemplateId',
  'printSettings',
]);

export function isSyncedSettingKey(key: string): boolean {
  return SYNCED_SETTING_KEYS.has(key);
}

/**
 * Encodes an arbitrary string ID into a safe Firestore field key `[A-Za-z0-9_]+`.
 */
export function encodeSafeKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, (ch) => `_${ch.charCodeAt(0).toString(16).padStart(2, '0')}_`);
}

export function decodeSafeKey(encoded: string): string {
  return encoded.replace(/_([0-9a-fA-F]{2,4})_/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

export function getDocKindFromId(docId: string): SyncDocKind {
  if (docId.startsWith('settings__')) return 'setting';
  if (docId.startsWith('class__')) return 'class';
  if (docId.startsWith('students__')) return 'students';
  if (docId.startsWith('photo__')) return 'photo';
  if (docId.startsWith('att__')) return 'attendance';
  if (docId.startsWith('ms__')) return 'monthlyScores';
  if (docId.startsWith('se__')) return 'semesterExams';
  if (docId === 'holidays') return 'holidays';
  if (docId.startsWith('template__')) return 'template';
  throw new Error(`Unknown sync docId format: ${docId}`);
}

/**
 * Dependency order for applying pulled documents:
 * class (0) -> students (1) -> photo (2) -> all other kinds (3).
 */
export function getDocApplyPriority(docId: string): number {
  const kind = getDocKindFromId(docId);
  if (kind === 'class') return 0;
  if (kind === 'students') return 1;
  if (kind === 'photo') return 2;
  return 3;
}

export function parseAttendanceAbsenceRowKey(
  rowKey: string
): { studentRef: number; date: string } | null {
  const m = /^a_(\d+)_(\d{4})_(\d{2})_(\d{2})$/.exec(rowKey);
  if (!m) return null;
  return {
    studentRef: Number(m[1]),
    date: `${m[2]}-${m[3]}-${m[4]}`,
  };
}

export function parseAttendanceSessionRowKey(rowKey: string): { date: string } | null {
  const m = /^sess_(\d{4})_(\d{2})_(\d{2})$/.exec(rowKey);
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

export function stripStudentPhoto(student: Student): Omit<Student, 'photoBlob'> {
  const copy = { ...student } as Student & { photoBase64?: string };
  delete copy.photoBlob;
  delete copy.photoBase64;
  return copy;
}

export function stripUndefinedDeep<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k] = stripUndefinedDeep(v);
    }
  }
  return out as T;
}

export function estimateJsonBytes(val: unknown): number {
  try {
    const json = JSON.stringify(val);
    if (!json) return 0;
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).byteLength;
    }
    return json.length * 2;
  } catch {
    return 0;
  }
}

export interface SyncPhotoRow {
  studentId: number;
  classId: number;
  dataUrl: string;
  updatedAt: number;
}

export interface SyncAbsenceRow extends Attendance {
  kind: 'absence';
}

export interface SyncAttendanceSessionRow extends AttendanceSession {
  kind: 'session';
}

export type SyncAttendanceDocRow = SyncAbsenceRow | SyncAttendanceSessionRow;

export function buildSettingDocEntry(setting: AppSetting): {
  docId: string;
  rowKey: string;
  value: { key: string; value: unknown };
} {
  return {
    docId: `settings__${setting.key}`,
    rowKey: 'v',
    value: { key: setting.key, value: setting.value },
  };
}

export function buildClassDocEntry(cls: SchoolClass & { id: number }): {
  docId: string;
  rowKey: string;
  value: SchoolClass;
} {
  return {
    docId: `class__${cls.id}`,
    rowKey: `c_${cls.id}`,
    value: stripUndefinedDeep(cls),
  };
}

export function buildStudentDocEntry(student: Student & { id: number }): {
  docId: string;
  rowKey: string;
  value: Omit<Student, 'photoBlob'>;
} {
  return {
    docId: `students__${student.classId}`,
    rowKey: `s_${student.id}`,
    value: stripUndefinedDeep(stripStudentPhoto(student)),
  };
}

export function buildPhotoDocEntry(
  studentId: number,
  classId: number,
  dataUrl: string,
  updatedAt: number = Date.now()
): {
  docId: string;
  rowKey: string;
  value: SyncPhotoRow;
} {
  return {
    docId: `photo__${studentId}`,
    rowKey: `p_${studentId}`,
    value: {
      studentId,
      classId,
      dataUrl,
      updatedAt,
    },
  };
}

export function buildAttendanceDocEntry(att: Attendance): {
  docId: string;
  rowKey: string;
  value: SyncAbsenceRow;
} {
  const month = att.date.slice(0, 7);
  const safeDate = att.date.replace(/-/g, '_');
  return {
    docId: `att__${att.classId}__${month}`,
    rowKey: `a_${att.studentRef}_${safeDate}`,
    value: {
      kind: 'absence',
      classId: att.classId,
      studentRef: att.studentRef,
      date: att.date,
      status: att.status,
    },
  };
}

export function buildAttendanceSessionDocEntry(sess: AttendanceSession): {
  docId: string;
  rowKey: string;
  value: SyncAttendanceSessionRow;
} {
  const month = sess.date.slice(0, 7);
  const safeDate = sess.date.replace(/-/g, '_');
  return {
    docId: `att__${sess.classId}__${month}`,
    rowKey: `sess_${safeDate}`,
    value: stripUndefinedDeep({
      kind: 'session' as const,
      classId: sess.classId,
      date: sess.date,
      savedAt: sess.savedAt,
      ...(sess.migrated ? { migrated: true } : {}),
    }),
  };
}

export function buildMonthlyScoreDocEntry(ms: MonthlyScore): {
  docId: string;
  rowKey: string;
  value: MonthlyScore;
} {
  return {
    docId: `ms__${ms.classId}__${ms.month}`,
    rowKey: `m_${ms.studentRef}`,
    value: stripUndefinedDeep(ms),
  };
}

export function buildSemesterExamDocEntry(se: SemesterExam): {
  docId: string;
  rowKey: string;
  value: SemesterExam;
} {
  return {
    docId: `se__${se.classId}__${se.semester}`,
    rowKey: `e_${se.studentRef}`,
    value: stripUndefinedDeep(se),
  };
}

export function buildHolidayDocEntry(holiday: Holiday & { id: number }): {
  docId: string;
  rowKey: string;
  value: Holiday;
} {
  return {
    docId: 'holidays',
    rowKey: `h_${holiday.id}`,
    value: stripUndefinedDeep(holiday),
  };
}

export function buildTemplateDocEntry(tpl: CardTemplate): {
  docId: string;
  rowKey: string;
  value: CardTemplate;
} {
  const safeId = encodeSafeKey(tpl.id);
  return {
    docId: `template__${safeId}`,
    rowKey: `t_${safeId}`,
    value: stripUndefinedDeep(tpl),
  };
}
