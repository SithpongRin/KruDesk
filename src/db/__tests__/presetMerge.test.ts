import { describe, expect, it } from 'vitest';
import {
  createLowerSecondarySubjects,
  mergeSubjectsWithPreset,
  subjectsDifferFromPreset,
} from '../presets';
import { computeScoreRow } from '../../lib/grading';
import type { Subject } from '../../types/domain';

/** Subject list of a class created with the OLD lower-secondary preset (like a real 8A). */
function oldPresetClassSubjects(): Subject[] {
  const raw: Array<[string, string, number, string?]> = [
    ['kh_dictation', 'សរសេរតាមអាន', 50, 'អក្សរសាស្ត្រខ្មែរ'],
    ['kh_essay', 'តែងសេចក្ដី', 50, 'អក្សរសាស្ត្រខ្មែរ'],
    ['math', 'គណិតវិទ្យា', 50],
    ['foreign_lang', 'ភាសាបរទេស (អង់គ្លេស ឬ បារាំង)', 50],
    ['subj_4', 'អប់រំកាយ កីឡា និងសុខភាព', 50],
    ['physics', 'រូបវិទ្យា', 50],
    ['chemistry', 'គីមីវិទ្យា', 50],
    ['biology', 'ជីវវិទ្យា', 50],
    ['earth_science', 'ផែនដីវិទ្យា', 50],
    ['civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 50],
    ['history', 'ប្រវត្តិវិទ្យា', 50],
    ['geography', 'ភូមិវិទ្យា', 50],
    ['home_econ', 'គេហវិទ្យា', 50],
    ['subj_13', 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)', 50],
    ['subj_14', 'គំនូរ របាំ តន្ត្រី ចម្រៀង', 50],
    ['life_skills', 'បំណិនជីវិតតាមមូលដ្ឋាន', 50],
    ['extra_1', 'មុខវិជ្ជាបន្ថែម 1', 50],
    ['extra_2', 'មុខវិជ្ជាបន្ថែម 2', 50],
    ['extra_3', 'មុខវិជ្ជាបន្ថែម 3', 50],
  ];
  return raw.map(([id, name, maxScore, group], idx) => ({
    id,
    name,
    maxScore,
    order: idx + 1,
    ...(group ? { group } : {}),
    ...(idx >= 13 ? { isActive: false } : {}),
  }));
}

describe('mergeSubjectsWithPreset', () => {
  it('applies the school preset to an old class without changing subject ids', () => {
    const { subjects, keptMaxScores } = mergeSubjectsWithPreset(
      oldPresetClassSubjects(),
      createLowerSecondarySubjects()
    );
    const byId = new Map(subjects.map((s) => [s.id, s]));

    expect(keptMaxScores).toEqual([]);
    expect(subjects).toHaveLength(19);
    expect(byId.get('kh_dictation')?.maxScore).toBe(40);
    expect(byId.get('kh_essay')?.maxScore).toBe(60);
    expect(byId.get('math')?.maxScore).toBe(100);
    expect(byId.get('foreign_lang')?.name).toBe('ភាសាបរទេស');

    // Legacy ids keep their id but take the preset row
    expect(byId.get('subj_4')?.name).toBe('អប់រំកាយ កីឡា និងសុខភាព');
    expect(byId.get('subj_14')?.name).toBe('សិល្បៈ');
    expect(byId.get('subj_14')?.isActive).toBe(false);
    expect(byId.get('subj_13')?.isActive).toBe(false);
    expect(byId.get('extra_1')?.name).toBe('បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន');
    expect(byId.get('extra_1')?.isActive).toBe(false);
    expect(byId.get('life_skills')?.isActive).toBeUndefined();
    expect(byId.has('pe')).toBe(false);
    expect(byId.has('arts')).toBe(false);
    expect(byId.has('ict')).toBe(false);

    // 14 active subjects -> divisor 15 (MoEYS §4.1)
    const activeMax = subjects
      .filter((s) => s.isActive !== false)
      .reduce((acc, s) => acc + s.maxScore, 0);
    expect(activeMax).toBe(750);
    expect(subjects.map((s) => s.order)).toEqual(subjects.map((_, i) => i + 1));
  });

  it('never lowers maxScore below an entered score and turns off non-preset subjects even when scored', () => {
    const highest = new Map<string, number>([
      ['kh_dictation', 45], // above the new max 40
      ['kh_essay', 48],
      ['subj_13', 30], // preset turns agriculture off; stays off (scores kept in DB)
    ]);
    const { subjects, keptMaxScores, deactivatedSubjects } = mergeSubjectsWithPreset(
      oldPresetClassSubjects(),
      createLowerSecondarySubjects(),
      highest
    );
    const byId = new Map(subjects.map((s) => [s.id, s]));

    expect(byId.get('kh_dictation')?.maxScore).toBe(50);
    expect(byId.get('kh_essay')?.maxScore).toBe(60);
    expect(byId.get('subj_13')?.isActive).toBe(false);
    expect(deactivatedSubjects.some((d) => d.subjectId === 'subj_13' && d.hasScores)).toBe(true);
    expect(keptMaxScores).toEqual([
      { subjectId: 'kh_dictation', name: 'សរសេរតាមអាន', maxScore: 50, highestScore: 45 },
    ]);
  });

  it('keeps teacher-added and teacher-renamed legacy subjects (turned off), and a chosen bonus flag', () => {
    const existing = oldPresetClassSubjects().map((s) => {
      if (s.id === 'subj_14') return { ...s, name: 'តន្ត្រី (គ្រូកែ)' };
      if (s.id === 'foreign_lang') return { ...s, isBonus: true };
      return s;
    });
    existing.push({ id: 'subj_custom_1', name: 'ភាសាចិន', maxScore: 50, order: 20 });

    const { subjects, deactivatedSubjects } = mergeSubjectsWithPreset(
      existing,
      createLowerSecondarySubjects()
    );
    const byId = new Map(subjects.map((s) => [s.id, s]));

    // Renamed legacy subject and teacher-added subject are kept (scores safe) with isActive: false
    expect(byId.get('subj_14')?.name).toBe('តន្ត្រី (គ្រូកែ)');
    expect(byId.get('subj_14')?.isActive).toBe(false);
    expect(byId.get('arts')?.name).toBe('សិល្បៈ');
    expect(byId.get('subj_custom_1')?.name).toBe('ភាសាចិន');
    expect(byId.get('subj_custom_1')?.isActive).toBe(false);
    expect(deactivatedSubjects.some((d) => d.subjectId === 'subj_custom_1')).toBe(true);
    expect(subjects.slice(-2).map((s) => s.id)).toEqual(['subj_14', 'subj_custom_1']);
    expect(byId.get('foreign_lang')?.isBonus).toBe(true);
  });

  it('migrates a 15-subject school class (with arts & ict scores) to the MoEYS 14-subject preset cleanly', () => {
    const school15: Subject[] = [
      { id: 'kh_dictation', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 40, order: 1 },
      { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 60, order: 2 },
      { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 3 },
      { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50, order: 4 },
      { id: 'pe', name: 'អប់រំកាយ-កីឡា', maxScore: 50, order: 5 },
      { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50, order: 6 },
      { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 50, order: 7 },
      { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 50, order: 8 },
      { id: 'earth_science', name: 'ផែនដីវិទ្យា', maxScore: 50, order: 9 },
      { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: 50, order: 10 },
      { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 50, order: 11 },
      { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 50, order: 12 },
      { id: 'home_econ', name: 'គេហវិទ្យា', maxScore: 50, order: 13 },
      { id: 'agriculture', name: 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)', maxScore: 50, order: 14, isActive: false },
      { id: 'arts', name: 'សិល្បៈ', maxScore: 50, order: 15 },
      { id: 'life_skills', name: 'បំណិនជីវិតតាមមូលដ្ឋាន', maxScore: 50, order: 16, isActive: false },
      { id: 'ict', name: 'បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន', maxScore: 50, order: 17 },
      { id: 'extra_2', name: 'មុខវិជ្ជាបន្ថែម 2', maxScore: 50, order: 18, isActive: false },
      { id: 'extra_3', name: 'មុខវិជ្ជាបន្ថែម 3', maxScore: 50, order: 19, isActive: false },
    ];

    const studentScores: Record<string, number> = {
      kh_essay: 48, kh_dictation: 34, math: 82, physics: 40, chemistry: 38, biology: 42,
      earth_science: 36, civics: 44, geography: 40, history: 38, foreign_lang: 41,
      home_econ: 43, pe: 46, arts: 45, ict: 47,
    };
    const highest = new Map(Object.entries(studentScores));
    const preset = createLowerSecondarySubjects();

    const { subjects, deactivatedSubjects, migratedSubjects } = mergeSubjectsWithPreset(
      school15,
      preset,
      highest
    );

    const active = subjects.filter((s) => s.isActive !== false);
    expect(active).toHaveLength(14);
    expect(active.reduce((sum, s) => sum + s.maxScore, 0)).toBe(750);

    // arts keeps its id ('arts') and carries scores into life_skills
    const artsRow = subjects.find((s) => s.id === 'arts');
    expect(artsRow?.name).toBe('បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម គេហកិច្ច…)');
    expect(artsRow?.isActive).toBeUndefined();
    expect(migratedSubjects).toEqual([
      {
        subjectId: 'arts',
        fromName: 'សិល្បៈ',
        toName: 'បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម គេហកិច្ច…)',
      },
    ]);

    // old empty life_skills is neither active nor duplicated; no duplicate ids anywhere
    const ids = subjects.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(subjects.find((s) => s.id === 'life_skills')).toBeUndefined();

    // ict is turned off even though it has scores, and reported in deactivatedSubjects
    expect(subjects.find((s) => s.id === 'ict')?.isActive).toBe(false);
    expect(deactivatedSubjects.some((d) => d.subjectId === 'ict' && d.hasScores)).toBe(true);

    // Banner disappears after merge
    expect(subjectsDifferFromPreset(subjects, preset)).toBe(false);

    // Student average = (sum of 14 active subjects ÷ 750) × 50 (ict excluded, arts included!)
    const expectedSum14 =
      48 + 34 + 82 + 40 + 38 + 42 + 36 + 44 + 40 + 38 + 41 + 43 + 46 + 45; // 617
    const row = computeScoreRow(studentScores, subjects, {
      scale: 50,
      countBlankAsZero: true,
    });
    expect(row.total).toBe(expectedSum14);
    expect(row.average).toBeCloseTo((expectedSum14 / 750) * 50, 10);

    // Re-merging after promotion is idempotent and does not report a duplicate migration
    const second = mergeSubjectsWithPreset(subjects, preset, highest);
    expect(second.migratedSubjects).toEqual([]);
    expect(second.subjects.filter((s) => s.isActive !== false)).toHaveLength(14);
    expect(subjectsDifferFromPreset(second.subjects, preset)).toBe(false);
  });

  it('promotes a hand-typed «សិល្បៈ» with scores to life_skills even if an unscored arts row exists', () => {
    const existing: Subject[] = [
      { id: 'arts', name: 'សិល្បៈ', maxScore: 50, order: 1, isActive: false },
      { id: 'subj_hand_arts', name: 'សិល្បៈ', maxScore: 50, order: 2 },
      { id: 'life_skills', name: 'បំណិនជីវិតតាមមូលដ្ឋាន', maxScore: 50, order: 3, isActive: false },
    ];
    const highest = new Map<string, number>([['subj_hand_arts', 42]]);
    const preset = createLowerSecondarySubjects();

    const { subjects, migratedSubjects } = mergeSubjectsWithPreset(existing, preset, highest);
    const active = subjects.filter((s) => s.isActive !== false);
    expect(active).toHaveLength(14);
    expect(subjects.find((s) => s.id === 'subj_hand_arts')?.name).toBe(
      'បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម គេហកិច្ច…)'
    );
    expect(migratedSubjects).toHaveLength(1);
    expect(migratedSubjects[0].subjectId).toBe('subj_hand_arts');
    expect(new Set(subjects.map((s) => s.id)).size).toBe(subjects.length);
    expect(subjectsDifferFromPreset(subjects, preset)).toBe(false);
  });
});

describe('subjectsDifferFromPreset', () => {
  it('is false for the preset itself and true for an old list (e.g. the 14-subject 750 list)', async () => {
    const { subjectsDifferFromPreset, getPresetSubjects, createLowerSecondarySubjects } =
      await import('../presets');
    const preset = getPresetSubjects('lower-secondary');
    expect(subjectsDifferFromPreset(preset, preset)).toBe(false);
    // 10 counted subjects + ភាសាបរទេស (bonus) are active
    expect(preset.filter((s) => s.isActive !== false)).toHaveLength(11);

    const old = preset.map((s) => (s.id === 'math' ? { ...s, maxScore: 50 } : s));
    expect(subjectsDifferFromPreset(old, preset)).toBe(true);
    expect(subjectsDifferFromPreset(createLowerSecondarySubjects(), preset)).toBe(true);
  });
});

describe('mergeSubjectsWithPreset — hand-typed subjects', () => {
  it('reuses subjects with the same name instead of duplicating them', () => {
    const names = ['សរសេរតាមអាន', 'តែងសេចក្ដី', 'គណិតវិទ្យា', 'ភាសាបរទេស (អង់គ្លេស)', 'សីលធម៌ - ពលរដ្ឋវិជ្ជា'];
    const existing: Subject[] = names.map((name, i) => ({
      id: `subj_hand_${i}`,
      name,
      maxScore: 50,
      order: i + 1,
    }));
    const { subjects } = mergeSubjectsWithPreset(existing, createLowerSecondarySubjects());
    const active = subjects.filter((s) => s.isActive !== false);
    expect(active).toHaveLength(14);
    expect(subjects.filter((s) => s.id.startsWith('subj_hand_'))).toHaveLength(5);
    expect(subjects.find((s) => s.id === 'subj_hand_2')).toMatchObject({ name: 'គណិតវិទ្យា', maxScore: 100, order: 3 });
    expect(subjects.find((s) => s.id === 'subj_hand_1')).toMatchObject({ maxScore: 60, order: 1 });
    expect(subjects.find((s) => s.id === 'subj_hand_0')).toMatchObject({ maxScore: 40, order: 2 });
    expect(new Set(subjects.map((s) => s.name)).size).toBe(subjects.length);
  });

  it('never produces duplicate subject ids when legacy ict merges into a preset that also has ict', () => {
    const existing: Subject[] = [
      { id: 'math', name: 'គណិតវិទ្យា', maxScore: 50, order: 1 },
      { id: 'ict', name: 'ព័ត៌មានវិទ្យា / បំណិនជីវិត', maxScore: 50, order: 2 },
    ];
    const { subjects } = mergeSubjectsWithPreset(existing, createLowerSecondarySubjects());
    const ids = subjects.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'ict')).toHaveLength(1);
    expect(ids.filter((id) => id === 'life_skills')).toHaveLength(1);
  });
});
