import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAllAppData } from '../database';
import { createLowerSecondarySubjects } from '../presets';
import {
  countSubjectScoreEntries,
  createPermanentSubjectId,
  deleteSubjectWithScores,
  saveClassSubjects,
} from '../subjectRepo';

describe('subjectRepo', () => {
  beforeEach(async () => {
    await clearAllAppData();
  });

  it('generates distinct permanent IDs and keeps scores when renaming/reordering', async () => {
    const id1 = createPermanentSubjectId();
    const id2 = createPermanentSubjectId();
    expect(id1).not.toBe(id2);

    const preset = createLowerSecondarySubjects();
    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: preset,
      createdAt: Date.now(),
    });

    const targetSubj = preset[0];
    await db.monthlyScores.put({
      classId,
      studentRef: 101,
      month: '2026-11',
      scores: { [targetSubj.id]: 42, [preset[1].id]: 38 },
    });

    // Rename & reorder targetSubj to the end
    const reordered = [
      ...preset.slice(1),
      { ...targetSubj, name: 'តែងសេចក្ដី (កែឈ្មោះ)' },
    ];
    await saveClassSubjects(classId, reordered);

    const updatedClass = await db.classes.get(classId);
    expect(updatedClass?.subjects[updatedClass.subjects.length - 1].id).toBe(targetSubj.id);
    expect(updatedClass?.subjects[updatedClass.subjects.length - 1].order).toBe(preset.length);

    const row = await db.monthlyScores.get([classId, '2026-11', 101]);
    expect(row?.scores[targetSubj.id]).toBe(42);
  });

  it('counts scores and deletes subject scores atomically without touching other classes', async () => {
    const presetA = createLowerSecondarySubjects();
    const presetB = createLowerSecondarySubjects();

    const classA = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: presetA,
      createdAt: Date.now(),
    });
    const classB = await db.classes.add({
      name: '៧ខ',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#34c759',
      subjects: presetB,
      createdAt: Date.now(),
    });

    const subjId = presetA[2].id;
    const otherSubjId = presetA[3].id;

    await db.monthlyScores.put({
      classId: classA,
      studentRef: 1,
      month: '2026-11',
      scores: { [subjId]: 30, [otherSubjId]: 40 },
    });
    await db.monthlyScores.put({
      classId: classA,
      studentRef: 2,
      month: '2026-12',
      scores: { [subjId]: 25 },
    });
    await db.semesterExams.put({
      classId: classA,
      studentRef: 1,
      semester: 1,
      scores: { [subjId]: 45, [otherSubjId]: 48 },
    });
    // Class B also uses the same preset ID string, must stay untouched!
    await db.monthlyScores.put({
      classId: classB,
      studentRef: 10,
      month: '2026-11',
      scores: { [subjId]: 50 },
    });

    const usage = await countSubjectScoreEntries(classA, subjId);
    expect(usage).toEqual({ monthlyCount: 2, examCount: 1, totalCount: 3 });

    const res = await deleteSubjectWithScores(classA, subjId);
    expect(res).toEqual({ removedMonthly: 2, removedExam: 1 });

    const clsAAfter = await db.classes.get(classA);
    expect(clsAAfter?.subjects.some((s) => s.id === subjId)).toBe(false);
    expect(clsAAfter?.subjects).toHaveLength(presetA.length - 1);

    const clsBAfter = await db.classes.get(classB);
    expect(clsBAfter?.subjects).toHaveLength(presetB.length);

    const row1 = await db.monthlyScores.get([classA, '2026-11', 1]);
    expect(row1?.scores[subjId]).toBeUndefined();
    expect(row1?.scores[otherSubjId]).toBe(40);

    // Row 2 had only deleted subject and no note -> deleted cleanly
    const row2 = await db.monthlyScores.get([classA, '2026-12', 2]);
    expect(row2).toBeUndefined();

    const exam1 = await db.semesterExams.get([classA, 1, 1]);
    expect(exam1?.scores[subjId]).toBeUndefined();
    expect(exam1?.scores[otherSubjId]).toBe(48);

    const rowB = await db.monthlyScores.get([classB, '2026-11', 10]);
    expect(rowB?.scores[subjId]).toBe(50);
  });
});
