// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import { normalizeMigratedClassSubjects } from '../subjectMigration';
import type { MonthlyScore, SchoolClass, SemesterExam, Subject } from '../../types/domain';

function makeOldPresetSubjects(): Subject[] {
  return [
    { id: 'kh_dictation', name: 'សរសេរតាមអាន', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 1 },
    { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 50, order: 2 },
    { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 3 },
    { id: 'foreign_lang', name: 'ភាសាបរទេស (អង់គ្លេស ឬ បារាំង)', maxScore: 50, order: 4 },
    { id: 'subj_4', name: 'មុខវិជ្ជាទី 4 (កែឈ្មោះ)', maxScore: 50, order: 5 },
    { id: 'civics', name: 'សីលធម៌-ពលរដ្ឋវិទ្យា', maxScore: 50, order: 6 },
    { id: 'home_econ', name: 'គេហវិទ្យា', maxScore: 50, order: 7 },
    { id: 'subj_13', name: 'មុខវិជ្ជាទី 13 (កែឈ្មោះ)', maxScore: 50, order: 8 },
    { id: 'subj_14', name: 'មុខវិជ្ជាទី 14 (កែឈ្មោះ)', maxScore: 50, order: 9 },
    { id: 'life_skills', name: 'បំណិនជីវិត', maxScore: 50, order: 10 },
    { id: 'extra_1', name: 'មុខវិជ្ជាបន្ថែម 1', maxScore: 50, order: 11 },
    { id: 'extra_2', name: 'មុខវិជ្ជាបន្ថែម 2', maxScore: 50, order: 12 },
  ];
}

describe('Dexie v4 subject migration', () => {
  it('renames only old placeholder names, keeps custom names, preserves IDs, and deactivates only unscored optional subjects', () => {
    const subjects = makeOldPresetSubjects().map((s) =>
      s.id === 'subj_14' ? { ...s, name: 'កុំព្យូទ័រ' } : s
    );

    const monthlyRows: Array<Pick<MonthlyScore, 'scores'>> = [
      { scores: { math: 80, home_econ: 42 } }, // home_econ has a score -> stays active
    ];
    const examRows: Array<Pick<SemesterExam, 'scores'>> = [
      { scores: { extra_2: 35 } }, // extra_2 has an exam score -> stays active
    ];

    const { subjects: next, changed } = normalizeMigratedClassSubjects(
      subjects,
      monthlyRows,
      examRows
    );

    expect(changed).toBe(true);
    const byId = new Map(next.map((s) => [s.id, s]));

    // IDs unchanged
    expect(next.map((s) => s.id)).toEqual(subjects.map((s) => s.id));

    // Old placeholder names renamed
    expect(byId.get('subj_4')?.name).toBe('អប់រំកាយ កីឡា និងសុខភាព');
    expect(byId.get('subj_13')?.name).toBe('ការងារកសិកម្ម (ដាំដុះ ចិញ្ចឹមសត្វ)');
    expect(byId.get('life_skills')?.name).toBe('បំណិនជីវិតតាមមូលដ្ឋាន');
    expect(byId.get('civics')?.name).toBe('សីលធម៌-ពលរដ្ឋវិជ្ជា');

    // Custom teacher-renamed subject kept untouched
    expect(byId.get('subj_14')?.name).toBe('កុំព្យូទ័រ');

    // Unscored optional subjects deactivated; scored ones stay active
    expect(byId.get('home_econ')?.isActive).toBeUndefined();
    expect(byId.get('extra_2')?.isActive).toBeUndefined();
    expect(byId.get('subj_13')?.isActive).toBe(false);
    expect(byId.get('subj_14')?.isActive).toBe(false);
    expect(byId.get('life_skills')?.isActive).toBe(false);
    expect(byId.get('extra_1')?.isActive).toBe(false);
    expect(byId.get('subj_4')?.isActive).toBeUndefined();
  });

  it('runs Dexie v3 -> v4 upgrade on an existing database', async () => {
    const testDbName = `KruDeskV4Test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const v3 = new Dexie(testDbName);
    v3.version(3).stores({
      classes: '++id, name, academicYear',
      monthlyScores: '[classId+month+studentRef], [classId+month]',
      semesterExams: '[classId+semester+studentRef], [classId+semester]',
    });
    await v3.open();
    const classId = (await v3.table('classes').add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: makeOldPresetSubjects(),
      createdAt: 1000,
    })) as number;
    await v3.table('monthlyScores').put({
      classId,
      month: '2026-11',
      studentRef: 1,
      scores: { life_skills: 40 },
    });
    v3.close();

    const v4 = new Dexie(testDbName);
    v4.version(3).stores({
      classes: '++id, name, academicYear',
      monthlyScores: '[classId+month+studentRef], [classId+month]',
      semesterExams: '[classId+semester+studentRef], [classId+semester]',
    });
    v4.version(4)
      .stores({
        classes: '++id, name, academicYear',
        monthlyScores: '[classId+month+studentRef], [classId+month]',
        semesterExams: '[classId+semester+studentRef], [classId+semester]',
      })
      .upgrade(async (tx) => {
        const [classes, monthlyRows, examRows] = await Promise.all([
          tx.table('classes').toArray() as Promise<SchoolClass[]>,
          tx.table('monthlyScores').toArray() as Promise<MonthlyScore[]>,
          tx.table('semesterExams').toArray() as Promise<SemesterExam[]>,
        ]);
        for (const cls of classes) {
          if (cls.id === undefined) continue;
          const { subjects, changed } = normalizeMigratedClassSubjects(
            cls.subjects ?? [],
            monthlyRows.filter((r) => r.classId === cls.id),
            examRows.filter((r) => r.classId === cls.id)
          );
          if (changed) {
            await tx.table('classes').update(cls.id, { subjects });
          }
        }
      });
    await v4.open();

    const upgraded = (await v4.table('classes').get(classId)) as SchoolClass;
    const byId = new Map(upgraded.subjects.map((s) => [s.id, s]));
    expect(byId.get('subj_4')?.name).toBe('អប់រំកាយ កីឡា និងសុខភាព');
    expect(byId.get('life_skills')?.name).toBe('បំណិនជីវិតតាមមូលដ្ឋាន');
    expect(byId.get('life_skills')?.isActive).toBeUndefined(); // had a score!
    expect(byId.get('home_econ')?.isActive).toBe(false); // had no score

    v4.close();
    await Dexie.delete(testDbName);
  });
});
