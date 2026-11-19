import type {
  AbsenceCode,
  ScoreConfig,
  Student,
  Subject,
} from '../types/domain';
import {
  computeStudentMonthlyAttendance,
  getActiveStudentsOrdered,
  type MonthDayInfo,
} from './attendance';
import {
  computeCompetitionRanks,
  computeScoreRow,
  gradeFor,
  isSubjectActive,
  sortSubjects,
  type ScoreGrade,
} from './grading';
import { compareKhmerNames } from './khmerSort';

export type StudentMonthlyAttendance = ReturnType<typeof computeStudentMonthlyAttendance>;

export interface MonthlyResultRow {
  student: Student;
  total: number | null;
  average: number | null;
  rank: number | null;
  grade: ScoreGrade | null;
  passed: boolean | null;
  attendance: StudentMonthlyAttendance;
  note: string;
}

export interface GradeCountPair {
  total: number;
  female: number;
}

export interface MonthlyResultsSummary {
  rows: MonthlyResultRow[];
  totalStudents: number;
  femaleStudents: number;
  gradeCounts: Record<ScoreGrade, GradeCountPair>;
  absentAllMonth: GradeCountPair;
  takenDaysCount: number;
}

export const GRADE_ORDER: ScoreGrade[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export const GRADE_COLOR_CLASSES: Record<ScoreGrade, string> = {
  A: 'text-[#ff3b30]',
  B: 'text-[#ff2d55]',
  C: 'text-[#b91c1c]',
  D: 'text-[#16a34a]',
  E: 'text-[#0071e3]',
  F: 'text-[#1d1d1f] dark:text-[#f5f5f7]',
};

export const GRADE_PRINT_COLORS: Record<ScoreGrade, string> = {
  A: '#dc2626',
  B: '#ec4899',
  C: '#991b1b',
  D: '#16a34a',
  E: '#2563eb',
  F: '#111827',
};

export function computeMonthlyResults(params: {
  students: Student[];
  subjects: Subject[];
  month: string;
  scoresByStudent: Map<number, Record<string, number | null>>;
  notesByStudent?: Map<number, string>;
  attendanceLookup: Map<string, AbsenceCode>;
  takenDates: Set<string>;
  scoreConfig: Pick<ScoreConfig, 'scale' | 'countBlankAsZero'>;
}): MonthlyResultsSummary {
  const {
    students,
    subjects,
    month,
    scoresByStudent,
    notesByStudent,
    attendanceLookup,
    takenDates,
    scoreConfig,
  } = params;

  const activeStudents = getActiveStudentsOrdered(students, month);
  const orderedSubjects = sortSubjects(subjects);
  const countableDays: MonthDayInfo[] = Array.from(takenDates).map((dateKey) => ({
    dateKey,
    day: Number(dateKey.split('-')[2]) || 1,
    weekday: 1,
    isRestDay: false,
    isHoliday: false,
    isNonSchoolDay: false,
    isFuture: false,
    isTaken: true,
    isCountable: true,
  }));

  const computed = activeStudents.map((student) => {
    const sid = student.id ?? -1;
    const scoreRec = (student.id !== undefined && scoresByStudent.get(student.id)) || {};
    const row = computeScoreRow(scoreRec, orderedSubjects, scoreConfig);
    const grade = gradeFor(row.average);
    const passed = row.average !== null ? row.average >= 25 : null;
    const attendance = computeStudentMonthlyAttendance(sid, attendanceLookup, countableDays);
    const note = (student.id !== undefined && notesByStudent?.get(student.id)) || '';

    return {
      student,
      total: row.total,
      average: row.average,
      grade,
      passed,
      attendance,
      note,
    };
  });

  const rankMap = computeCompetitionRanks(
    computed.map((r) => ({ id: r.student.id ?? -1, value: r.average }))
  );

  const rows: MonthlyResultRow[] = computed
    .map((r) => ({
      ...r,
      rank: rankMap.get(r.student.id ?? -1) ?? null,
    }))
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return compareKhmerNames(a.student.nameKm, b.student.nameKm);
      }
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return compareKhmerNames(a.student.nameKm, b.student.nameKm);
    });

  const gradeCounts: Record<ScoreGrade, GradeCountPair> = {
    A: { total: 0, female: 0 },
    B: { total: 0, female: 0 },
    C: { total: 0, female: 0 },
    D: { total: 0, female: 0 },
    E: { total: 0, female: 0 },
    F: { total: 0, female: 0 },
  };

  let femaleStudents = 0;
  let absentAllTotal = 0;
  let absentAllFemale = 0;
  const takenDaysCount = takenDates.size;

  for (const r of rows) {
    const isFemale = r.student.gender === 'ស្រី';
    if (isFemale) femaleStudents++;

    if (r.grade) {
      gradeCounts[r.grade].total++;
      if (isFemale) gradeCounts[r.grade].female++;
    }

    if (takenDaysCount >= 1 && r.attendance.total >= takenDaysCount) {
      absentAllTotal++;
      if (isFemale) absentAllFemale++;
    }
  }

  return {
    rows,
    totalStudents: rows.length,
    femaleStudents,
    gradeCounts,
    absentAllMonth: { total: absentAllTotal, female: absentAllFemale },
    takenDaysCount,
  };
}

export interface StudentReportSubjectRow {
  orderNum: number;
  subjectId: string;
  name: string;
  maxScore: number;
  score: number | null;
  grade: ScoreGrade | null;
}

export function buildStudentReportSubjectRows(
  subjects: Subject[],
  scores: Record<string, number | null> | undefined
): StudentReportSubjectRow[] {
  const active = sortSubjects(subjects).filter(isSubjectActive);
  return active.map((subj, idx) => {
    const raw = scores?.[subj.id];
    const score = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    const scaled = score !== null && subj.maxScore > 0 ? (score / subj.maxScore) * 50 : null;
    return {
      orderNum: idx + 1,
      subjectId: subj.id,
      name: subj.name,
      maxScore: subj.maxScore,
      score,
      grade: gradeFor(scaled),
    };
  });
}

export type ReportOrderMode = 'rank' | 'class';

export function orderReportRows(
  rows: MonthlyResultRow[],
  order: ReportOrderMode
): MonthlyResultRow[] {
  const ranked = rows.filter((r) => r.rank !== null);
  if (order === 'rank') return ranked;
  return [...ranked].sort(
    (a, b) =>
      a.student.order - b.student.order ||
      compareKhmerNames(a.student.nameKm, b.student.nameKm)
  );
}
