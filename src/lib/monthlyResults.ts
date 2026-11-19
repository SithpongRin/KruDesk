import type {
  AbsenceCode,
  Attendance,
  AttendanceSession,
  MonthlyScore,
  ScoreConfig,
  SemesterExam,
  Student,
  Subject,
} from '../types/domain';
import {
  buildAttendanceLookup,
  buildTakenDatesSet,
  computeStudentMonthlyAttendance,
  getActiveStudentsOrdered,
  type MonthDayInfo,
} from './attendance';
import {
  computeCompetitionRanks,
  computeScoreRow,
  computeSemesterAnnualSummary,
  displayedAverageOrNull,
  gradeFor,
  isSubjectActive,
  sortSubjects,
  type ScoreGrade,
} from './grading';
import { compareKhmerNames } from './khmerSort';
import { parseYearMonth, resolveAcademicMonthKey } from './khmerDate';

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
  scoreConfig: Pick<ScoreConfig, 'scale' | 'countBlankAsZero'> &
    Partial<Pick<ScoreConfig, 'averageDecimalMode'>>;
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

  const mode = scoreConfig.averageDecimalMode ?? 'truncate';
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
    const dispAvg = displayedAverageOrNull(row.average, mode);
    const grade = gradeFor(dispAvg);
    const passed = dispAvg !== null ? dispAvg >= 25 : null;
    const attendance = computeStudentMonthlyAttendance(sid, attendanceLookup, countableDays);
    const note = (student.id !== undefined && notesByStudent?.get(student.id)) || '';

    return {
      student,
      total: row.total,
      average: dispAvg,
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

export const DEFAULT_GRADE_WORDS: Record<ScoreGrade, string> = {
  A: 'ល្អប្រសើរ',
  B: 'ល្អណាស់',
  C: 'ល្អ',
  D: 'ល្អបង្គួរ',
  E: 'មធ្យម',
  F: 'ខ្សោយ',
};

export function getGradeWord(
  grade: ScoreGrade | null,
  customWords?: Partial<Record<ScoreGrade, string>>
): string {
  if (!grade) return '';
  const custom = customWords?.[grade]?.trim();
  return custom || DEFAULT_GRADE_WORDS[grade];
}

export function resolveSemesterForMonth(
  monthKey: string,
  scoreConfig: Pick<ScoreConfig, 'sem1Months' | 'sem2Months'>
): 1 | 2 | null {
  const { month } = parseYearMonth(monthKey);
  if (scoreConfig.sem1Months.includes(month)) return 1;
  if (scoreConfig.sem2Months.includes(month)) return 2;
  return null;
}

export function selectHonorRollStudents(
  rows: MonthlyResultRow[],
  maxRank = 5,
  maxCount = 6
): { items: MonthlyResultRow[]; overflowCount: number } {
  const eligible = rows.filter((r) => r.rank !== null && r.rank <= maxRank);
  return {
    items: eligible.slice(0, maxCount),
    overflowCount: Math.max(0, eligible.length - maxCount),
  };
}

export function selectTopRankStudents(
  rows: MonthlyResultRow[],
  maxRank = 3
): MonthlyResultRow[] {
  return rows.filter((r) => r.rank !== null && r.rank <= maxRank);
}

export interface SemesterResultRow {
  student: Student;
  examScores: Record<string, number | null>;
  examTotal: number | null;
  examAvg: number | null;
  monthlySum: number | null;
  monthlyAvg: number | null;
  semesterTotal: number | null;
  semesterAvg: number | null;
  rank: number | null;
  grade: ScoreGrade | null;
  passed: boolean | null;
  attendance: StudentMonthlyAttendance;
  certificatesCount: number;
  note: string;
}

export interface SemesterResultsSummary {
  semester: 1 | 2;
  rows: SemesterResultRow[];
  totalStudents: number;
  femaleStudents: number;
  gradeCounts: Record<ScoreGrade, GradeCountPair>;
  absentAllSemester: GradeCountPair;
  takenDaysCount: number;
}

export function computeSemesterResults(params: {
  students: Student[];
  subjects: Subject[];
  academicYear: string;
  semester: 1 | 2;
  monthlyRecords: MonthlyScore[];
  semesterExams: SemesterExam[];
  attendanceRows: Attendance[];
  attendanceSessions: AttendanceSession[];
  scoreConfig: ScoreConfig;
}): SemesterResultsSummary {
  const {
    students,
    subjects,
    academicYear,
    semester,
    monthlyRecords,
    semesterExams,
    attendanceRows,
    attendanceSessions,
    scoreConfig,
  } = params;

  const activeStudents = getActiveStudentsOrdered(students);
  const orderedSubjects = sortSubjects(subjects);
  const semMonthsNums = semester === 1 ? scoreConfig.sem1Months : scoreConfig.sem2Months;
  const semMonthKeys = semMonthsNums.map((m) => resolveAcademicMonthKey(academicYear, m));
  const semMonthSet = new Set(semMonthKeys);

  // Compute semester summary via computeSemesterAnnualSummary
  const annualSummaries = computeSemesterAnnualSummary({
    students: activeStudents,
    subjects: orderedSubjects,
    academicYear,
    monthlyRecords,
    semesterExams,
    config: scoreConfig,
  });

  // Count how many months in this semester each student placed rank <= 3
  const mode = scoreConfig.averageDecimalMode ?? 'truncate';
  const certCounts = new Map<number, number>();
  for (const mk of semMonthKeys) {
    const monthScoresMap = new Map<number, Record<string, number | null>>();
    for (const rec of monthlyRecords) {
      if (rec.month === mk) monthScoresMap.set(rec.studentRef, rec.scores);
    }
    const avgs = activeStudents.map((st) => {
      const sid = st.id ?? -1;
      const row = computeScoreRow(monthScoresMap.get(sid), orderedSubjects, scoreConfig);
      return { id: sid, value: displayedAverageOrNull(row.average, mode) };
    });
    const mRanks = computeCompetitionRanks(avgs);
    for (const [sid, r] of mRanks.entries()) {
      if (r !== null && r <= 3) {
        certCounts.set(sid, (certCounts.get(sid) ?? 0) + 1);
      }
    }
  }

  // Filter attendance to the semester's months
  const semAttRows = attendanceRows.filter((a) => semMonthSet.has(a.date.slice(0, 7)));
  const semAttSessions = attendanceSessions.filter((s) => semMonthSet.has(s.date.slice(0, 7)));
  const takenDates = buildTakenDatesSet(semAttSessions);
  const attLookup = buildAttendanceLookup(semAttRows);
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

  // Map exam raw scores and notes by studentRef
  const examByStudent = new Map<number, SemesterExam>();
  for (const ex of semesterExams) {
    if (ex.semester === semester) examByStudent.set(ex.studentRef, ex);
  }

  const rows: SemesterResultRow[] = annualSummaries
    .map((sum) => {
      const sid = sum.student.id ?? -1;
      const examTotal = semester === 1 ? sum.sem1ExamTotal : sum.sem2ExamTotal;
      const examAvg = semester === 1 ? sum.sem1ExamAvg : sum.sem2ExamAvg;
      const monthlySum = semester === 1 ? sum.sem1MonthlySum : sum.sem2MonthlySum;
      const monthlyAvg = semester === 1 ? sum.sem1MonthlyAvg : sum.sem2MonthlyAvg;
      const semesterTotal = semester === 1 ? sum.sem1Total : sum.sem2Total;
      const semesterAvg = semester === 1 ? sum.sem1Avg : sum.sem2Avg;
      const rank = semester === 1 ? sum.sem1Rank : sum.sem2Rank;
      const grade = semester === 1 ? sum.sem1Grade : sum.sem2Grade;
      const passed = semesterAvg !== null ? semesterAvg >= 25 : null;
      const exRec = examByStudent.get(sid);

      return {
        student: sum.student,
        examScores: exRec?.scores ?? {},
        examTotal,
        examAvg,
        monthlySum,
        monthlyAvg,
        semesterTotal,
        semesterAvg,
        rank,
        grade,
        passed,
        attendance: computeStudentMonthlyAttendance(sid, attLookup, countableDays),
        certificatesCount: certCounts.get(sid) ?? 0,
        note: exRec?.note ?? '',
      };
    })
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
    semester,
    rows,
    totalStudents: rows.length,
    femaleStudents,
    gradeCounts,
    absentAllSemester: { total: absentAllTotal, female: absentAllFemale },
    takenDaysCount,
  };
}

