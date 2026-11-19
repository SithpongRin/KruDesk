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

  constructor() {
    super('KruDeskDB');
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
  }
}

export const db = new KruDeskDatabase();

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

export async function clearAllAppData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.settings,
      db.classes,
      db.students,
      db.attendance,
      db.attendanceSessions,
      db.holidays,
      db.monthlyScores,
      db.semesterExams,
      db.templates,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.classes.clear(),
        db.students.clear(),
        db.attendance.clear(),
        db.attendanceSessions.clear(),
        db.holidays.clear(),
        db.monthlyScores.clear(),
        db.semesterExams.clear(),
        db.templates.clear(),
      ]);
    }
  );
}
