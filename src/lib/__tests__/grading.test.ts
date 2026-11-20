import { describe, it, expect } from 'vitest';
import {
  buildSubjectColumnNumbers,
  buildSubjectHeaderSpans,
  collapseGroupedSubjects,
  computeCollapsedSubjectScore,
  computeCompetitionRanks,
  computeScoreRow,
  computeSemesterAnnualSummary,
  formatScoreDecimal,
  gradeFor,
  isSubjectActive,
  isSubjectBonus,
  parseScoreInput,
} from '../grading';
import { createLowerSecondarySubjects } from '../../db/presets';
import { resolveAcademicMonthKey } from '../khmerDate';
import { DEFAULT_SCORE_CONFIG, type ScoreConfig, type Student, type Subject } from '../../types/domain';

function makeStudent(id: number, nameKm: string, status: Student['status'] = 'active'): Student {
  return {
    id,
    classId: 1,
    order: id,
    studentId: `S${id}`,
    nameKm,
    gender: 'ប្រុស',
    dateOfBirth: '01/01/2013',
    status,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('Academic year month resolution', () => {
  it('resolves Nov 2026..Feb 2027 and Apr..Jun 2027 across calendar year boundary', () => {
    expect(resolveAcademicMonthKey('2026-2027', 11)).toBe('2026-11');
    expect(resolveAcademicMonthKey('2026-2027', 12)).toBe('2026-12');
    expect(resolveAcademicMonthKey('2026-2027', 1)).toBe('2027-01');
    expect(resolveAcademicMonthKey('2026-2027', 2)).toBe('2027-02');
    expect(resolveAcademicMonthKey('2026-2027', 4)).toBe('2027-04');
    expect(resolveAcademicMonthKey('២០២៦-២០២៧', 11)).toBe('2026-11');
    expect(resolveAcademicMonthKey('២០២៦-២០២៧', 6)).toBe('2027-06');
  });
});

describe('Score input parsing & subject groups', () => {
  it('accepts Khmer & Arabic digits and dot or comma decimals, rejects out-of-range', () => {
    expect(parseScoreInput('', 50)).toEqual({ valid: true, value: null });
    expect(parseScoreInput('40.5', 50)).toEqual({ valid: true, value: 40.5 });
    expect(parseScoreInput('៤០,៥', 50)).toEqual({ valid: true, value: 40.5 });
    expect(parseScoreInput('0', 50)).toEqual({ valid: true, value: 0 });
    expect(parseScoreInput('50', 50)).toEqual({ valid: true, value: 50 });
    expect(parseScoreInput('50.1', 50)).toEqual({ valid: false, value: null });
    expect(parseScoreInput('-1', 50)).toEqual({ valid: false, value: null });
    expect(parseScoreInput('abc', 50)).toEqual({ valid: false, value: null });
  });

  it('merges adjacent subjects sharing the same group', () => {
    const subjects: Subject[] = [
      { id: 'd', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 1 },
      { id: 'e', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 2 },
      { id: 'm', name: 'គណិតវិទ្យា', maxScore: 50, order: 3 },
    ];
    const spans = buildSubjectHeaderSpans(subjects);
    expect(spans).toHaveLength(2);
    expect(spans[0].group).toBe('អក្សរសាស្ត្រខ្មែរ');
    expect(spans[0].subjects).toHaveLength(2);
    expect(spans[1].group).toBeUndefined();
  });
});

describe('Grading formulas & competition ranking', () => {
  const threeSubjects: Subject[] = [
    { id: 's1', name: 'A', maxScore: 50, order: 1 },
    { id: 's2', name: 'B', maxScore: 50, order: 2 },
    { id: 's3', name: 'C', maxScore: 50, order: 3 },
  ];

  it('computes 3 subjects max 50 each (40, 30, blank) with blank-as-0 OFF and ON', () => {
    const scores = { s1: 40, s2: 30, s3: null };

    const off = computeScoreRow(scores, threeSubjects, { scale: 50, countBlankAsZero: false });
    expect(off.total).toBe(70);
    expect(off.average).toBeCloseTo(35.0, 10);
    expect(formatScoreDecimal(off.average)).toBe('35.00');
    expect(off.passed).toBe(true);

    const on = computeScoreRow(scores, threeSubjects, { scale: 50, countBlankAsZero: true });
    expect(on.total).toBe(70);
    expect(on.average).toBeCloseTo((70 / 150) * 50, 10); // 23.3333...
    expect(formatScoreDecimal(on.average)).toBe('23.33');
    expect(on.passed).toBe(false);
  });

  it('returns null total and average when a student has all blanks', () => {
    const blankRow = computeScoreRow({ s1: null, s2: null, s3: null }, threeSubjects, {
      scale: 50,
      countBlankAsZero: true,
    });
    expect(blankRow.total).toBeNull();
    expect(blankRow.average).toBeNull();
  });

  it('computes standard competition ranking (1, 2, 2, 4) and leaves null unranked', () => {
    const ranks = computeCompetitionRanks([
      { id: 1, value: 40 },
      { id: 2, value: 38 },
      { id: 3, value: 38 },
      { id: 4, value: 35 },
      { id: 5, value: null },
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
    expect(ranks.get(3)).toBe(2);
    expect(ranks.get(4)).toBe(4);
    expect(ranks.get(5)).toBeNull();
  });

  it('computes semester and annual averages with configurable weights and ranks only active students', () => {
    const subjects: Subject[] = [
      { id: 'kh', name: 'ខ្មែរ', maxScore: 50, order: 1 },
      { id: 'ma', name: 'គណិត', maxScore: 50, order: 2 },
    ];
    const students = [
      makeStudent(1, 'សិស្ស 1', 'active'),
      makeStudent(2, 'សិស្ស 2', 'dropped'),
      makeStudent(3, 'សិស្ស 3', 'active'),
    ];

    const config: ScoreConfig = {
      ...DEFAULT_SCORE_CONFIG,
      scale: 50,
      wMonthly: 1,
      wExam: 2, // configurable weight test: (monthly*1 + exam*2) / 3
      wSem1: 1,
      wSem2: 1,
      sem1Months: [11, 12],
      sem2Months: [4, 5],
    };

    const summary = computeSemesterAnnualSummary({
      students,
      subjects,
      academicYear: '2026-2027',
      monthlyRecords: [
        // Student 1: Nov = (40+40)/100*50 = 40, Dec = (30+30)/100*50 = 30 -> mean = 35
        { classId: 1, studentRef: 1, month: '2026-11', scores: { kh: 40, ma: 40 } },
        { classId: 1, studentRef: 1, month: '2026-12', scores: { kh: 30, ma: 30 } },
        { classId: 1, studentRef: 1, month: '2027-04', scores: { kh: 44, ma: 44 } },
        // Student 2 (dropped): higher scores, must NOT be ranked
        { classId: 1, studentRef: 2, month: '2026-11', scores: { kh: 50, ma: 50 } },
        // Student 3: Nov = 20
        { classId: 1, studentRef: 3, month: '2026-11', scores: { kh: 20, ma: 20 } },
        { classId: 1, studentRef: 3, month: '2027-04', scores: { kh: 24, ma: 24 } },
      ],
      semesterExams: [
        // Student 1 S1 exam = 41 -> S1 avg = (35*1 + 41*2)/3 = 39
        { classId: 1, studentRef: 1, semester: 1, scores: { kh: 41, ma: 41 } },
        // Student 1 S2 exam = 41 -> S2 avg = (44*1 + 41*2)/3 = 42 -> Annual = (39+42)/2 = 40.5
        { classId: 1, studentRef: 1, semester: 2, scores: { kh: 41, ma: 41 } },
        { classId: 1, studentRef: 2, semester: 1, scores: { kh: 50, ma: 50 } },
        { classId: 1, studentRef: 3, semester: 1, scores: { kh: 20, ma: 20 } },
        { classId: 1, studentRef: 3, semester: 2, scores: { kh: 24, ma: 24 } },
      ],
      config,
    });

    const s1 = summary[0];
    const s2 = summary[1];
    const s3 = summary[2];

    expect(s1.sem1MonthlyAvg).toBeCloseTo(35, 10);
    expect(s1.sem1ExamAvg).toBeCloseTo(41, 10);
    expect(s1.sem1Avg).toBeCloseTo(39, 10);
    expect(s1.sem2Avg).toBeCloseTo(42, 10);
    expect(s1.annualAvg).toBeCloseTo(40.5, 10);
    expect(s1.annualPassed).toBe(true);
    expect(s1.sem1Rank).toBe(1);
    expect(s1.annualRank).toBe(1);

    // Dropped student has averages computed if data exists, but NO rank
    expect(s2.sem1Rank).toBeNull();
    expect(s2.sem1SubjectRanks['kh']).toBeNull();

    // Student 3 is rank 2 (not 3, because dropped student 2 is unranked)
    expect(s3.sem1Rank).toBe(2);
    expect(s3.annualRank).toBe(2);
    expect(s3.annualPassed).toBe(false);
  });

  it('ignores deleted/removed subjects without corrupting remaining subjects', () => {
    const afterDelete: Subject[] = [
      { id: 's1', name: 'A', maxScore: 50, order: 1 },
      { id: 's3', name: 'C', maxScore: 50, order: 2 },
    ];
    const row = computeScoreRow(
      { s1: 40, s2_deleted: 45, s3: 30 },
      afterDelete,
      { scale: 50, countBlankAsZero: false }
    );
    expect(row.total).toBe(70);
    expect(row.average).toBeCloseTo(35, 10);
  });

  it('numbers lower-secondary preset 1..15 like the scorebook, ICT as 16, blank extras unnumbered', () => {
    const preset = createLowerSecondarySubjects();
    const spans = buildSubjectHeaderSpans(preset);
    const colNums = buildSubjectColumnNumbers(spans);

    // Total subcolumns covered === 19
    expect(colNums.reduce((acc, c) => acc + c.colSpan, 0)).toBe(19);
    // First column spans 2 subcolumns and has columnNumber 1
    expect(colNums[0].colSpan).toBe(2);
    expect(colNums[0].columnNumber).toBe(1);
    // Official scorebook columns keep numbers 1..15; the school's ICT subject is 16
    expect(colNums.slice(0, 16).map((c) => c.columnNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    // Last 2 extra columns remain unnumbered (null)
    expect(colNums.slice(16).map((c) => c.columnNumber)).toEqual([null, null]);
  });

  it('sets lower-secondary preset per MoEYS §4.1: Khmer 60+40=100, math 100, others 50', () => {
    const preset = createLowerSecondarySubjects();
    const byId = new Map(preset.map((s) => [s.id, s]));

    expect(byId.get('kh_essay')?.maxScore).toBe(60);
    expect(byId.get('kh_dictation')?.maxScore).toBe(40);
    expect(byId.get('math')?.maxScore).toBe(100);
    expect(byId.get('physics')?.maxScore).toBe(50);
    expect(byId.get('foreign_lang')?.maxScore).toBe(50);

    const collapsed = collapseGroupedSubjects(preset);
    const khGroup = collapsed.find((c) => c.name === 'អក្សរសាស្ត្រខ្មែរ');
    expect(khGroup).toBeDefined();
    expect(khGroup?.isGroup).toBe(true);
    expect(khGroup?.maxScore).toBe(100);
    expect(khGroup?.partIds).toEqual(['kh_essay', 'kh_dictation']);
  });

  it('collapses grouped Khmer subject with hand-computed totals, blanks, and semester summary rank', () => {
    const subjects: Subject[] = [
      { id: 'kh_dictation', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 1 },
      { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 2 },
      { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 3 },
      { id: 'other', name: 'រូបវិទ្យា', maxScore: 50, order: 4 },
    ];

    // Overall score row: Khmer 40 + 45 = 85/100, Math 70/100, Other 30/50 -> 185/250 * 50 = 37.00
    const s1Scores = { kh_dictation: 40, kh_essay: 45, math: 70, other: 30 };
    const overall = computeScoreRow(s1Scores, subjects, { scale: 50, countBlankAsZero: false });
    expect(overall.total).toBe(185);
    expect(overall.maxScoreUsed).toBe(250);
    expect(overall.average).toBeCloseTo(37.0, 10);

    // Collapsed group scoring + blank handling
    const collapsed = collapseGroupedSubjects(subjects);
    expect(collapsed.map((c) => c.name)).toEqual(['អក្សរសាស្ត្រខ្មែរ', 'គណិតវិទ្យា', 'រូបវិទ្យា']);
    const khCol = collapsed[0];

    expect(
      computeCollapsedSubjectScore(khCol, s1Scores, { scale: 50, countBlankAsZero: false })
    ).toEqual({
      score: 85,
      maxScore: 100,
      maxScoreUsed: 100,
      average: 42.5,
    });

    // All parts blank -> blank even with countBlankAsZero: true
    expect(
      computeCollapsedSubjectScore(
        khCol,
        { kh_dictation: null, kh_essay: null },
        { scale: 50, countBlankAsZero: true }
      )
    ).toEqual({
      score: null,
      maxScore: 100,
      maxScoreUsed: 0,
      average: null,
    });

    // Partial blank (40 + blank): countBlankAsZero OFF uses 50, ON uses 100
    expect(
      computeCollapsedSubjectScore(
        khCol,
        { kh_dictation: 40, kh_essay: null },
        { scale: 50, countBlankAsZero: false }
      )
    ).toEqual({
      score: 40,
      maxScore: 100,
      maxScoreUsed: 50,
      average: 40,
    });
    expect(
      computeCollapsedSubjectScore(
        khCol,
        { kh_dictation: 40, kh_essay: null },
        { scale: 50, countBlankAsZero: true }
      )
    ).toEqual({
      score: 40,
      maxScore: 100,
      maxScoreUsed: 100,
      average: 20,
    });

    // Semester summary produces ONE Khmer column with 85 and ONE Khmer rank
    const summary = computeSemesterAnnualSummary({
      students: [makeStudent(1, 'សិស្ស ក'), makeStudent(2, 'សិស្ស ខ')],
      subjects,
      academicYear: '2026-2027',
      monthlyRecords: [],
      semesterExams: [
        { classId: 1, studentRef: 1, semester: 1, scores: s1Scores },
        {
          classId: 1,
          studentRef: 2,
          semester: 1,
          scores: { kh_dictation: 48, kh_essay: 42, math: 60, other: 40 }, // Khmer = 90 > 85
        },
      ],
      config: DEFAULT_SCORE_CONFIG,
    });

    expect(Object.keys(summary[0].sem1ExamScores)).toEqual([khCol.id, 'math', 'other']);
    expect(summary[0].sem1ExamScores[khCol.id]).toBe(85);
    expect(summary[1].sem1ExamScores[khCol.id]).toBe(90);
    expect(summary[0].sem1SubjectRanks[khCol.id]).toBe(2);
    expect(summary[1].sem1SubjectRanks[khCol.id]).toBe(1);
    expect(summary[0].sem1ExamTotal).toBe(185);
    expect(summary[0].sem1ExamAvg).toBeCloseTo(37.0, 10);
  });

  it('computes lower-secondary preset full marks (divisor 16, avg 50), bonus subject, inactive ignore, and gradeFor', () => {
    const preset = createLowerSecondarySubjects();
    const activeStandardFull: Record<string, number> = {};
    for (const s of preset) {
      if (isSubjectActive(s)) {
        activeStandardFull[s.id] = s.maxScore;
      }
    }

    // 1. 14 active subjects all full marks, all standard -> maxSum 750 (divisor 15), avg 50
    const allStd = computeScoreRow(activeStandardFull, preset, {
      scale: 50,
      countBlankAsZero: false,
    });
    expect(allStd.maxScoreUsed).toBe(750);
    expect(allStd.maxScoreUsed / 50).toBe(15);
    expect(allStd.total).toBe(750);
    expect(allStd.average).toBeCloseTo(50, 10);
    expect(allStd.grade).toBe('A');

    // 2. foreign_lang is bonus with score 40 -> total 700 + 15 = 715, divisor 14, avg 51.0714... (unclamped)
    const withBonusPreset = preset.map((s) =>
      s.id === 'foreign_lang' ? { ...s, isBonus: true } : s
    );
    const bonusScores = { ...activeStandardFull, foreign_lang: 40 };
    const withBonus = computeScoreRow(bonusScores, withBonusPreset, {
      scale: 50,
      countBlankAsZero: false,
    });
    expect(withBonus.maxScoreUsed).toBe(700);
    expect(withBonus.maxScoreUsed / 50).toBe(14);
    expect(withBonus.total).toBe(715);
    expect(withBonus.average).toBeCloseTo((715 / 700) * 50, 10);
    expect(withBonus.grade).toBe('A');

    // 3. Bonus score 20 (below half of 50) -> contributes 0
    const lowBonus = computeScoreRow(
      { ...activeStandardFull, foreign_lang: 20 },
      withBonusPreset,
      { scale: 50, countBlankAsZero: false }
    );
    expect(lowBonus.total).toBe(700);
    expect(lowBonus.average).toBeCloseTo(50, 10);

    // 4. Row with ONLY bonus score and no standard score -> average null
    const onlyBonus = computeScoreRow({ foreign_lang: 45 }, withBonusPreset, {
      scale: 50,
      countBlankAsZero: true,
    });
    expect(onlyBonus.average).toBeNull();
    expect(onlyBonus.total).toBeNull();

    // 5. Inactive subject with a score -> ignored
    const withInactiveScore = computeScoreRow(
      { ...activeStandardFull, agriculture: 50, extra_2: 45 },
      preset,
      { scale: 50, countBlankAsZero: false }
    );
    expect(withInactiveScore.total).toBe(750);
    expect(withInactiveScore.maxScoreUsed).toBe(750);

    // 6. gradeFor boundaries
    expect(gradeFor(44.99)).toBe('B');
    expect(gradeFor(45)).toBe('A');
    expect(gradeFor(24.99)).toBe('F');
    expect(gradeFor(25)).toBe('E');
    expect(gradeFor(null)).toBeNull();

    // 7. isSubjectBonus helper default
    expect(isSubjectBonus({ isBonus: undefined })).toBe(false);
    expect(isSubjectBonus({ isBonus: true })).toBe(true);
  });
});
