import Dexie from 'dexie';
import { db } from './database';
import type { SchoolClass, Student } from '../types/domain';
import { compareKhmerNames } from '../lib/khmerSort';

export interface ClassCascadeCounts {
  studentsCount: number;
  attendanceCount: number;
  monthlyScoresCount: number;
  semesterExamsCount: number;
}

export async function getClassCascadeCounts(classId: number): Promise<ClassCascadeCounts> {
  const [studentsCount, attendanceCount, monthlyScoresCount, semesterExamsCount] =
    await Promise.all([
      db.students.where('classId').equals(classId).count(),
      db.attendance.where('classId').equals(classId).count(),
      db.monthlyScores
        .where('[classId+month]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .count(),
      db.semesterExams
        .where('[classId+semester]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .count(),
    ]);

  return {
    studentsCount,
    attendanceCount,
    monthlyScoresCount,
    semesterExamsCount,
  };
}

export async function createSchoolClass(
  input: Omit<SchoolClass, 'id' | 'createdAt'>
): Promise<number> {
  return db.classes.add({
    ...input,
    name: input.name.trim(),
    academicYear: input.academicYear.trim(),
    createdAt: Date.now(),
  });
}

export async function updateSchoolClass(
  id: number,
  patch: Partial<Pick<SchoolClass, 'name' | 'gradeLevel' | 'track' | 'academicYear' | 'color'>>
): Promise<void> {
  await db.classes.update(id, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.academicYear !== undefined ? { academicYear: patch.academicYear.trim() } : {}),
  });
}

export async function duplicateClassStructure(sourceClassId: number): Promise<number> {
  const src = await db.classes.get(sourceClassId);
  if (!src) throw new Error('រកមិនឃើញថ្នាក់រៀនដើមទេ');

  const existing = await db.classes.toArray();
  const baseName = `${src.name} (ចម្លង)`;
  let candidateName = baseName;
  let suffix = 2;
  while (existing.some((c) => c.name === candidateName)) {
    candidateName = `${src.name} (ចម្លង ${suffix})`;
    suffix++;
  }

  return db.classes.add({
    name: candidateName,
    gradeLevel: src.gradeLevel,
    ...(src.track ? { track: src.track } : {}),
    academicYear: src.academicYear,
    color: src.color,
    subjects: src.subjects.map((s) => ({ ...s })),
    createdAt: Date.now(),
  });
}

export async function deleteClassCascade(classId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.classes, db.students, db.attendance, db.attendanceSessions, db.monthlyScores, db.semesterExams],
    async () => {
      await db.attendance.where('classId').equals(classId).delete();
      await db.attendanceSessions.where('classId').equals(classId).delete();
      await db.monthlyScores
        .where('[classId+month]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .delete();
      await db.semesterExams
        .where('[classId+semester]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .delete();
      await db.students.where('classId').equals(classId).delete();
      await db.classes.delete(classId);
    }
  );
}

export async function isStudentIdUniqueInClass(
  classId: number,
  studentId: string,
  excludeStudentDbId?: number
): Promise<boolean> {
  const normalized = studentId.trim().toLowerCase();
  if (!normalized) return false;
  const classStudents = await db.students.where('classId').equals(classId).toArray();
  return !classStudents.some(
    (s) => s.id !== excludeStudentDbId && s.studentId.trim().toLowerCase() === normalized
  );
}

export async function getNextStudentOrder(classId: number): Promise<number> {
  const classStudents = await db.students.where('classId').equals(classId).toArray();
  if (classStudents.length === 0) return 1;
  return Math.max(...classStudents.map((s) => s.order || 0)) + 1;
}

