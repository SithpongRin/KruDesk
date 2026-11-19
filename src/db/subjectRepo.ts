import Dexie from 'dexie';
import { db } from './database';
import { isSubjectActive, isSubjectBonus } from '../lib/grading';
import type { Subject } from '../types/domain';

/**
 * Generates a permanent, unique subject ID that is never reused after deletion.
 */
export function createPermanentSubjectId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `subj_${Date.now().toString(36)}_${rand}`;
}

export interface SubjectScoreUsage {
  monthlyCount: number;
  examCount: number;
  totalCount: number;
}

/**
 * Counts how many recorded numeric score cells exist for a subject across
 * all monthly score records and semester exam records in a class.
 */
export async function countSubjectScoreEntries(
  classId: number,
  subjectId: string
): Promise<SubjectScoreUsage> {
  const [monthlyRows, examRows] = await Promise.all([
    db.monthlyScores
      .where('[classId+month]')
      .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
      .toArray(),
    db.semesterExams
      .where('[classId+semester]')
      .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
      .toArray(),
  ]);

  let monthlyCount = 0;
  for (const row of monthlyRows) {
    const val = row.scores[subjectId];
    if (typeof val === 'number' && !Number.isNaN(val)) {
      monthlyCount++;
    }
  }

  let examCount = 0;
  for (const row of examRows) {
    const val = row.scores[subjectId];
    if (typeof val === 'number' && !Number.isNaN(val)) {
      examCount++;
    }
  }

  return {
    monthlyCount,
    examCount,
    totalCount: monthlyCount + examCount,
  };
}

/**
 * Highest numeric score entered per subject id across all monthly and semester-exam
 * records of a class. Subjects with no score are absent from the map.
 */
export async function getHighestScoresBySubject(classId: number): Promise<Map<string, number>> {
  const [monthlyRows, examRows] = await Promise.all([
    db.monthlyScores
      .where('[classId+month]')
      .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
      .toArray(),
    db.semesterExams
      .where('[classId+semester]')
      .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
      .toArray(),
  ]);

  const highest = new Map<string, number>();
  for (const row of [...monthlyRows, ...examRows]) {
    for (const [subjectId, val] of Object.entries(row.scores)) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        highest.set(subjectId, Math.max(highest.get(subjectId) ?? -Infinity, val));
      }
    }
  }
  return highest;
}

/**
 * Persists a class's subject list, renumbering `order` 1..n while keeping permanent IDs intact.
 */
export async function saveClassSubjects(classId: number, subjects: Subject[]): Promise<void> {
  const normalized: Subject[] = subjects.map((s, idx) => ({
    id: s.id,
    name: s.name.trim(),
    ...(s.group?.trim() ? { group: s.group.trim() } : {}),
    maxScore: Number(s.maxScore) > 0 ? Number(s.maxScore) : 50,
    order: idx + 1,
    ...(isSubjectActive(s) ? {} : { isActive: false }),
    ...(isSubjectBonus(s) ? { isBonus: true } : {}),
  }));

  await db.classes.update(classId, { subjects: normalized });
}

/**
 * Atomically removes a subject from a class and prunes its scores from all
 * monthly score records and semester exam records of that class without affecting
 * any other class or any other subject.
 */
export async function deleteSubjectWithScores(
  classId: number,
  subjectId: string
): Promise<{ removedMonthly: number; removedExam: number }> {
  let removedMonthly = 0;
  let removedExam = 0;

  await db.transaction(
    'rw',
    [db.classes, db.monthlyScores, db.semesterExams],
    async () => {
      const cls = await db.classes.get(classId);
      if (cls) {
        const nextSubjects = cls.subjects
          .filter((s) => s.id !== subjectId)
          .map((s, idx) => ({ ...s, order: idx + 1 }));
        await db.classes.update(classId, { subjects: nextSubjects });
      }

      const monthlyRows = await db.monthlyScores
        .where('[classId+month]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .toArray();

      for (const row of monthlyRows) {
        if (Object.prototype.hasOwnProperty.call(row.scores, subjectId)) {
          if (typeof row.scores[subjectId] === 'number') {
            removedMonthly++;
          }
          const nextScores = { ...row.scores };
          delete nextScores[subjectId];
          if (Object.keys(nextScores).length === 0 && !row.note) {
            await db.monthlyScores.delete([row.classId, row.month, row.studentRef]);
          } else {
            await db.monthlyScores.put({ ...row, scores: nextScores });
          }
        }
      }

      const examRows = await db.semesterExams
        .where('[classId+semester]')
        .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
        .toArray();

      for (const row of examRows) {
        if (Object.prototype.hasOwnProperty.call(row.scores, subjectId)) {
          if (typeof row.scores[subjectId] === 'number') {
            removedExam++;
          }
          const nextScores = { ...row.scores };
          delete nextScores[subjectId];
          if (Object.keys(nextScores).length === 0 && !row.note) {
            await db.semesterExams.delete([row.classId, row.semester, row.studentRef]);
          } else {
            await db.semesterExams.put({ ...row, scores: nextScores });
          }
        }
      }
    }
  );

  return { removedMonthly, removedExam };
}
