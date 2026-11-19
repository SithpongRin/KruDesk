import type { MonthlyScore, SemesterExam, Subject } from '../types/domain';

const OLD_PRESET_RENAME_MAP: Record<string, { oldName: string; newName: string }> = {
  subj_4: {
    oldName: 'មុខវិជ្ជាទី 4 (កែឈ្មោះ)',
    newName: 'អប់រំកាយ កីឡា និងសុខភាព',
  },
  subj_13: {
    oldName: 'មុខវិជ្ជាទី 13 (កែឈ្មោះ)',
    newName: 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)',
  },
  subj_14: {
    oldName: 'មុខវិជ្ជាទី 14 (កែឈ្មោះ)',
    newName: 'គំនូរ របាំ តន្ត្រី ចម្រៀង',
  },
  life_skills: {
    oldName: 'បំណិនជីវិត',
    newName: 'បំណិនជីវិតតាមមូលដ្ឋាន',
  },
  civics: {
    oldName: 'សីលធម៌-ពលរដ្ឋវិទ្យា',
    newName: 'សីលធម៌-ពលរដ្ឋវិជ្ជា',
  },
};

const DEFAULT_INACTIVE_NAMES_BY_ID: Record<string, string[]> = {
  home_econ: ['គេហវិទ្យា'],
  subj_13: ['មុខវិជ្ជាទី 13 (កែឈ្មោះ)', 'ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)'],
  subj_14: ['មុខវិជ្ជាទី 14 (កែឈ្មោះ)', 'គំនូរ របាំ តន្ត្រី ចម្រៀង'],
  life_skills: ['បំណិនជីវិត', 'បំណិនជីវិតតាមមូលដ្ឋាន'],
};

function hasDefaultOptionalSubjectName(id: string, name: string): boolean {
  const trimmed = name.trim();
  const knownDefaults = DEFAULT_INACTIVE_NAMES_BY_ID[id];
  if (knownDefaults) {
    return knownDefaults.includes(trimmed);
  }
  if (id.startsWith('extra_')) {
    const suffix = id.slice('extra_'.length);
    return trimmed === `មុខវិជ្ជាបន្ថែម ${suffix}`;
  }
  return false;
}

function collectScoredSubjectIds(
  monthlyRows: Array<Pick<MonthlyScore, 'scores'>>,
  examRows: Array<Pick<SemesterExam, 'scores'>>
): Set<string> {
  const scored = new Set<string>();
  for (const row of monthlyRows) {
    for (const [subjId, val] of Object.entries(row.scores)) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        scored.add(subjId);
      }
    }
  }
  for (const row of examRows) {
    for (const [subjId, val] of Object.entries(row.scores)) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        scored.add(subjId);
      }
    }
  }
  return scored;
}

/**
 * Normalizes a class's subjects during Dexie v4 upgrade and older backup restore:
 * - Renames old preset placeholders ONLY if they still have the exact old default name.
 * - Never changes subject IDs.
 * - Marks old optional/extra subjects `isActive: false` ONLY when `isActive` is unset
 *   and the subject has no numeric scores in monthlyScores or semesterExams.
 */
export function normalizeMigratedClassSubjects(
  subjects: Subject[],
  monthlyRows: Array<Pick<MonthlyScore, 'scores'>>,
  examRows: Array<Pick<SemesterExam, 'scores'>>
): { subjects: Subject[]; changed: boolean } {
  const scoredIds = collectScoredSubjectIds(monthlyRows, examRows);
  let changed = false;

  const nextSubjects = subjects.map((subj) => {
    let next = subj;
    const renameRule = OLD_PRESET_RENAME_MAP[subj.id];
    if (renameRule && subj.name.trim() === renameRule.oldName) {
      next = { ...next, name: renameRule.newName };
      changed = true;
    }

    if (
      subj.isActive === undefined &&
      hasDefaultOptionalSubjectName(subj.id, subj.name) &&
      !scoredIds.has(subj.id)
    ) {
      next = { ...next, isActive: false };
      changed = true;
    }

    return next;
  });

  return { subjects: nextSubjects, changed };
}
