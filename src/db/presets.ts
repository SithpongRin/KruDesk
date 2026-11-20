import type { StudyTrack, Subject } from '../types/domain';

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

/**
 * Grades 7–8 per MoEYS instruction ៦៧ អយក.សណន (2026-2027, §4.1):
 * 14 active subjects totalling 750 (÷ 15): តែងសេចក្ដី 60 + សរសេរតាមអាន 40, គណិតវិទ្យា 100,
 * others 50. Extra school-optional subjects (arts, ict, agriculture, extra_2/3) stay in the list
 * with isActive: false so teachers can turn them on if their school teaches them.
 */
export function createLowerSecondarySubjects(): Subject[] {
  const raw: Array<{
    id: string;
    name: string;
    group?: string;
    maxScore?: number;
    isActive?: boolean;
    isBonus?: boolean;
  }> = [
    { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 60 },
    { id: 'kh_dictation', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 40 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 50 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 50 },
    { id: 'earth_science', name: 'ផែនដី និងបរិស្ថានវិទ្យា', maxScore: 50 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: 50 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 50 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 50 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50, isBonus: false },
    { id: 'home_econ', name: 'គេហវិទ្យា', maxScore: 50 },
    { id: 'pe', name: 'អប់រំកាយ កីឡា និងសុខភាព', maxScore: 50 },
    {
      id: 'life_skills',
      name: 'បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម គេហកិច្ច…)',
      maxScore: 50,
    },
    { id: 'arts', name: 'សិល្បៈ', maxScore: 50, isActive: false },
    { id: 'ict', name: 'បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន', maxScore: 50, isActive: false },
    {
      id: 'agriculture',
      name: 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)',
      maxScore: 50,
      isActive: false,
    },
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

/**
 * Grade 10 per MoEYS instruction ៦៧ អយក.សណន (2026-2027, §5.1 ក):
 * 13 subjects totalling 800 (÷ 16).
 */
export function createGrade10Subjects(): Subject[] {
  const raw: Array<{ id: string; name: string; maxScore: number }> = [
    { id: 'khmer', name: 'ភាសាខ្មែរ', maxScore: 150 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: 150 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: 50 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: 37 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: 38 },
    { id: 'earth_science', name: 'ផែនដី និងបរិស្ថានវិទ្យា', maxScore: 25 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: 37 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: 38 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: 38 },
    { id: 'home_econ', name: 'គេហវិទ្យា', maxScore: 37 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 100 },
    { id: 'pe', name: 'អប់រំកាយ កីឡា និងសុខភាព', maxScore: 50 },
    { id: 'life_skills', name: 'បំណិនជីវិតតាមមូលដ្ឋាន', maxScore: 50 },
  ];

  return raw.map((s, idx) => ({
    id: s.id,
    name: s.name,
    maxScore: s.maxScore,
    order: idx + 1,
  }));
}

/**
 * Grade 11 per MoEYS instruction ៦៧ អយក.សណន (2026-2027, §5.1 ខ):
 * 13 subjects totalling 825 (÷ 16.5), science or social-science track.
 */
export function createGrade11Subjects(track: StudyTrack = 'science'): Subject[] {
  const isSocial = track === 'social';
  const raw: Array<{ id: string; name: string; maxScore: number }> = [
    { id: 'khmer', name: 'អក្សរសាស្ត្រខ្មែរ', maxScore: isSocial ? 125 : 75 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: isSocial ? 75 : 125 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: isSocial ? 50 : 75 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: isSocial ? 50 : 75 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: isSocial ? 50 : 75 },
    { id: 'earth_science', name: 'ផែនដី និងបរិស្ថានវិទ្យា', maxScore: 50 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: isSocial ? 75 : 50 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: isSocial ? 75 : 50 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: isSocial ? 75 : 50 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50 },
    { id: 'pe', name: 'អប់រំកាយ កីឡា និងសុខភាព', maxScore: 50 },
    { id: 'economics', name: 'សេដ្ឋកិច្ច', maxScore: 50 },
    { id: 'vocational', name: 'អប់រំវិជ្ជាជីវៈជម្រើស', maxScore: 50 },
  ];

  return raw.map((s, idx) => ({
    id: s.id,
    name: s.name,
    maxScore: s.maxScore,
    order: idx + 1,
  }));
}

/**
 * Grade 12 per MoEYS instruction ៦៧ អយក.សណន (2026-2027, §3.1):
 * 9 regular subjects totalling 625 (÷ 12.5) + ភាសាបរទេស as a bonus (only the part above 25 counts).
 * Non-examined subjects (pe, economics, vocational) stay in the list with isActive: false.
 */
export function createGrade12Subjects(track: StudyTrack = 'science'): Subject[] {
  const isSocial = track === 'social';
  const raw: Array<{
    id: string;
    name: string;
    maxScore: number;
    isActive?: boolean;
    isBonus?: boolean;
  }> = [
    { id: 'khmer', name: 'អក្សរសាស្ត្រខ្មែរ', maxScore: isSocial ? 125 : 75 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: isSocial ? 75 : 125 },
    { id: 'physics', name: 'រូបវិទ្យា', maxScore: isSocial ? 50 : 75 },
    { id: 'chemistry', name: 'គីមីវិទ្យា', maxScore: isSocial ? 50 : 75 },
    { id: 'biology', name: 'ជីវវិទ្យា', maxScore: isSocial ? 50 : 75 },
    { id: 'earth_science', name: 'ផែនដី និងបរិស្ថានវិទ្យា', maxScore: 50 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', maxScore: isSocial ? 75 : 50 },
    { id: 'geography', name: 'ភូមិវិទ្យា', maxScore: isSocial ? 75 : 50 },
    { id: 'history', name: 'ប្រវត្តិវិទ្យា', maxScore: isSocial ? 75 : 50 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស', maxScore: 50, isBonus: true },
    { id: 'pe', name: 'អប់រំកាយ កីឡា និងសុខភាព', maxScore: 50, isActive: false },
    { id: 'economics', name: 'សេដ្ឋកិច្ច', maxScore: 50, isActive: false },
    { id: 'vocational', name: 'អប់រំវិជ្ជាជីវៈជម្រើស', maxScore: 50, isActive: false },
  ];

  return raw.map((s, idx) => ({
    id: s.id,
    name: s.name,
    maxScore: s.maxScore,
    order: idx + 1,
    ...(s.isActive === false ? { isActive: false } : {}),
    ...(s.isBonus === true ? { isBonus: true } : {}),
  }));
}

export function createUpperSecondarySubjects(
  gradeLevel?: number,
  track: StudyTrack = 'science'
): Subject[] {
  if (gradeLevel === 11) return createGrade11Subjects(track);
  if (gradeLevel === 12) return createGrade12Subjects(track);
  return createGrade10Subjects();
}

/**
 * Grade 9 per MoEYS instruction ៦៧ អយក.សណន (2026-2027, §2): monthly and semester scores use
 * the exam subjects only — 10 subjects totalling 420 (÷ 8.4), plus ភាសាបរទេស as a bonus
 * (only the part above 25 is added, not counted in the total). Same ids and column positions
 * as the grades 7–8 preset; the subjects grade 9 does not sit are switched off.
 */
const GRADE_9_MAX_SCORES: Record<string, number> = {
  kh_dictation: 40,
  kh_essay: 60,
  math: 100,
  foreign_lang: 50,
  physics: 35,
  chemistry: 25,
  biology: 35,
  earth_science: 25,
  civics: 35,
  history: 33,
  geography: 32,
};

export function createGrade9Subjects(): Subject[] {
  return createLowerSecondarySubjects().map((s) => {
    const max = GRADE_9_MAX_SCORES[s.id];
    const { isActive: _a, isBonus: _b, ...base } = s;
    if (max === undefined) return { ...base, isActive: false };
    return {
      ...base,
      maxScore: max,
      ...(s.id === 'foreign_lang' ? { isBonus: true } : {}),
    };
  });
}

/** The preset's subjects for a class; grades 9, 10, 11 and 12 follow the ministry's lists. */
export function getPresetSubjects(
  preset: PresetKey,
  gradeLevel?: number,
  track?: StudyTrack
): Subject[] {
  if (preset === 'upper-secondary') return createUpperSecondarySubjects(gradeLevel, track);
  return gradeLevel === 9 ? createGrade9Subjects() : createLowerSecondarySubjects();
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
  subj_4: {
    target: 'pe',
    defaultNames: ['មុខវិជ្ជាទី 4 (កែឈ្មោះ)', 'អប់រំកាយ កីឡា និងសុខភាព', 'អប់រំកាយ-កីឡា'],
  },
  subj_13: {
    target: 'agriculture',
    defaultNames: ['មុខវិជ្ជាទី 13 (កែឈ្មោះ)', 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)'],
  },
  subj_14: {
    target: 'arts',
    defaultNames: ['មុខវិជ្ជាទី 14 (កែឈ្មោះ)', 'គំនូរ របាំ តន្ត្រី ចម្រៀង', 'សិល្បៈ'],
  },
  extra_1: {
    target: 'ict',
    defaultNames: ['មុខវិជ្ជាបន្ថែម 1', 'បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន'],
  },
  ict: { target: 'life_skills', defaultNames: ['ព័ត៌មានវិទ្យា / បំណិនជីវិត'] },
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

export interface DeactivatedSubjectInfo {
  subjectId: string;
  name: string;
  hasScores: boolean;
}

export interface MigratedSubjectInfo {
  subjectId: string;
  fromName: string;
  toName: string;
}

export interface PresetMergeResult {
  subjects: Subject[];
  /** Subjects whose maxScore was NOT lowered because an entered score is above the preset max. */
  keptMaxScores: KeptMaxScore[];
  /** Previously active or scored subjects turned off by the preset (scores kept in DB). */
  deactivatedSubjects: DeactivatedSubjectInfo[];
  /** Subjects whose scores were carried into a matching ministry subject (e.g. សិល្បៈ → បំណិនជីវិតតាមមូលដ្ឋាន). */
  migratedSubjects: MigratedSubjectInfo[];
}

/**
 * Applies a preset to a class's existing subject list WITHOUT losing scores:
 * - Existing subjects keep their ids (scores are keyed by id); legacy ids map onto preset rows.
 * - Name, group, maxScore, order and on/off state come from the preset:
 *   · maxScore is never lowered below the highest score already entered for that subject;
 *   · non-preset or inactive preset subjects (including teacher-added ones) are turned off
 *     (`isActive: false`) even if they have scores — scores remain untouched in IndexedDB;
 *   · if the preset activates `life_skills`, `life_skills` has no scores yet, and `arts`
 *     (or a hand-typed «សិល្បៈ») has scores, `arts` is promoted into the `life_skills` row
 *     keeping its id so those scores carry over;
 *   · a foreign-language bonus setting the teacher chose is kept (and grade 9/12 presets turn it on).
 */
export function mergeSubjectsWithPreset(
  existing: Subject[],
  preset: Subject[],
  highestScoreById: ReadonlyMap<string, number> = new Map()
): PresetMergeResult {
  const byId = new Map(existing.map((s) => [s.id, s]));
  const used = new Set<string>();
  const keptMaxScores: KeptMaxScore[] = [];
  const deactivatedSubjects: DeactivatedSubjectInfo[] = [];
  const migratedSubjects: MigratedSubjectInfo[] = [];

  const presetIds = new Set(preset.map((p) => p.id));

  const findExisting = (presetId: string, presetName: string): Subject | undefined => {
    const direct = byId.get(presetId);
    if (direct && !used.has(direct.id)) return direct;
    for (const [legacyId, rule] of Object.entries(LEGACY_PRESET_IDS)) {
      if (presetIds.has(legacyId)) continue;
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

  // Lower-secondary ministry migration: if `life_skills` is active in the preset and has no
  // scores yet, but `arts` (or legacy subj_14 / hand-typed «សិល្បៈ») has scores, reuse the
  // arts subject as the `life_skills` row so its scores carry over cleanly.
  let promoteArtsToLifeSkills: Subject | undefined;
  const presetLifeSkills = preset.find((p) => p.id === 'life_skills' && p.isActive !== false);
  if (presetLifeSkills) {
    const existingLifeSkills = findExisting('life_skills', presetLifeSkills.name);
    const lifeSkillsHasScores = existingLifeSkills
      ? highestScoreById.has(existingLifeSkills.id)
      : false;
    if (!lifeSkillsHasScores) {
      const artsNorm = normalizeSubjectName('សិល្បៈ');
      const candidates: Subject[] = [];
      const directArts = byId.get('arts');
      if (directArts) candidates.push(directArts);
      const leg14 = byId.get('subj_14');
      if (leg14 && LEGACY_PRESET_IDS.subj_14.defaultNames.includes(leg14.name.trim())) {
        candidates.push(leg14);
      }
      for (const s of existing) {
        if (
          !presetIds.has(s.id) &&
          s.id !== 'subj_14' &&
          normalizeSubjectName(s.name) === artsNorm
        ) {
          candidates.push(s);
        }
      }
      const artsCandidate = candidates.find((c) => highestScoreById.has(c.id));
      if (artsCandidate) {
        promoteArtsToLifeSkills = artsCandidate;
        if (existingLifeSkills && existingLifeSkills.id !== artsCandidate.id) {
          // Drop the empty old life_skills row so it neither stays active nor duplicates.
          used.add(existingLifeSkills.id);
        }
      }
    }
  }

  const merged: Subject[] = [];
  for (const p of preset) {
    if (p.id === 'arts' && promoteArtsToLifeSkills) {
      // Arts was promoted into the life_skills row above; omit the inactive preset arts row
      // so we never create a duplicate id or redundant inactive arts entry.
      continue;
    }

    const ex =
      p.id === 'life_skills' && promoteArtsToLifeSkills
        ? promoteArtsToLifeSkills
        : findExisting(p.id, p.name);

    if (!ex) {
      merged.push({ ...p });
      continue;
    }
    used.add(ex.id);

    if (
      p.id === 'life_skills' &&
      promoteArtsToLifeSkills &&
      ex.id === promoteArtsToLifeSkills.id &&
      normalizeSubjectName(ex.name) !== normalizeSubjectName(p.name)
    ) {
      migratedSubjects.push({ subjectId: ex.id, fromName: ex.name, toName: p.name });
    }

    const highest = highestScoreById.get(ex.id);
    const hasScores = highest !== undefined;
    let maxScore = p.maxScore;
    if (hasScores && highest > p.maxScore) {
      maxScore = Math.max(ex.maxScore, highest);
      keptMaxScores.push({ subjectId: ex.id, name: p.name, maxScore, highestScore: highest });
    }

    const active = p.isActive !== false;
    if (!active && (hasScores || ex.isActive !== false)) {
      deactivatedSubjects.push({ subjectId: ex.id, name: p.name, hasScores });
    }
    // Bonus when the preset says so (grade 9/12 ភាសាបរទេស) or the teacher already chose it.
    const bonus = ex.isBonus === true || p.isBonus === true;
    merged.push({
      id: ex.id,
      name: p.name,
      ...(p.group ? { group: p.group } : {}),
      maxScore,
      order: p.order,
      ...(active ? {} : { isActive: false }),
      ...(bonus ? { isBonus: true } : {}),
    });
  }

  const custom = [...existing]
    .filter((s) => !used.has(s.id) && !merged.some((m) => m.id === s.id))
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const hasScores = highestScoreById.has(s.id);
      if (s.isActive !== false || hasScores) {
        deactivatedSubjects.push({ subjectId: s.id, name: s.name, hasScores });
      }
      return { ...s, isActive: false };
    });

  const subjects = [...merged, ...custom].map((s, idx) => ({ ...s, order: idx + 1 }));
  return { subjects, keptMaxScores, deactivatedSubjects, migratedSubjects };
}
