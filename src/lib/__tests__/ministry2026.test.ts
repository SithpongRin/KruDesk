import { describe, it, expect } from 'vitest';
import { computeScoreRow, displayedAverage, formatAverage } from '../grading';
import {
  createGrade9Subjects,
  createGrade10Subjects,
  createGrade11Subjects,
  createGrade12Subjects,
  createLowerSecondarySubjects,
  getPresetSubjects,
  mergeSubjectsWithPreset,
} from '../../db/presets';
import {
  DEFAULT_SCORE_CONFIG,
  SCORE_RULES_VERSION,
  resolveScoreConfig,
  type Subject,
} from '../../types/domain';

/**
 * Worked examples from MoEYS instruction ៦៧ អយក.សណន (2026-2027), checked against our grading.
 * Semester average = (exam average + monthly-in-semester average) ÷ 2, annual = (S1 + S2) ÷ 2,
 * all on /50 and shown truncated to 2 decimals.
 */
const cfg = { scale: 50 as const, countBlankAsZero: true };
const semAvg = (exam: number, monthly: number) =>
  displayedAverage((displayedAverage(exam) + monthly) / 2);

describe('MoEYS 2026-2027 instruction', () => {
  it('grade 9 (§2): 10 subjects total 420 (÷ 8.4), ភាសាបរទេស adds only the part above 25', () => {
    const subjects = createGrade9Subjects();
    const active = subjects.filter((s) => s.isActive !== false && !s.isBonus);
    expect(active.reduce((sum, s) => sum + s.maxScore, 0)).toBe(420);
    expect(subjects.find((s) => s.id === 'foreign_lang')).toMatchObject({ isBonus: true });

    // Student «ក», semester 1: 285 + (31 − 25) = 291 → 34.64
    const s1 = computeScoreRow(
      {
        math: 70, kh_essay: 32, kh_dictation: 35, physics: 24, chemistry: 20, biology: 17,
        earth_science: 15, civics: 25, geography: 23, history: 24, foreign_lang: 31,
      },
      subjects,
      cfg
    );
    expect(s1.total).toBe(291);
    expect(formatAverage(s1.average)).toBe('34.64');

    // Semester 2: 296 + (33 − 25) = 304 → 36.19
    const s2 = computeScoreRow(
      {
        math: 82, kh_essay: 31, kh_dictation: 28, physics: 20, chemistry: 24, biology: 20,
        earth_science: 22, civics: 21, geography: 25, history: 23, foreign_lang: 33,
      },
      subjects,
      cfg
    );
    expect(s2.total).toBe(304);
    expect(formatAverage(s2.average)).toBe('36.19');

    const sem1 = semAvg(s1.average!, 35.24);
    const sem2 = semAvg(s2.average!, 37.23);
    expect(sem1).toBe(34.94);
    expect(sem2).toBe(36.71);
    expect(formatAverage((sem1 + sem2) / 2)).toBe('35.82');
  });

  it('grades 7–8 (§4): 14 exam subjects total 750 (÷ 15), example «ឃ» → annual 34.39', () => {
    const subjects = createLowerSecondarySubjects();
    const active = subjects.filter((s) => s.isActive !== false && !s.isBonus);
    expect(active).toHaveLength(14);
    expect(active.reduce((sum, s) => sum + s.maxScore, 0)).toBe(750);

    const s1 = computeScoreRow(
      {
        kh_essay: 34, kh_dictation: 38, math: 57, physics: 23, chemistry: 26, biology: 30,
        civics: 28, history: 30, geography: 37, earth_science: 25, foreign_lang: 40,
        home_econ: 24, pe: 45, life_skills: 35,
      },
      subjects,
      cfg
    );
    expect(s1.total).toBe(472);
    expect(formatAverage(s1.average)).toBe('31.46');

    const sem1 = semAvg(s1.average!, 35.24);
    expect(sem1).toBe(33.35);
    expect(formatAverage((sem1 + 35.44) / 2)).toBe('34.39'); // truncated, not rounded
  });

  it('blank counts as 0 by default: the divisor stays the full total', () => {
    const subjects = createLowerSecondarySubjects();
    const row = computeScoreRow({ math: 100 }, subjects, DEFAULT_SCORE_CONFIG);
    // 100 out of 750 (15 × 50) → 6.6666...
    expect(row.average).toBeCloseTo(100 / 15, 5);
  });

  it('getPresetSubjects gives grade 9 its own list; grades 7–8 keep the school list', () => {
    expect(getPresetSubjects('lower-secondary', 9)).toEqual(createGrade9Subjects());
    expect(getPresetSubjects('lower-secondary', 8)).toEqual(createLowerSecondarySubjects());
    expect(getPresetSubjects('lower-secondary')).toEqual(createLowerSecondarySubjects());
  });

  it('merging the grade-9 preset turns the ភាសាបរទេស bonus on and keeps ids', () => {
    const { subjects } = mergeSubjectsWithPreset(createLowerSecondarySubjects(), createGrade9Subjects());
    expect(subjects.find((s) => s.id === 'foreign_lang')?.isBonus).toBe(true);
    expect(subjects.find((s) => s.id === 'physics')?.maxScore).toBe(35);
    expect(subjects.find((s) => s.id === 'arts')?.isActive).toBe(false);
  });

  it('grade 10 (§5.1 ក): 13 subjects total 800 (÷ 16)', () => {
    const subjects = createGrade10Subjects();
    const active = subjects.filter((s) => s.isActive !== false && !s.isBonus);
    expect(active).toHaveLength(13);
    expect(active.reduce((sum, s) => sum + s.maxScore, 0)).toBe(800);
    expect(subjects.find((s) => s.id === 'khmer')?.maxScore).toBe(150);
    expect(subjects.find((s) => s.id === 'math')?.maxScore).toBe(150);
    expect(subjects.find((s) => s.id === 'foreign_lang')?.maxScore).toBe(100);
    expect(subjects.find((s) => s.id === 'foreign_lang')?.isBonus).toBeUndefined();

    const row = computeScoreRow(
      {
        khmer: 120, math: 112, physics: 40, chemistry: 30, biology: 30, earth_science: 20,
        history: 30, geography: 30, civics: 30, home_econ: 30, foreign_lang: 80, pe: 40, life_skills: 40,
      },
      subjects,
      cfg
    );
    expect(row.total).toBe(632);
    // 632 ÷ 16 = 39.50
    expect(formatAverage(row.average)).toBe('39.50');
  });

  it('grade 11 (§5.1 ខ): science & social tracks both total 825 (÷ 16.5), ភាសាបរទេស not bonus', () => {
    const sci = createGrade11Subjects('science');
    const soc = createGrade11Subjects('social');

    expect(sci).toHaveLength(13);
    expect(soc).toHaveLength(13);
    expect(sci.reduce((sum, s) => sum + s.maxScore, 0)).toBe(825);
    expect(soc.reduce((sum, s) => sum + s.maxScore, 0)).toBe(825);
    expect(sci.find((s) => s.id === 'foreign_lang')?.isBonus).toBeUndefined();
    expect(soc.find((s) => s.id === 'foreign_lang')?.isBonus).toBeUndefined();

    // Science: khmer 75, math 125, physics/chemistry/biology 75, geo/hist/civics 50
    expect(sci.find((s) => s.id === 'khmer')?.maxScore).toBe(75);
    expect(sci.find((s) => s.id === 'math')?.maxScore).toBe(125);
    expect(sci.find((s) => s.id === 'physics')?.maxScore).toBe(75);
    expect(sci.find((s) => s.id === 'history')?.maxScore).toBe(50);

    // Social: khmer 125, math 75, physics/chemistry/biology 50, geo/hist/civics 75
    expect(soc.find((s) => s.id === 'khmer')?.maxScore).toBe(125);
    expect(soc.find((s) => s.id === 'math')?.maxScore).toBe(75);
    expect(soc.find((s) => s.id === 'physics')?.maxScore).toBe(50);
    expect(soc.find((s) => s.id === 'history')?.maxScore).toBe(75);

    // Check divisor i = 16.5 on /50
    const rowSci = computeScoreRow(
      {
        khmer: 60, math: 100, physics: 60, chemistry: 55, biology: 55, earth_science: 40,
        geography: 40, history: 40, civics: 40, foreign_lang: 40, pe: 45, economics: 40, vocational: 45,
      },
      sci,
      cfg
    );
    expect(rowSci.total).toBe(660);
    // 660 ÷ 16.5 = 40.00
    expect(formatAverage(rowSci.average)).toBe('40.00');
  });

  it('grade 12 science (§3): 9 regular subjects total 625 (÷ 12.5) + ភាសាបរទេស bonus, example «ខ» → annual 32.45', () => {
    const subjects = createGrade12Subjects('science');
    const activeRegular = subjects.filter((s) => s.isActive !== false && !s.isBonus);
    expect(activeRegular).toHaveLength(9);
    expect(activeRegular.reduce((sum, s) => sum + s.maxScore, 0)).toBe(625);
    expect(subjects.find((s) => s.id === 'foreign_lang')).toMatchObject({ isBonus: true, maxScore: 50 });
    expect(subjects.find((s) => s.id === 'pe')?.isActive).toBe(false);
    expect(subjects.find((s) => s.id === 'economics')?.isActive).toBe(false);
    expect(subjects.find((s) => s.id === 'vocational')?.isActive).toBe(false);

    // Student «ខ», semester 1: 370 + (42 − 25) = 387 → 30.96
    const s1 = computeScoreRow(
      {
        khmer: 70, math: 90, physics: 60, chemistry: 30, biology: 20,
        civics: 30, history: 25, geography: 25, earth_science: 20, foreign_lang: 42,
      },
      subjects,
      cfg
    );
    expect(s1.total).toBe(387);
    expect(formatAverage(s1.average)).toBe('30.96');

    // Semester 2: 315 + (40 − 25) = 330 → 26.40
    const s2 = computeScoreRow(
      {
        khmer: 60, math: 70, physics: 55, chemistry: 20, biology: 30,
        civics: 25, history: 20, geography: 20, earth_science: 15, foreign_lang: 40,
      },
      subjects,
      cfg
    );
    expect(s2.total).toBe(330);
    expect(formatAverage(s2.average)).toBe('26.40');

    const sem1 = semAvg(s1.average!, 35.24);
    const sem2 = semAvg(s2.average!, 37.23);
    expect(sem1).toBe(33.1);
    expect(sem2).toBe(31.81);
    expect(formatAverage((sem1 + sem2) / 2)).toBe('32.45');
  });

  it('grade 12 social (§3): 9 regular subjects total 625 (÷ 12.5) + ភាសាបរទេស bonus, example «គ» → annual 38.55', () => {
    const subjects = createGrade12Subjects('social');
    const activeRegular = subjects.filter((s) => s.isActive !== false && !s.isBonus);
    expect(activeRegular).toHaveLength(9);
    expect(activeRegular.reduce((sum, s) => sum + s.maxScore, 0)).toBe(625);

    // Student «គ», semester 1: 495 + (42 − 25) = 512 → 40.96
    const s1 = computeScoreRow(
      {
        khmer: 90, math: 70, physics: 45, chemistry: 30, biology: 40,
        civics: 50, history: 70, geography: 60, earth_science: 40, foreign_lang: 42,
      },
      subjects,
      cfg
    );
    expect(s1.total).toBe(512);
    expect(formatAverage(s1.average)).toBe('40.96');

    // Semester 2: 495 + (40 − 25) = 510 → 40.80
    const s2 = computeScoreRow(
      {
        khmer: 70, math: 65, physics: 40, chemistry: 35, biology: 40,
        civics: 70, history: 65, geography: 70, earth_science: 40, foreign_lang: 40,
      },
      subjects,
      cfg
    );
    expect(s2.total).toBe(510);
    expect(formatAverage(s2.average)).toBe('40.80');

    const sem1 = semAvg(s1.average!, 35.24);
    const sem2 = semAvg(s2.average!, 37.23);
    expect(sem1).toBe(38.1);
    expect(sem2).toBe(39.01);
    expect(formatAverage((sem1 + sem2) / 2)).toBe('38.55');
  });

  it('getPresetSubjects returns per-grade and per-track lists for grades 10–12', () => {
    expect(getPresetSubjects('upper-secondary', 10)).toEqual(createGrade10Subjects());
    expect(getPresetSubjects('upper-secondary', 11, 'science')).toEqual(createGrade11Subjects('science'));
    expect(getPresetSubjects('upper-secondary', 11, 'social')).toEqual(createGrade11Subjects('social'));
    expect(getPresetSubjects('upper-secondary', 12, 'science')).toEqual(createGrade12Subjects('science'));
    expect(getPresetSubjects('upper-secondary', 12, 'social')).toEqual(createGrade12Subjects('social'));
  });

  it('merging old upper-secondary preset into grade 10 maps legacy ict → life_skills without duplicating', () => {
    const oldUpper: Subject[] = [
      { id: 'khmer', name: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 1 },
      { id: 'math', name: 'គណិតវិទ្យា', maxScore: 50, order: 2 },
      { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50, order: 3 },
      { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50, order: 4 },
      { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 50, order: 5 },
      { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 50, order: 6 },
      { id: 'earth_science', name: 'ផែនដីវិទ្យា', maxScore: 50, order: 7 },
      { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: 50, order: 8 },
      { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 50, order: 9 },
      { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 50, order: 10 },
      { id: 'pe', name: 'អប់រំកាយ និងកីឡា', maxScore: 50, order: 11 },
      { id: 'ict', name: 'ព័ត៌មានវិទ្យា / បំណិនជីវិត', maxScore: 50, order: 12 },
    ];
    const { subjects } = mergeSubjectsWithPreset(oldUpper, createGrade10Subjects());
    expect(subjects).toHaveLength(13);
    // Legacy ict id is reused for life_skills so existing scores stay attached
    const mapped = subjects.find((s) => s.id === 'ict');
    expect(mapped?.name).toBe('បំណិនជីវិតតាមមូលដ្ឋាន');
    expect(subjects.find((s) => s.id === 'life_skills')).toBeUndefined();
    expect(subjects.find((s) => s.id === 'khmer')?.maxScore).toBe(150);
    expect(subjects.find((s) => s.id === 'math')?.maxScore).toBe(150);
  });
});

