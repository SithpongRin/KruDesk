import Dexie, { type Table } from 'dexie';
import type {
  AppSetting,
  Attendance,
  Holiday,
  MonthlyScore,
  Profile,
  SchoolClass,
  SemesterExam,
  Student,
  ThemeMode,
} from '../types/domain';
import type { CardTemplate } from '../types/template';

export class KruDeskDatabase extends Dexie {
  settings!: Table<AppSetting, string>;
  classes!: Table<SchoolClass, number>;
  students!: Table<Student, number>;
  attendance!: Table<Attendance, [number, string, number]>;
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
        db.holidays.clear(),
        db.monthlyScores.clear(),
        db.semesterExams.clear(),
        db.templates.clear(),
      ]);
    }
  );
}