export function annualResult(
  annualAvg: number | null,
  attendance: Pick<StudentMonthlyAttendance, 'excused' | 'unexcused' | 'total'>,
  config: Pick<ScoreConfig, 'absenceFailLimit' | 'absenceFailCountType'>
): { passed: boolean | null; failedByAbsenceOnly: boolean } {
  if (annualAvg === null || !Number.isFinite(annualAvg)) {
    return { passed: null, failedByAbsenceOnly: false };
  }
  const limit = config.absenceFailLimit ?? 30;
  const countType = config.absenceFailCountType ?? 'unexcused';
  const counted = countType === 'all' ? attendance.total : attendance.unexcused;
  const avgPassed = annualAvg >= 25;
  const overAbsenceLimit = limit > 0 && counted > limit;

  if (!avgPassed) {
    return { passed: false, failedByAbsenceOnly: false };
  }
  if (overAbsenceLimit) {
    return { passed: false, failedByAbsenceOnly: true };
  }
  return { passed: true, failedByAbsenceOnly: false };
}

export interface AnnualResultRow {
  student: Student;
  sem1Avg: number | null;
  sem2Avg: number | null;
  annualAvg: number | null;
  rank: number | null;
  grade: ScoreGrade | null;
  passed: boolean | null;
  failedByAbsenceOnly: boolean;
  attendance: StudentMonthlyAttendance;
  note: string;
}

