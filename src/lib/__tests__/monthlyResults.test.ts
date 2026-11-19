import { describe, it, expect } from 'vitest';
import {
  buildStudentReportSubjectRows,
  computeMonthlyResults,
  orderReportRows,
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
});
