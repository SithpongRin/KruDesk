import type { Subject } from '../types/domain';

export type PresetKey = 'lower-secondary' | 'upper-secondary';

export const CLASS_COLORS = [
  '#0071e3', // Apple Blue
  '#34c759', // Green
  '#ff9500', // Orange
  '#af52de', // Purple
  '#ff2d55', // Pink
  '#5856d6', // Indigo
  '#00c7be', // Teal
  '#ff3b30', // Red
] as const;

export function createLowerSecondarySubjects(): Subject[] {
  const raw: Array<{
    id: string;
    name: string;
    group?: string;
    maxScore?: number;
    isActive?: boolean;
    isBonus?: boolean;
  }> = [
    { id: 'kh_dictation', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50 },
    { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស (បារាំង ឬ អង់គ្លេស)', maxScore: 50, isBonus: false },
    { id: 'pe', name: 'អប់រំកាយ កីឡា និងសុខភាព', maxScore: 50 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 50 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 50 },
    { id: 'earth_science', name: 'ផែនដីវិទ្យា', maxScore: 50 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: 50 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 50 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 50 },
    { id: 'home_econ', name: 'គេហវិទ្យា', maxScore: 50, isActive: false },
    {
      id: 'agriculture',
      name: 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)',
      maxScore: 50,
      isActive: false,
    },
    { id: 'arts', name: 'គំនូរ របាំ តន្ត្រី ចម្រៀង', maxScore: 50, isActive: false },
    { id: 'life_skills', name: 'បំណិនជីវិតតាមមូលដ្ឋាន', maxScore: 50, isActive: false },
    { id: 'extra_1', name: 'មុខវិជ្ជាបន្ថែម 1', maxScore: 50, isActive: false },
    { id: 'extra_2', name: 'មុខវិជ្ជាបន្ថែម 2', maxScore: 50, isActive: false },
    { id: 'extra_3', name: 'មុខវិជ្ជាបន្ថែម 3', maxScore: 50, isActive: false },
  ];

  return raw.map((s, idx) => ({
    id: s.id,
    name: s.name,
    ...(s.group ? { group: s.group } : {}),
    maxScore: s.maxScore ?? 50,
    order: idx + 1,
    ...(s.isActive === false ? { isActive: false } : {}),
    ...(s.isBonus === true ? { isBonus: true } : {}),
  }));
}

export function createUpperSecondarySubjects(): Subject[] {
  const raw: Array<{ id: string; name: string; group?: string; maxScore?: number }> = [
    { id: 'khmer', name: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: 50 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 50 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 50 },
    { id: 'earth_science', name: 'ផែនដីវិទ្យា', maxScore: 50 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិទ្យា', maxScore: 50 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 50 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 50 },
    { id: 'pe', name: 'អប់រំកាយ និងកីឡា', maxScore: 50 },
    { id: 'ict', name: 'ព័ត៌មានវិទ្យា / បំណិនជីវិត', maxScore: 50 },
  ];

  return raw.map((s, idx) => ({
    id: s.id,
    name: s.name,
    maxScore: s.maxScore ?? 50,
    order: idx + 1,
  }));
}

export function getPresetSubjects(preset: PresetKey): Subject[] {
  return preset === 'lower-secondary'
    ? createLowerSecondarySubjects()
    : createUpperSecondarySubjects();
}
