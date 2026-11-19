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
    // Active subjects follow the teacher's school documents (monthly/semester reports):
    // សរសេរតាមអាន 40 + តែងសេចក្ដី 60, គណិតវិទ្យា 100, others 50 — 15 subjects, divisor 16.
    // Inactive rows keep the official scorebook's column positions (13 and 15) for printing.
    { id: 'kh_dictation', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 40 },
    { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 60 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50, isBonus: false },
    { id: 'pe', name: 'អប់រំកាយ-កីឡា', maxScore: 50 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 50 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 50 },
    { id: 'earth_science', name: 'ផែនដីវិទ្យា', maxScore: 50 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: 50 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 50 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 50 },
    { id: 'home_econ', name: 'គេហវិទ្យា', maxScore: 50 },
    {
      id: 'agriculture',
      name: 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)',
      maxScore: 50,
      isActive: false,
    },
    { id: 'arts', name: 'សិល្បៈ', maxScore: 50 },
    { id: 'life_skills', name: 'បំណិនជីវិតតាមមូលដ្ឋាន', maxScore: 50, isActive: false },
    { id: 'ict', name: 'បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន', maxScore: 50 },
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

/**
 * True when a class's ACTIVE subjects (names, max scores, order) differ from the preset's
 * active subjects — used to remind the teacher to apply the school preset.
 */
export function subjectsDifferFromPreset(subjects: Subject[], preset: Subject[]): boolean {
  const sig = (list: Subject[]) =>
    [...list]
      .filter((s) => s.isActive !== false)
      .sort((a, b) => a.order - b.order)
      .map((s) => `${s.name.trim()}|${s.maxScore}|${s.group ?? ''}`)
      .join('\n');
  return sig(subjects) !== sig(preset);
}

/**
 * Subject ids used by older presets that now correspond to a newer preset id, with the
 * default names they may still carry. A legacy subject the teacher renamed is treated as
 * the teacher's own subject and is left untouched.
 */
const LEGACY_PRESET_IDS: Record<string, { target: string; defaultNames: string[] }> = {
  subj_4: { target: 'pe', defaultNames: ['មុខវិជ្ជាទី 4 (កែឈ្មោះ)', 'អប់រំកាយ កីឡា និងសុខភាព'] },
  subj_13: {
    target: 'agriculture',
    defaultNames: ['មុខវិជ្ជាទី 13 (កែឈ្មោះ)', 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)'],
  },
  subj_14: {
    target: 'arts',
    defaultNames: ['មុខវិជ្ជាទី 14 (កែឈ្មោះ)', 'គំនូរ របាំ តន្ត្រី ចម្រៀង'],
  },
  extra_1: { target: 'ict', defaultNames: ['មុខវិជ្ជាបន្ថែម 1'] },
};

/** Name comparison that ignores spaces, hyphens and any «(…)» note. */
function normalizeSubjectName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/[\s\-–—]/g, '')
    .trim();
}

export interface KeptMaxScore {
  subjectId: string;
  name: string;
  maxScore: number;
  highestScore: number;
}

export interface PresetMergeResult {
  subjects: Subject[];
  /** Subjects whose maxScore was NOT lowered because an entered score is above the preset max. */
  keptMaxScores: KeptMaxScore[];
}

/**
 * Applies a preset to a class's existing subject list WITHOUT losing scores:
 * - Existing subjects keep their ids (scores are keyed by id); legacy ids map onto preset rows.
 * - Name, group, maxScore, order and on/off state come from the preset, except:
 *   · maxScore is never lowered below the highest score already entered for that subject;
 *   · a subject that already has scores stays active even if the preset turns it off;
 *   · a foreign-language bonus setting the teacher chose is kept.
 * - Subjects the teacher added themselves stay, after the preset rows, in their old order.
 */
export function mergeSubjectsWithPreset(
  existing: Subject[],
  preset: Subject[],
  highestScoreById: ReadonlyMap<string, number> = new Map()
): PresetMergeResult {
  const byId = new Map(existing.map((s) => [s.id, s]));
  const used = new Set<string>();
  const keptMaxScores: KeptMaxScore[] = [];

  const presetIds = new Set(preset.map((p) => p.id));

  const findExisting = (presetId: string, presetName: string): Subject | undefined => {
    const direct = byId.get(presetId);
    if (direct) return direct;
    for (const [legacyId, rule] of Object.entries(LEGACY_PRESET_IDS)) {
      const legacy = byId.get(legacyId);
      if (
        rule.target === presetId &&
        legacy &&
        !used.has(legacyId) &&
        rule.defaultNames.includes(legacy.name.trim())
      ) {
        return legacy;
      }
    }
    // A subject the teacher typed in by hand (random id) with the same name as a preset row
    // is the same subject — reuse it instead of adding a duplicate.
    const target = normalizeSubjectName(presetName);
    return existing.find(
      (s) =>
        !used.has(s.id) &&
        !presetIds.has(s.id) &&
        normalizeSubjectName(s.name) === target
    );
  };

  const merged: Subject[] = preset.map((p) => {
    const ex = findExisting(p.id, p.name);
    if (!ex) return { ...p };
    used.add(ex.id);

    const highest = highestScoreById.get(ex.id);
    const hasScores = highest !== undefined;
    let maxScore = p.maxScore;
    if (hasScores && highest > p.maxScore) {
      maxScore = Math.max(ex.maxScore, highest);
      keptMaxScores.push({ subjectId: ex.id, name: p.name, maxScore, highestScore: highest });
    }

    const active = p.isActive !== false || hasScores;
    const bonus = ex.isBonus === true;
    return {
      id: ex.id,
      name: p.name,
      ...(p.group ? { group: p.group } : {}),
      maxScore,
      order: p.order,
      ...(active ? {} : { isActive: false }),
      ...(bonus ? { isBonus: true } : {}),
    };
  });

  const custom = [...existing]
    .filter((s) => !used.has(s.id) && !merged.some((m) => m.id === s.id))
    .sort((a, b) => a.order - b.order);

  const subjects = [...merged, ...custom].map((s, idx) => ({ ...s, order: idx + 1 }));
  return { subjects, keptMaxScores };
}
