import { db } from './database';
import type { AbsenceCode, Attendance, AttendanceSession } from '../types/domain';

export interface SaveAttendanceSessionInput {
  classId: number;
  date: string;
  absences: Array<{ studentRef: number; status: AbsenceCode }>;
  savedAt?: number;
}

/**
 * Saves an attendance roll-call session and all absence rows for (classId, date)
 * in a single IndexedDB transaction. Present students have no absence row.
 */
export async function saveAttendanceSession(
  input: SaveAttendanceSessionInput
): Promise<AttendanceSession> {
  const savedAt = input.savedAt ?? Date.now();
  const session: AttendanceSession = {
    classId: input.classId,
    date: input.date,
    savedAt,
  };

  await db.transaction('rw', [db.attendanceSessions, db.attendance], async () => {
    await db.attendance.where('[classId+date]').equals([input.classId, input.date]).delete();

    if (input.absences.length > 0) {
      const rows: Attendance[] = input.absences.map((a) => ({
        classId: input.classId,
        studentRef: a.studentRef,
        date: input.date,
        status: a.status,
      }));
      await db.attendance.bulkPut(rows);
    }

    await db.attendanceSessions.put(session);
  });

  return session;
}

/**
 * Deletes an attendance session and all of its absence rows for (classId, date)
 * in a single IndexedDB transaction, returning that date to "not taken".
 */
export async function deleteAttendanceSession(classId: number, date: string): Promise<void> {
  await db.transaction('rw', [db.attendanceSessions, db.attendance], async () => {
    await db.attendance.where('[classId+date]').equals([classId, date]).delete();
    await db.attendanceSessions.delete([classId, date]);
  });
}
