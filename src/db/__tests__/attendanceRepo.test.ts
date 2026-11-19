// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  clearAllAppData,
  deriveSessionsFromAbsenceRows,
  markMigratedSessionsInBatch,
} from '../database';
import { deleteAttendanceSession, saveAttendanceSession } from '../attendanceRepo';
import type { AttendanceSession } from '../../types/domain';

describe('Attendance sessions, Dexie v2 migration & repo operations', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  it('derives one session per (classId, date) during Dexie v1 -> v2 upgrade', async () => {
    const testDbName = `KruDeskUpgradeTest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const v1 = new Dexie(testDbName);
    v1.version(1).stores({
      attendance: '[classId+date+studentRef], [classId+date], classId',
    });
    await v1.open();
    await v1.table('attendance').bulkPut([
      { classId: 1, studentRef: 10, date: '2026-11-02', status: 'ច្ប' },
      { classId: 1, studentRef: 11, date: '2026-11-02', status: 'អច្ប' },
      { classId: 1, studentRef: 10, date: '2026-11-05', status: 'ឈ' },
    ]);
    v1.close();

    const v2 = new Dexie(testDbName);
    v2.version(1).stores({
      attendance: '[classId+date+studentRef], [classId+date], classId',
    });
    v2.version(2)
      .stores({
        attendance: '[classId+date+studentRef], [classId+date], classId',
        attendanceSessions: '[classId+date], classId',
      })
      .upgrade(async (tx) => {
        const rows = await tx.table('attendance').toArray();
        const sessions = deriveSessionsFromAbsenceRows(rows);
        if (sessions.length > 0) {
          await tx.table('attendanceSessions').bulkPut(sessions);
        }
      });
    await v2.open();

    const sessions = await v2.table('attendanceSessions').toArray();
    expect(sessions.map((s: any) => s.date).sort()).toEqual(['2026-11-02', '2026-11-05']);
    expect(sessions.every((s: any) => s.migrated === true)).toBe(true);
    v2.close();

    // v2 -> v3 upgrade keeps migrated: true
    const v3 = new Dexie(testDbName);
    v3.version(1).stores({
      attendance: '[classId+date+studentRef], [classId+date], classId',
    });
    v3.version(2).stores({
      attendance: '[classId+date+studentRef], [classId+date], classId',
      attendanceSessions: '[classId+date], classId',
    });
    v3.version(3)
      .stores({
        attendance: '[classId+date+studentRef], [classId+date], classId',
        attendanceSessions: '[classId+date], classId',
      })
      .upgrade(async (tx) => {
        const existing = (await tx.table('attendanceSessions').toArray()) as AttendanceSession[];
        const toUpdate = markMigratedSessionsInBatch(existing);
        if (toUpdate.length > 0) {
          await tx.table('attendanceSessions').bulkPut(toUpdate);
        }
      });
    await v3.open();
    const v3Sessions = await v3.table('attendanceSessions').toArray();
    expect(v3Sessions.every((s: any) => s.migrated === true)).toBe(true);
    v3.close();

    await Dexie.delete(testDbName);
  });

  it('v2 -> v3 upgrade marks sessions sharing savedAt as migrated and leaves unique savedAt untouched', async () => {
    const testDbName = `KruDeskV3Test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const v2 = new Dexie(testDbName);
    v2.version(2).stores({
      attendance: '[classId+date+studentRef], [classId+date], classId',
      attendanceSessions: '[classId+date], classId',
    });
    await v2.open();
    await v2.table('attendanceSessions').bulkPut([
      { classId: 1, date: '2026-11-02', savedAt: 1731900000000 },
      { classId: 1, date: '2026-11-03', savedAt: 1731900000000 },
      { classId: 1, date: '2026-11-04', savedAt: 1731900009999 },
    ]);
    v2.close();

    const v3 = new Dexie(testDbName);
    v3.version(2).stores({
      attendance: '[classId+date+studentRef], [classId+date], classId',
      attendanceSessions: '[classId+date], classId',
    });
    v3.version(3)
      .stores({
        attendance: '[classId+date+studentRef], [classId+date], classId',
        attendanceSessions: '[classId+date], classId',
      })
      .upgrade(async (tx) => {
        const existing = (await tx.table('attendanceSessions').toArray()) as AttendanceSession[];
        const toUpdate = markMigratedSessionsInBatch(existing);
        if (toUpdate.length > 0) {
          await tx.table('attendanceSessions').bulkPut(toUpdate);
        }
      });
    await v3.open();

    const s1 = await v3.table('attendanceSessions').get([1, '2026-11-02']);
    const s2 = await v3.table('attendanceSessions').get([1, '2026-11-03']);
    const s3 = await v3.table('attendanceSessions').get([1, '2026-11-04']);
    expect(s1.migrated).toBe(true);
    expect(s2.migrated).toBe(true);
    expect(s3.migrated).toBeUndefined();

    v3.close();
    await Dexie.delete(testDbName);
  });

  it('clears migrated flag when a migrated session is re-saved', async () => {
    await db.attendanceSessions.put({
      classId: 7,
      date: '2026-11-10',
      savedAt: 1731800000000,
      migrated: true,
    });

    await saveAttendanceSession({
      classId: 7,
      date: '2026-11-10',
      absences: [],
      savedAt: 1731950000000,
    });

    const saved = await db.attendanceSessions.get([7, '2026-11-10']);
    expect(saved?.migrated).toBeUndefined();
    expect(saved?.savedAt).toBe(1731950000000);
  });

  it('saves and deletes a roll-call session atomically with its absence rows', async () => {
    await saveAttendanceSession({
      classId: 7,
      date: '2026-11-10',
      absences: [
        { studentRef: 1, status: 'ច្ប' },
        { studentRef: 2, status: 'អច្ប' },
      ],
      savedAt: 1731900000000,
    });

    let sessions = await db.attendanceSessions.toArray();
    let rows = await db.attendance.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].savedAt).toBe(1731900000000);
    expect(rows).toHaveLength(2);

    // Editing to 0 absences still keeps the session as "taken"
    await saveAttendanceSession({
      classId: 7,
      date: '2026-11-10',
      absences: [],
      savedAt: 1731900005000,
    });
    sessions = await db.attendanceSessions.toArray();
    rows = await db.attendance.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].savedAt).toBe(1731900005000);
    expect(rows).toHaveLength(0);

    // Re-add absences then delete session -> removes BOTH session and absence rows
    await saveAttendanceSession({
      classId: 7,
      date: '2026-11-10',
      absences: [{ studentRef: 3, status: 'ឈ' }],
    });
    await deleteAttendanceSession(7, '2026-11-10');

    expect(await db.attendanceSessions.toArray()).toHaveLength(0);
    expect(await db.attendance.toArray()).toHaveLength(0);
  });
});
