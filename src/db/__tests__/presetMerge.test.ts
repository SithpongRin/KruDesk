import { describe, expect, it } from 'vitest';
import { createLowerSecondarySubjects, mergeSubjectsWithPreset } from '../presets';
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
    expect(byId.get('subj_4')?.name).toBe('អប់រំកាយ-កីឡា');
    expect(byId.get('subj_14')?.name).toBe('សិល្បៈ');
    expect(byId.get('subj_14')?.isActive).toBeUndefined();
    expect(byId.get('subj_13')?.isActive).toBe(false);
    expect(byId.get('extra_1')?.name).toBe('បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន');
    expect(byId.has('pe')).toBe(false);
    expect(byId.has('arts')).toBe(false);
    expect(byId.has('ict')).toBe(false);

    // 15 active subjects -> divisor 16
    const activeMax = subjects
      .filter((s) => s.isActive !== false)
      .reduce((acc, s) => acc + s.maxScore, 0);
    expect(activeMax).toBe(800);
    expect(subjects.map((s) => s.order)).toEqual(subjects.map((_, i) => i + 1));
  });

  it('never lowers maxScore below an entered score and keeps scored subjects active', () => {
    const highest = new Map<string, number>([
      ['kh_dictation', 45], // above the new max 40
      ['kh_essay', 48],
      ['subj_13', 30], // preset turns agriculture off, but it has scores
    ]);
    const { subjects, keptMaxScores } = mergeSubjectsWithPreset(
      oldPresetClassSubjects(),
      createLowerSecondarySubjects(),
      highest
    );
    const byId = new Map(subjects.map((s) => [s.id, s]));

    expect(byId.get('kh_dictation')?.maxScore).toBe(50);
    expect(byId.get('kh_essay')?.maxScore).toBe(60);
    expect(byId.get('subj_13')?.isActive).toBeUndefined();
    expect(keptMaxScores).toEqual([
      { subjectId: 'kh_dictation', name: 'សរសេរតាមអាន', maxScore: 50, highestScore: 45 },
    ]);
  });

  it('keeps teacher-added and teacher-renamed legacy subjects, and a chosen bonus flag', () => {
    const existing = oldPresetClassSubjects().map((s) => {
      if (s.id === 'subj_14') return { ...s, name: 'តន្ត្រី (គ្រូកែ)' };
      if (s.id === 'foreign_lang') return { ...s, isBonus: true };
      return s;
    });
    existing.push({ id: 'subj_custom_1', name: 'ភាសាចិន', maxScore: 50, order: 20 });

    const { subjects } = mergeSubjectsWithPreset(existing, createLowerSecondarySubjects());
    const byId = new Map(subjects.map((s) => [s.id, s]));

    // Renamed legacy subject is the teacher's own: unchanged, placed after preset rows
    expect(byId.get('subj_14')?.name).toBe('តន្ត្រី (គ្រូកែ)');
    // The preset's arts row is then added fresh
    expect(byId.get('arts')?.name).toBe('សិល្បៈ');
    expect(byId.get('subj_custom_1')?.name).toBe('ភាសាចិន');
    expect(subjects.slice(-2).map((s) => s.id)).toEqual(['subj_14', 'subj_custom_1']);
    expect(byId.get('foreign_lang')?.isBonus).toBe(true);
  });
});

describe('subjectsDifferFromPreset', () => {
  it('is false for the preset itself and true for an old 11/12-subject list', async () => {
    const { subjectsDifferFromPreset, getPresetSubjects } = await import('../presets');
    const preset = getPresetSubjects('lower-secondary');
    expect(subjectsDifferFromPreset(preset, preset)).toBe(false);
    expect(preset.filter((s) => s.isActive !== false)).toHaveLength(15);

    const old = preset
      .filter((s) => !['home_econ', 'arts', 'ict', 'pe'].includes(s.id))
      .map((s) => (s.id === 'math' ? { ...s, maxScore: 50 } : s));
    expect(subjectsDifferFromPreset(old, preset)).toBe(true);
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
    expect(active).toHaveLength(15);
    expect(subjects.filter((s) => s.id.startsWith('subj_hand_'))).toHaveLength(5);
    expect(subjects.find((s) => s.id === 'subj_hand_2')).toMatchObject({ name: 'គណិតវិទ្យា', maxScore: 100, order: 3 });
    expect(subjects.find((s) => s.id === 'subj_hand_0')).toMatchObject({ maxScore: 40, order: 1 });
    expect(new Set(subjects.map((s) => s.name)).size).toBe(subjects.length);
  });
});