export async function addStudentToClass(
  input: Omit<Student, 'id' | 'order' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  const trimmedId = input.studentId.trim();
  const unique = await isStudentIdUniqueInClass(input.classId, trimmedId);
  if (!unique) {
    throw new Error(`អត្តលេខ "${trimmedId}" មានរួចហើយក្នុងថ្នាក់នេះ`);
  }
  const now = Date.now();
  const order = await getNextStudentOrder(input.classId);
  const newId = await db.students.add({
    ...input,
    studentId: trimmedId,
    nameKm: input.nameKm.trim(),
    order,
    ...(input.status !== 'active' ? { statusChangedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  });
  await sortClassStudentsAlphabetically(input.classId);
  return newId;
}

export async function updateStudentInClass(
  id: number,
  patch: Partial<Omit<Student, 'id' | 'createdAt'>>
): Promise<void> {
  const existing = await db.students.get(id);
  if (!existing) throw new Error('រកមិនឃើញទិន្នន័យសិស្សទេ');

  const targetClassId = patch.classId ?? existing.classId;
  const targetStudentId = (patch.studentId ?? existing.studentId).trim();

  const unique = await isStudentIdUniqueInClass(targetClassId, targetStudentId, id);
  if (!unique) {
    throw new Error(`អត្តលេខ "${targetStudentId}" មានរួចហើយក្នុងថ្នាក់នេះ`);
  }

  const statusChanged = patch.status !== undefined && patch.status !== existing.status;

  await db.students.update(id, {
    ...patch,
    studentId: targetStudentId,
    ...(patch.nameKm !== undefined ? { nameKm: patch.nameKm.trim() } : {}),
    ...(statusChanged ? { statusChangedAt: Date.now() } : {}),
    updatedAt: Date.now(),
  });
  await sortClassStudentsAlphabetically(targetClassId);
}

export async function deleteStudentCascade(studentDbId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.students, db.attendance, db.monthlyScores, db.semesterExams],
    async () => {
      const target = await db.students.get(studentDbId);
      if (!target) return;
      const classId = target.classId;

      const attRows = await db.attendance
        .where('classId')
        .equals(classId)
        .filter((a) => a.studentRef === studentDbId)
        .toArray();
      if (attRows.length > 0) {
        await db.attendance.bulkDelete(attRows.map((a) => [a.classId, a.date, a.studentRef]));
      }

      const monthlyRows = await db.monthlyScores
        .where('[classId+month]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .filter((m) => m.studentRef === studentDbId)
        .toArray();
      if (monthlyRows.length > 0) {
        await db.monthlyScores.bulkDelete(
          monthlyRows.map((m) => [m.classId, m.month, m.studentRef])
        );
      }

      const examRows = await db.semesterExams
        .where('[classId+semester]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .filter((e) => e.studentRef === studentDbId)
        .toArray();
      if (examRows.length > 0) {
        await db.semesterExams.bulkDelete(
          examRows.map((e) => [e.classId, e.semester, e.studentRef])
        );
      }

      await db.students.delete(studentDbId);

      // Renumber remaining students 1..n in Khmer alphabetical order
      const remaining = await db.students
        .where('classId')
        .equals(classId)
        .toArray();
      remaining.sort(
        (a, b) => compareKhmerNames(a.nameKm, b.nameKm) || a.studentId.localeCompare(b.studentId)
      );

      const now = Date.now();
      for (let i = 0; i < remaining.length; i++) {
        const st = remaining[i];
        const expectedOrder = i + 1;
        if (st.id !== undefined && st.order !== expectedOrder) {
          await db.students.update(st.id, { order: expectedOrder, updatedAt: now });
        }
      }
    }
  );
}

export async function sortClassStudentsAlphabetically(classId: number): Promise<void> {
  await db.transaction('rw', db.students, async () => {
    const existing = await db.students.where('classId').equals(classId).toArray();
    existing.sort(
      (a, b) => compareKhmerNames(a.nameKm, b.nameKm) || a.studentId.localeCompare(b.studentId)
    );
    const now = Date.now();
    for (let i = 0; i < existing.length; i++) {
      const st = existing[i];
      const nextOrder = i + 1;
      if (st.id !== undefined && st.order !== nextOrder) {
        await db.students.update(st.id, { order: nextOrder, updatedAt: now });
      }
    }
  });
}
