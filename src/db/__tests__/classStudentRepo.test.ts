import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAllAppData } from '../../db/database';
import { getPresetSubjects } from '../../db/presets';
import {
  addStudentToClass,
  createSchoolClass,
  deleteClassCascade,
  deleteStudentCascade,
  getClassCascadeCounts,
  sortClassStudentsAlphabetically,
} from '../classStudentRepo';

describe('Class & Student Repository Data Integrity', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  it('enforces unique studentId within a class but allows same studentId across different classes', async () => {
    const c1 = await createSchoolClass({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '២០២៦-២០២៧',
      color: '#0071e3',
      subjects: getPresetSubjects('lower-secondary'),
    });
    const c2 = await createSchoolClass({
      name: '៧ខ',
      gradeLevel: 7,
      academicYear: '២០២៦-២០២៧',
      color: '#34c759',
      subjects: getPresetSubjects('lower-secondary'),
    });

    await addStudentToClass({
      classId: c1,
      studentId: 'STU-001',
      nameKm: 'សិស្ស ទី១',
      gender: 'ប្រុស',
      dateOfBirth: '01/01/2013',
      status: 'active',
    });

    await expect(
      addStudentToClass({
        classId: c1,
        studentId: 'stu-001',
        nameKm: 'សិស្ស ស្ទួន',
        gender: 'ស្រី',
        dateOfBirth: '02/02/2013',
        status: 'active',
      })
    ).rejects.toThrow();

    // Same studentId in another class succeeds
    const sInC2 = await addStudentToClass({
      classId: c2,
      studentId: 'STU-001',
      nameKm: 'សិស្ស ថ្នាក់ខ',
      gender: 'ស្រី',
      dateOfBirth: '03/03/2013',
      status: 'active',
    });
    expect(sInC2).toBeGreaterThan(0);
  });

  it('auto-sorts students alphabetically (ក → អ), cascades delete, and renumbers 1..n', async () => {
    const classId = await createSchoolClass({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: getPresetSubjects('lower-secondary'),
    });

    const id1 = await addStudentToClass({
      classId,
      studentId: 'S1',
      nameKm: 'សុខ ដារ៉ា',
      gender: 'ប្រុស',
      dateOfBirth: '01/01/2013',
      status: 'active',
    });
    const id2 = await addStudentToClass({
      classId,
      studentId: 'S2',
      nameKm: 'ចាន់ ស្រីនិច',
      gender: 'ស្រី',
      dateOfBirth: '02/01/2013',
      status: 'active',
    });
    const id3 = await addStudentToClass({
      classId,
      studentId: 'S3',
      nameKm: 'កែវ វិបុល',
      gender: 'ប្រុស',
      dateOfBirth: '03/01/2013',
      status: 'active',
    });

    // Should already be sorted ក → ច → ស
    let ordered = (await db.students.where('classId').equals(classId).toArray()).sort(
      (a, b) => a.order - b.order
    );
    expect(ordered.map((s) => [s.id, s.order])).toEqual([
      [id3, 1],
      [id2, 2],
      [id1, 3],
    ]);

    await db.attendance.put({ classId, studentRef: id2, date: '2026-11-18', status: 'ច្ប' });
    await db.monthlyScores.put({ classId, studentRef: id2, month: '2026-11', scores: { math: 40 } });
    await db.semesterExams.put({ classId, studentRef: id2, semester: 1, scores: { math: 45 } });
    await db.attendance.put({ classId, studentRef: id3, date: '2026-11-18', status: 'អច្ប' });

    await deleteStudentCascade(id2);

    ordered = (await db.students.where('classId').equals(classId).toArray()).sort(
      (a, b) => a.order - b.order
    );
    expect(ordered.map((s) => [s.id, s.order])).toEqual([
      [id3, 1],
      [id1, 2],
    ]);
    expect(await db.attendance.where('classId').equals(classId).toArray()).toHaveLength(1);
    expect(await db.monthlyScores.toArray()).toHaveLength(0);
    expect(await db.semesterExams.toArray()).toHaveLength(0);
  });

  it('reports cascade counts and cascade-deletes a class atomically', async () => {
    const classId = await createSchoolClass({
      name: '៨ក',
      gradeLevel: 8,
      academicYear: '២០២៦-២០២៧',
      color: '#ff9500',
      subjects: getPresetSubjects('lower-secondary'),
    });
    const sid = await addStudentToClass({
      classId,
      studentId: 'S100',
      nameKm: 'សិស្ស ១០០',
      gender: 'ប្រុស',
      dateOfBirth: '01/01/2012',
      status: 'active',
    });
    await db.attendance.put({ classId, studentRef: sid, date: '2026-11-18', status: 'ឈ' });
    await db.monthlyScores.put({ classId, studentRef: sid, month: '2026-11', scores: { math: 35 } });
    await db.semesterExams.put({ classId, studentRef: sid, semester: 1, scores: { math: 38 } });

    const counts = await getClassCascadeCounts(classId);
    expect(counts).toEqual({
      studentsCount: 1,
      attendanceCount: 1,
      monthlyScoresCount: 1,
      semesterExamsCount: 1,
    });

    await deleteClassCascade(classId);

    expect(await db.classes.get(classId)).toBeUndefined();
    expect(await db.students.where('classId').equals(classId).count()).toBe(0);
    expect(await db.attendance.where('classId').equals(classId).count()).toBe(0);
    expect(await db.monthlyScores.count()).toBe(0);
    expect(await db.semesterExams.count()).toBe(0);
  });

  it('sorts students alphabetically by Khmer name (ក → អ) and assigns order 1..n', async () => {
    const classId = await createSchoolClass({
      name: '៧គ',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#34c759',
      subjects: getPresetSubjects('lower-secondary'),
    });
    await addStudentToClass({
      classId,
      studentId: 'A1',
      nameKm: 'សុខ ដារ៉ា',
      gender: 'ប្រុស',
      dateOfBirth: '01/01/2013',
      status: 'active',
    });
    await addStudentToClass({
      classId,
      studentId: 'A2',
      nameKm: 'កែវ ម៉ាលី',
      gender: 'ស្រី',
      dateOfBirth: '02/01/2013',
      status: 'active',
    });
    await addStudentToClass({
      classId,
      studentId: 'A3',
      nameKm: 'ចាន់ វិបុល',
      gender: 'ប្រុស',
      dateOfBirth: '03/01/2013',
      status: 'active',
    });

    await sortClassStudentsAlphabetically(classId);

    const sorted = (await db.students.where('classId').equals(classId).toArray()).sort(
      (a, b) => a.order - b.order
    );
    expect(sorted.map((s) => [s.order, s.nameKm])).toEqual([
      [1, 'កែវ ម៉ាលី'],
      [2, 'ចាន់ វិបុល'],
      [3, 'សុខ ដារ៉ា'],
    ]);
  });
});
