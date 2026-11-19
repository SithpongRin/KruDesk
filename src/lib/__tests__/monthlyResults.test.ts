import { describe, it, expect } from 'vitest';
import {
  annualResult,
  buildStudentReportSubjectRows,
  computeAnnualResults,
  computeMonthlyResults,
  computeSemesterResults,
  getGradeWord,
  orderReportRows,
  resolveSemesterForMonth,
  selectHonorRollStudents,
  selectTopRankStudents,
} from '../monthlyResults';
import { formatAverage } from '../grading';
import { DEFAULT_SCORE_CONFIG, type AbsenceCode, type Student, type Subject } from '../../types/domain';

function makeStudent(id: number, nameKm: string, gender: 'ប្រុស' | 'ស្រី'): Student {
  return {
    id,
    classId: 1,
    order: id,
    studentId: `S-${id}`,
    nameKm,
    gender,
    dateOfBirth: '01/01/2013',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
  };
}

const SUBJECTS: Subject[] = [
  { id: 'kh', name: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 1 },
  { id: 'math', name: 'គណិតវិទ្យា', maxScore: 50, order: 2 },
  { id: 'extra', name: 'បន្ថែម', maxScore: 50, order: 3, isActive: false },
];

describe('monthlyResults & formatAverage', () => {
  it('truncates by default and rounds when configured', () => {
    expect(formatAverage(44.625)).toBe('44.62');
    expect(formatAverage(29.875, 'truncate')).toBe('29.87');
    expect(formatAverage(44.625, 'round')).toBe('44.63');
    expect(formatAverage(29.875, 'round')).toBe('29.88');
    expect(formatAverage(null)).toBe('');
  });

  it('sorts by competition rank with Khmer name tie-breaking, puts unranked last, counts grades/females, and detects absent-all-month', () => {
    const students = [
      makeStudent(1, 'ខេម ដារ៉ា', 'ប្រុស'), // tied rank 1 with s2, comes after កែវ in Khmer
      makeStudent(2, 'កែវ ម៉ាលី', 'ស្រី'), // tied rank 1, comes first by Khmer name
      makeStudent(3, 'ចាន់ សុខា', 'ស្រី'), // rank 3, absent all taken days
      makeStudent(4, 'គង់ វីរៈ', 'ប្រុស'), // no scores -> unranked at bottom
    ];

    const scoresByStudent = new Map<number, Record<string, number | null>>([
      [1, { kh: 45, math: 45, extra: 50 }], // avg 45 -> A, rank 1 (extra ignored)
      [2, { kh: 45, math: 45 }], // avg 45 -> A, rank 1
      [3, { kh: 20, math: 20 }], // avg 20 -> F, rank 3, failed
    ]);

    const takenDates = new Set(['2026-06-01', '2026-06-02']);
    const attendanceLookup = new Map<string, AbsenceCode>([
      ['3|2026-06-01', 'ច្ប'],
      ['3|2026-06-02', 'ឈ'], // ឈ counts inside ច្ប -> total 2 === takenDates.size
      ['1|2026-06-01', 'អច្ប'],
    ]);

    const summary = computeMonthlyResults({
      students,
      subjects: SUBJECTS,
      month: '2026-06',
      scoresByStudent,
      attendanceLookup,
      takenDates,
      scoreConfig: DEFAULT_SCORE_CONFIG,
    });

    expect(summary.rows.map((r) => r.student.id)).toEqual([2, 1, 3, 4]);
    expect(summary.rows.map((r) => r.rank)).toEqual([1, 1, 3, null]);
    expect(summary.rows[0].passed).toBe(true);
    expect(summary.rows[2].passed).toBe(false);
    expect(summary.rows[3].passed).toBeNull();

    expect(summary.totalStudents).toBe(4);
    expect(summary.femaleStudents).toBe(2);
    expect(summary.gradeCounts.A).toEqual({ total: 2, female: 1 });
    expect(summary.gradeCounts.F).toEqual({ total: 1, female: 1 });
    expect(summary.absentAllMonth).toEqual({ total: 1, female: 1 });
  });

  it('builds per-subject report rows (grouped parts separate, inactive skipped) and orders ranked rows', () => {
    const subjects: Subject[] = [
      { id: 'kh_d', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 1 },
      { id: 'kh_e', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 2 },
      { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 3 },
      { id: 'opt', name: 'គេហវិទ្យា', maxScore: 50, order: 4, isActive: false },
    ];

    const rows = buildStudentReportSubjectRows(subjects, {
      kh_d: 45, // 45/50 -> A
      kh_e: 40, // 40/50 -> B
      math: 80, // 80/100 * 50 = 40 -> B
      opt: 50,
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(['សរសេរតាមអាន', 'តែងសេចក្ដី', 'គណិតវិទ្យា']);
    expect(rows.map((r) => r.grade)).toEqual(['A', 'B', 'B']);

    const students = [
      makeStudent(1, 'កែវ ក', 'ស្រី'),
      makeStudent(2, 'ចាន់ ខ', 'ប្រុស'),
      makeStudent(3, 'គង់ គ', 'ប្រុស'), // no scores
    ];
    const summary = computeMonthlyResults({
      students,
      subjects,
      month: '2026-06',
      scoresByStudent: new Map([
        [1, { kh_d: 30, kh_e: 30, math: 60 }], // rank 2
        [2, { kh_d: 45, kh_e: 45, math: 90 }], // rank 1
      ]),
      attendanceLookup: new Map(),
      takenDates: new Set(),
      scoreConfig: DEFAULT_SCORE_CONFIG,
    });

    expect(orderReportRows(summary.rows, 'rank').map((r) => r.student.id)).toEqual([2, 1]);
    expect(orderReportRows(summary.rows, 'class').map((r) => r.student.id)).toEqual([1, 2]);
  });

  it('selects honor roll (cap 6 with overflow), top 1-3 with ties, semester label, and grade words', () => {
    const students = Array.from({ length: 8 }, (_, i) =>
      makeStudent(i + 1, `សិស្ស ${i + 1}`, i % 2 === 0 ? 'ស្រី' : 'ប្រុស')
    );
    const scoresByStudent = new Map<number, Record<string, number | null>>([
      [1, { kh: 50, math: 50 }], // rank 1
      [2, { kh: 50, math: 50 }], // rank 1 (tie)
      [3, { kh: 45, math: 45 }], // rank 3
      [4, { kh: 45, math: 45 }], // rank 3 (tie)
      [5, { kh: 40, math: 40 }], // rank 5
      [6, { kh: 40, math: 40 }], // rank 5 (tie)
      [7, { kh: 40, math: 40 }], // rank 5 (7th eligible -> overflow!)
      [8, { kh: 20, math: 20 }], // rank 8
    ]);

    const summary = computeMonthlyResults({
      students,
      subjects: SUBJECTS,
      month: '2026-06',
      scoresByStudent,
      attendanceLookup: new Map(),
      takenDates: new Set(),
      scoreConfig: DEFAULT_SCORE_CONFIG,
    });

    const honor = selectHonorRollStudents(summary.rows, 5, 6);
    expect(honor.items).toHaveLength(6);
    expect(honor.overflowCount).toBe(1);

    const top3 = selectTopRankStudents(summary.rows, 3);
    expect(top3.map((r) => r.rank)).toEqual([1, 1, 3, 3]);

    expect(resolveSemesterForMonth('2026-01', DEFAULT_SCORE_CONFIG)).toBe(1);
    expect(resolveSemesterForMonth('2026-06', DEFAULT_SCORE_CONFIG)).toBe(2);
    expect(resolveSemesterForMonth('2026-03', DEFAULT_SCORE_CONFIG)).toBeNull();

    expect(getGradeWord('A')).toBe('ល្អប្រសើរ');
    expect(getGradeWord('B')).toBe('ល្អណាស់');
    expect(getGradeWord('C')).toBe('ល្អ');
    expect(getGradeWord('D')).toBe('ល្អបង្គួរ');
    expect(getGradeWord('E')).toBe('មធ្យម');
    expect(getGradeWord('F')).toBe('ខ្សោយ');
    expect(getGradeWord('A', { A: 'ឆ្នើម' })).toBe('ឆ្នើម');
    expect(getGradeWord(null)).toBe('');
  });

  it('computes semester results matching sample 05 numbers (divisor 16) with truncation and certificate counts', () => {
    // 16 = divisor -> total maxScore = 800 (e.g., 16 subjects * 50, or 8 subjects * 100)
    const subjects16: Subject[] = Array.from({ length: 16 }, (_, i) => ({
      id: `s${i + 1}`,
      name: `មុខវិជ្ជា ${i + 1}`,
      maxScore: 50,
      order: i + 1,
    }));

    const students = [
      makeStudent(1, 'កែវ សុខា', 'ប្រុស'), // exam 527, monthly sum 66.75 / 2 -> 32.93, 33.37, 33.15, D
      makeStudent(2, 'ចាន់ ដារ៉ា', 'ស្រី'), // exam 608, monthly sum 65.00 / 2 -> 38.00, 32.50, 35.25, C
      makeStudent(3, 'នួន ម៉ាលី', 'ស្រី'), // exam 661, monthly sum 77.9375 / 2 -> 41.31, 38.96, 40.14, B
    ];

    const makeScores = (total: number): Record<string, number> => {
      const rec: Record<string, number> = {};
      const base = Math.floor(total / 16);
      let rem = total - base * 16;
      for (let i = 1; i <= 16; i++) {
        const add = rem > 0 ? Math.min(50 - base, rem) : 0;
        rec[`s${i}`] = base + add;
        rem -= add;
      }
      return rec;
    };

    const config: typeof DEFAULT_SCORE_CONFIG = {
      ...DEFAULT_SCORE_CONFIG,
      sem1Months: [1, 2],
      sem2Months: [4, 5],
    };

    // Monthly totals corresponding to monthly averages:
    // Student 1: 33.375 * 16 = 534 each month -> sum = 66.75
    // Student 2: 32.50 * 16 = 520 each month -> sum = 65.00
    // Student 3: 38.96875 * 16 = 623.5 each month -> sum = 77.9375
    const monthlyRecords = [
      { classId: 1, studentRef: 1, month: '2027-01', scores: makeScores(534) },
      { classId: 1, studentRef: 1, month: '2027-02', scores: makeScores(534) },
      { classId: 1, studentRef: 2, month: '2027-01', scores: makeScores(520) },
      { classId: 1, studentRef: 2, month: '2027-02', scores: makeScores(520) },
      { classId: 1, studentRef: 3, month: '2027-01', scores: { ...makeScores(623), s1: (makeScores(623).s1 ?? 0) + 0.5 } },
      { classId: 1, studentRef: 3, month: '2027-02', scores: { ...makeScores(623), s1: (makeScores(623).s1 ?? 0) + 0.5 } },
    ];

    const semesterExams = [
      { classId: 1, studentRef: 1, semester: 1 as const, scores: makeScores(527) },
      { classId: 1, studentRef: 2, semester: 1 as const, scores: makeScores(608) },
      { classId: 1, studentRef: 3, semester: 1 as const, scores: makeScores(661) },
    ];

    const sem = computeSemesterResults({
      students,
      subjects: subjects16,
      academicYear: '2026-2027',
      semester: 1,
      monthlyRecords,
      semesterExams,
      attendanceRows: [{ classId: 1, studentRef: 1, date: '2027-01-05', status: 'ច្ប' }],
      attendanceSessions: [{ classId: 1, date: '2027-01-05', savedAt: 1 }],
      scoreConfig: config,
    });

    const byId = new Map(sem.rows.map((r) => [r.student.id, r]));
    const r1 = byId.get(1)!;
    const r2 = byId.get(2)!;
    const r3 = byId.get(3)!;

    expect(formatAverage(r1.examAvg)).toBe('32.93');
    expect(formatAverage(r1.monthlyAvg)).toBe('33.37');
    expect(formatAverage(r1.semesterAvg)).toBe('33.15');
    expect(r1.grade).toBe('D');
    expect(r1.attendance.excused).toBe(1);
    expect(r1.certificatesCount).toBe(2); // rank 2 in both months

    expect(formatAverage(r2.examAvg)).toBe('38.00');
    expect(formatAverage(r2.monthlyAvg)).toBe('32.50');
    expect(formatAverage(r2.semesterAvg)).toBe('35.25');
    expect(r2.grade).toBe('C');

    expect(formatAverage(r3.examAvg)).toBe('41.31');
    expect(formatAverage(r3.monthlyAvg)).toBe('38.96');
    expect(formatAverage(r3.semesterAvg)).toBe('40.14');
    expect(r3.grade).toBe('B');

    // Sorted by rank: r3 (1) -> r2 (2) -> r1 (3)
    expect(sem.rows.map((r) => r.student.id)).toEqual([3, 2, 1]);
  });

  it('evaluates annualResult absence-limit rule and computes annual summary counts', () => {
    // 35 unexcused / limit 30 -> fails even with avg 30.36
    expect(
      annualResult(30.36, { excused: 2, unexcused: 35, total: 37 }, {
        absenceFailLimit: 30,
        absenceFailCountType: 'unexcused',
      })
    ).toEqual({ passed: false, failedByAbsenceOnly: true });

    // 29 -> passes; 30 -> passes (strictly greater)
    expect(
      annualResult(30.36, { excused: 0, unexcused: 29, total: 29 }, {
        absenceFailLimit: 30,
        absenceFailCountType: 'unexcused',
      })
    ).toEqual({ passed: true, failedByAbsenceOnly: false });
    expect(
      annualResult(30.36, { excused: 0, unexcused: 30, total: 30 }, {
        absenceFailLimit: 30,
        absenceFailCountType: 'unexcused',
      })
    ).toEqual({ passed: true, failedByAbsenceOnly: false });

    // 'all' mode counts ច្ប + អ.ច្ប (ឈ is inside ច្ប)
    expect(
      annualResult(30.36, { excused: 16, unexcused: 15, total: 31 }, {
        absenceFailLimit: 30,
        absenceFailCountType: 'all',
      })
    ).toEqual({ passed: false, failedByAbsenceOnly: true });

    // limit 0 -> rule off
    expect(
      annualResult(30.36, { excused: 0, unexcused: 50, total: 50 }, {
        absenceFailLimit: 0,
        absenceFailCountType: 'unexcused',
      })
    ).toEqual({ passed: true, failedByAbsenceOnly: false });

    // Low average (< 25) -> fails by score, not failedByAbsenceOnly
    expect(
      annualResult(24.99, { excused: 0, unexcused: 35, total: 35 }, {
        absenceFailLimit: 30,
        absenceFailCountType: 'unexcused',
      })
    ).toEqual({ passed: false, failedByAbsenceOnly: false });

    // Full computeAnnualResults integration: student 1 passes, student 2 fails by absence only
    const students = [
      makeStudent(1, 'កែវ សុខា', 'ប្រុស'),
      makeStudent(2, 'ចាន់ ដារ៉ា', 'ស្រី'),
    ];
    const subjects: Subject[] = [
      { id: 'kh', name: 'ខ្មែរ', maxScore: 50, order: 1 },
      { id: 'math', name: 'គណិត', maxScore: 50, order: 2 },
    ];
    const config = {
      ...DEFAULT_SCORE_CONFIG,
      sem1Months: [1],
      sem2Months: [4],
      absenceFailLimit: 1,
      absenceFailCountType: 'unexcused' as const,
    };
    const monthlyRecords = [
      { classId: 1, studentRef: 1, month: '2027-01', scores: { kh: 40, math: 40 } },
      { classId: 1, studentRef: 1, month: '2027-04', scores: { kh: 40, math: 40 } },
      { classId: 1, studentRef: 2, month: '2027-01', scores: { kh: 30, math: 30 } },
      { classId: 1, studentRef: 2, month: '2027-04', scores: { kh: 30, math: 30 } },
    ];
    const semesterExams = [
      { classId: 1, studentRef: 1, semester: 1 as const, scores: { kh: 40, math: 40 } },
      { classId: 1, studentRef: 1, semester: 2 as const, scores: { kh: 40, math: 40 } },
      { classId: 1, studentRef: 2, semester: 1 as const, scores: { kh: 30, math: 30 } },
      { classId: 1, studentRef: 2, semester: 2 as const, scores: { kh: 30, math: 30 } },
    ];
    const attendanceRows = [
      { classId: 1, studentRef: 2, date: '2027-01-05', status: 'អច្ប' as const },
      { classId: 1, studentRef: 2, date: '2027-04-05', status: 'អច្ប' as const },
    ];
    const attendanceSessions = [
      { classId: 1, date: '2027-01-05', savedAt: 1 },
      { classId: 1, date: '2027-04-05', savedAt: 2 },
    ];

    const annual = computeAnnualResults({
      students,
      subjects,
      academicYear: '2026-2027',
      monthlyRecords,
      semesterExams,
      attendanceRows,
      attendanceSessions,
      scoreConfig: config,
    });

    expect(annual.totalStudents).toBe(2);
    expect(annual.femaleStudents).toBe(1);
    expect(annual.failedCount).toEqual({ total: 1, female: 1 });
    expect(annual.gradeCounts.B).toEqual({ total: 1, female: 0 });
    expect(annual.gradeCounts.D).toEqual({ total: 1, female: 1 });
    const s2 = annual.rows.find((r) => r.student.id === 2)!;
    expect(s2.passed).toBe(false);
    expect(s2.note).toBe('អវត្តមានលើសកំណត់');
  });
});
