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

export interface ScoreConfig {
  scale: 10 | 20 | 50 | 100;
  countBlankAsZero: boolean;
  averageDecimalMode?: AverageDecimalMode;
  wMonthly: number;
  wExam: number;
  wSem1: number;
  wSem2: number;
  sem1Months: number[]; // e.g. [11, 12, 1, 2]
  sem2Months: number[]; // e.g. [4, 5, 6]
}

export interface AttendanceConfig {
  restWeekdays: number[]; // 0 = Sunday, 6 = Saturday
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  scale: 50,
  countBlankAsZero: false,
  averageDecimalMode: 'truncate',
  wMonthly: 1,
  wExam: 1,
  wSem1: 1,
  wSem2: 1,
  sem1Months: [11, 12, 1, 2],
  sem2Months: [4, 5, 6],
};

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  restWeekdays: [0], // Sunday by default
};