export interface AnnualResultsSummary {
  rows: AnnualResultRow[];
  totalStudents: number;
  femaleStudents: number;
  gradeCounts: Record<ScoreGrade, GradeCountPair>;
  failedCount: GradeCountPair;
}

export function computeAnnualResults(params: {
  students: Student[];
  subjects: Subject[];
  academicYear: string;
  monthlyRecords: MonthlyScore[];
  semesterExams: SemesterExam[];
  attendanceRows: Attendance[];
  attendanceSessions: AttendanceSession[];
  scoreConfig: ScoreConfig;
}): AnnualResultsSummary {
  const {
    students,
    subjects,
    academicYear,
    monthlyRecords,
    semesterExams,
    attendanceRows,
    attendanceSessions,
    scoreConfig,
  } = params;

  const activeStudents = getActiveStudentsOrdered(students);
  const orderedSubjects = sortSubjects(subjects);

  const annualSummaries = computeSemesterAnnualSummary({
    students: activeStudents,
    subjects: orderedSubjects,
    academicYear,
    monthlyRecords,
    semesterExams,
    config: scoreConfig,
  });

  // Whole academic year attendance (all 12 months of the academic year)
  const yearMonthSet = new Set(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
      resolveAcademicMonthKey(academicYear, m)
    )
  );
  const yearAttRows = attendanceRows.filter((a) => yearMonthSet.has(a.date.slice(0, 7)));
  const yearAttSessions = attendanceSessions.filter((s) =>
    yearMonthSet.has(s.date.slice(0, 7))
  );
  const takenDates = buildTakenDatesSet(yearAttSessions);
  const attLookup = buildAttendanceLookup(yearAttRows);
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

  const rows: AnnualResultRow[] = annualSummaries
    .map((sum) => {
      const sid = sum.student.id ?? -1;
      const attendance = computeStudentMonthlyAttendance(sid, attLookup, countableDays);
      const res = annualResult(sum.annualAvg, attendance, scoreConfig);
      return {
        student: sum.student,
        sem1Avg: sum.sem1Avg,
        sem2Avg: sum.sem2Avg,
        annualAvg: sum.annualAvg,
        rank: sum.annualRank,
        grade: sum.annualGrade,
        passed: res.passed,
        failedByAbsenceOnly: res.failedByAbsenceOnly,
        attendance,
        note: res.failedByAbsenceOnly ? 'អវត្តមានលើសកំណត់' : '',
      };
    })
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
  let failedTotal = 0;
  let failedFemale = 0;

  for (const r of rows) {
    const isFemale = r.student.gender === 'ស្រី';
    if (isFemale) femaleStudents++;
    if (r.grade) {
      gradeCounts[r.grade].total++;
      if (isFemale) gradeCounts[r.grade].female++;
    }
    if (r.passed === false) {
      failedTotal++;
      if (isFemale) failedFemale++;
    }
  }

  return {
    rows,
    totalStudents: rows.length,
    femaleStudents,
    gradeCounts,
    failedCount: { total: failedTotal, female: failedFemale },
  };
}