describe('resolveScoreConfig', () => {
  it('moves a config saved under the old rules to the ministry months and blank = 0', () => {
    const old = { ...DEFAULT_SCORE_CONFIG, sem1Months: [11, 12, 1, 2], sem2Months: [4, 5, 6], countBlankAsZero: false, rulesVersion: undefined, averageDecimalMode: 'round' as const };
    const resolved = resolveScoreConfig(old);
    expect(resolved.sem1Months).toEqual([11, 12, 1]);
    expect(resolved.sem2Months).toEqual([3, 4, 5, 6, 7]);
    expect(resolved.countBlankAsZero).toBe(true);
    expect(resolved.rulesVersion).toBe(SCORE_RULES_VERSION);
    // other choices the teacher made are kept
    expect(resolved.averageDecimalMode).toBe('round');
  });

  it('keeps months and blank setting the teacher changed after the new rules', () => {
    const custom = { sem1Months: [11, 12, 1, 2], countBlankAsZero: false, rulesVersion: SCORE_RULES_VERSION };
    const resolved = resolveScoreConfig(custom);
    expect(resolved.sem1Months).toEqual([11, 12, 1, 2]);
    expect(resolved.countBlankAsZero).toBe(false);
  });

  it('uses the defaults when nothing is saved', () => {
    expect(resolveScoreConfig(undefined)).toEqual(DEFAULT_SCORE_CONFIG);
  });
});
