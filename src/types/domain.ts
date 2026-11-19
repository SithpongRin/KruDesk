export interface Profile {
  teacherName: string;
  schoolName: string;
  directorName: string;
  academicYear: string;
  province?: string;
}

export interface Subject {
  id: string;
  name: string;
  group?: string;
  maxScore: number;
  order: number;
  isActive?: boolean;
  isBonus?: boolean;
}

export interface SchoolClass {
  id?: number;
  name: string;
  gradeLevel: number;
  academicYear: string;
  color: string;
  subjects: Subject[];
  createdAt: number;
}

export type StudentStatus = 'active' | 'dropped' | 'transferred';

export interface Student {
  id?: number;
  classId: number;
  order: number;
  studentId: string;
  nameKm: string;
  nameEn?: string;
  gender: 'ប្រុស' | 'ស្រី';
  dateOfBirth: string;
  placeOfBirth?: string;
  fatherName?: string;
  fatherOccupation?: string;
  motherName?: string;
  motherOccupation?: string;
  address?: string;
  phone?: string;
  cardNumber?: string;
  photoBlob?: Blob;
  status: StudentStatus;
  statusChangedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type AbsenceCode = 'ច្ប' | 'អច្ប' | 'ឈ';

export interface Attendance {
  classId: number;
  studentRef: number;
  date: string; // YYYY-MM-DD
  status: AbsenceCode;
}

export interface AttendanceSession {
  classId: number;
  date: string; // YYYY-MM-DD
  savedAt: number;
  migrated?: boolean;
}

export interface Holiday {
  id?: number;
  date: string; // YYYY-MM-DD
  label: string;
}

export interface MonthlyScore {
  classId: number;
  studentRef: number;
  month: string; // YYYY-MM
  scores: Record<string, number | null>;
  note?: string;
}

export interface SemesterExam {
  classId: number;
  studentRef: number;
  semester: 1 | 2;
  scores: Record<string, number | null>;
  note?: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type AverageDecimalMode = 'truncate' | 'round';
export type AbsenceFailCountType = 'unexcused' | 'all';

export interface ScoreConfig {
  scale: 10 | 20 | 50 | 100;
  countBlankAsZero: boolean;
  averageDecimalMode?: AverageDecimalMode;
  absenceFailLimit?: number;
  absenceFailCountType?: AbsenceFailCountType;
  wMonthly: number;
  wExam: number;
  wSem1: number;
  wSem2: number;
  sem1Months: number[]; // e.g. [11, 12, 1]
  sem2Months: number[]; // e.g. [3, 4, 5, 6, 7]
  /** Which default rules this saved config was written under (see SCORE_RULES_VERSION). */
  rulesVersion?: number;
}

export interface AttendanceConfig {
  restWeekdays: number[]; // 0 = Sunday, 6 = Saturday
}

/**
 * 2 = MoEYS instruction ៦៧ អយក.សណន for 2026-2027 (adopted by the teacher 2026-11-19):
 * grades 7–8 sit the semester-1 exam in February and semester 2 in August, so the monthly
 * months are Nov–Jan and Mar–Jul; averages divide by the full total (blank = 0).
 */
export const SCORE_RULES_VERSION = 2;

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  scale: 50,
  countBlankAsZero: true,
  averageDecimalMode: 'truncate',
  absenceFailLimit: 30,
  absenceFailCountType: 'unexcused',
  wMonthly: 1,
  wExam: 1,
  wSem1: 1,
  wSem2: 1,
  sem1Months: [11, 12, 1],
  sem2Months: [3, 4, 5, 6, 7],
  rulesVersion: SCORE_RULES_VERSION,
};

/**
 * Saved settings + defaults. A config saved under older rules (or restored from an older
 * backup) gets the ministry semester months and blank = 0 once; later edits in Settings
 * are saved with the current rulesVersion and are kept.
 */
export function resolveScoreConfig(stored?: Partial<ScoreConfig> | null): ScoreConfig {
  const merged: ScoreConfig = { ...DEFAULT_SCORE_CONFIG, ...(stored ?? {}) };
  if ((stored?.rulesVersion ?? 1) < SCORE_RULES_VERSION) {
    merged.sem1Months = [...DEFAULT_SCORE_CONFIG.sem1Months];
    merged.sem2Months = [...DEFAULT_SCORE_CONFIG.sem2Months];
    merged.countBlankAsZero = DEFAULT_SCORE_CONFIG.countBlankAsZero;
    merged.rulesVersion = SCORE_RULES_VERSION;
  }
  return merged;
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  restWeekdays: [0], // Sunday by default
};
