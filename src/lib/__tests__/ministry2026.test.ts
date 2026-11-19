import { describe, it, expect } from 'vitest';
import { computeScoreRow, displayedAverage, formatAverage } from '../grading';
import {
  createGrade9Subjects,
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
    const ids: Array<[string, number]> = [
      ['kh_essay', 60], ['kh_dictation', 40], ['math', 100], ['physics', 50], ['chemistry', 50],
      ['biology', 50], ['civics', 50], ['history', 50], ['geography', 50], ['earth_science', 50],
      ['foreign_lang', 50], ['home_econ', 50], ['pe', 50], ['life_skills', 50],
    ];
    const subjects: Subject[] = ids.map(([id, maxScore], i) => ({
      id, name: id, maxScore, order: i + 1,
    }));
    expect(subjects.reduce((sum, s) => sum + s.maxScore, 0)).toBe(750);

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
    // 100 out of 800 (16 × 50) → 6.25
    expect(row.average).toBeCloseTo(6.25, 5);
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
