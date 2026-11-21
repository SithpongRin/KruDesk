// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllAppData,
  closeUserDb,
  db,
  generateSafeId,
  getActiveDbName,
  getProfile,
  getUserDbName,
  KruDeskDatabase,
  LEGACY_DB_NAME,
  openDbForUser,
  saveProfile,
} from '../database';
import { addStudentToClass, createSchoolClass } from '../classStudentRepo';
import { createLowerSecondarySubjects } from '../presets';

describe('Per-account Dexie database & multi-device safe random IDs (§1.1, §1.2)', () => {
  beforeEach(async () => {
    closeUserDb();
    await db.open();
    await clearAllAppData();
  });

  afterEach(async () => {
    closeUserDb();
    await db.open();
    await clearAllAppData();
  });

  it('isolates data between two Google accounts (KruDeskDB_<uid>) and never deletes legacy KruDeskDB', async () => {
    // Seed legacy KruDeskDB first
    expect(getActiveDbName()).toBe(LEGACY_DB_NAME);
    const legacyClassId = await createSchoolClass({
      name: '8A-Legacy',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: createLowerSecondarySubjects(),
    });
    expect(await db.classes.count()).toBe(1);

    // 1. Teacher A signs in -> opens KruDeskDB_uid_teacher_a
    await openDbForUser('uid_teacher_a');
    expect(getActiveDbName()).toBe(getUserDbName('uid_teacher_a'));
    expect(db.name).toBe('KruDeskDB_uid_teacher_a');
    await clearAllAppData();

    await saveProfile({
      teacherName: 'គ្រូ ក',
      schoolName: 'អនុវិទ្យាល័យ ក',
      directorName: 'នាយក ក',
      province: 'កណ្ដាល',
      academicYear: '2026-2027',
    });
    const classA = await createSchoolClass({
      name: '7A',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: createLowerSecondarySubjects(),
    });
    await addStudentToClass({
      classId: classA,
      studentId: 'A001',
      nameKm: 'សិស្ស ក',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      status: 'active',
    });

    expect((await getProfile())?.teacherName).toBe('គ្រូ ក');
    expect(await db.classes.count()).toBe(1);
    expect(await db.students.count()).toBe(1);

    // 2. Teacher A signs out and Teacher B signs in on the same computer
    closeUserDb();
    await openDbForUser('uid_teacher_b');
    expect(getActiveDbName()).toBe('KruDeskDB_uid_teacher_b');
    await clearAllAppData();

    // Teacher B must see zero data from Teacher A or legacy KruDeskDB
    expect(await getProfile()).toBeUndefined();
    expect(await db.classes.count()).toBe(0);
    expect(await db.students.count()).toBe(0);

    await saveProfile({
      teacherName: 'គ្រូ ខ',
      schoolName: 'អនុវិទ្យាល័យ ខ',
      directorName: 'នាយក ខ',
      province: 'ភ្នំពេញ',
      academicYear: '2026-2027',
    });
    await createSchoolClass({
      name: '9B',
      gradeLevel: 9,
      academicYear: '2026-2027',
      color: '#34c759',
      subjects: createLowerSecondarySubjects(),
    });

    // 3. Switch back to Teacher A -> Teacher A's data is intact
    await openDbForUser('uid_teacher_a');
    expect((await getProfile())?.teacherName).toBe('គ្រូ ក');
    const classesA = await db.classes.toArray();
    expect(classesA).toHaveLength(1);
    expect(classesA[0]?.name).toBe('7A');
    expect(await db.students.count()).toBe(1);

    // 4. Legacy KruDeskDB is still untouched
    closeUserDb();
    await db.open();
    expect(db.name).toBe(LEGACY_DB_NAME);
    const legacyClasses = await db.classes.toArray();
    expect(legacyClasses).toHaveLength(1);
    expect(legacyClasses[0]?.id).toBe(legacyClassId);
    expect(legacyClasses[0]?.name).toBe('8A-Legacy');
  });

  it('generates collision-free safe random integer IDs across two offline devices (two fake-indexeddb DBs)', async () => {
    const deviceA = new KruDeskDatabase('KruDeskDB_sim_device_A');
    const deviceB = new KruDeskDatabase('KruDeskDB_sim_device_B');
    await Promise.all([deviceA.open(), deviceB.open()]);
    await Promise.all([clearAllAppData(deviceA), clearAllAppData(deviceB)]);

    try {
      // Both devices create classes, students, and holidays offline
      const classIdA = await deviceA.classes.add({
        name: '8A (ទូរស័ព្ទ)',
        gradeLevel: 8,
        academicYear: '2026-2027',
        color: '#0071e3',
        subjects: [],
        createdAt: Date.now(),
      });
      const classIdB = await deviceB.classes.add({
        name: '8B (កុំព្យូទ័រ)',
        gradeLevel: 8,
        academicYear: '2026-2027',
        color: '#ff9500',
        subjects: [],
        createdAt: Date.now(),
      });

      expect(Number.isSafeInteger(classIdA)).toBe(true);
      expect(Number.isSafeInteger(classIdB)).toBe(true);
      expect(classIdA).toBeGreaterThan(1_000_000_000_000);
      expect(classIdB).toBeGreaterThan(1_000_000_000_000);
      expect(classIdA).not.toBe(classIdB);

      const studentIdsA: number[] = [];
      const studentIdsB: number[] = [];
      for (let i = 0; i < 15; i++) {
        studentIdsA.push(
          await deviceA.students.add({
            classId: classIdA,
            order: i + 1,
            studentId: `A-${i}`,
            nameKm: `សិស្ស A ${i}`,
            gender: 'ប្រុស',
            dateOfBirth: '2013-01-01',
            status: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
        studentIdsB.push(
          await deviceB.students.add({
            classId: classIdB,
            order: i + 1,
            studentId: `B-${i}`,
            nameKm: `សិស្ស B ${i}`,
            gender: 'ស្រី',
            dateOfBirth: '2013-02-02',
            status: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
      }

      const holidayIdA = await deviceA.holidays.add({
        date: '2026-11-09',
        label: 'បុណ្យឯករាជ្យជាតិ',
      });
      const holidayIdB = await deviceB.holidays.add({
        date: '2026-11-10',
        label: 'ឈប់សម្រាក',
      });

      const allIds = [classIdA, classIdB, ...studentIdsA, ...studentIdsB, holidayIdA, holidayIdB];
      for (const id of allIds) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(1_000_000_000_000);
        expect(id).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      }
      // Every generated ID across both devices must be unique
      expect(new Set(allIds).size).toBe(allIds.length);

      // Existing explicit IDs (e.g. from cloud sync or legacy records) are kept as-is
      const explicitId = await deviceA.classes.add({
        id: 42,
        name: 'ថ្នាក់មាន ID ស្រាប់',
        gradeLevel: 7,
        academicYear: '2026-2027',
        color: '#0071e3',
        subjects: [],
        createdAt: Date.now(),
      });
      expect(explicitId).toBe(42);
      const savedExplicit = await deviceA.classes.get(42);
      expect(savedExplicit?.name).toBe('ថ្នាក់មាន ID ស្រាប់');
    } finally {
      await Promise.all([clearAllAppData(deviceA), clearAllAppData(deviceB)]);
      deviceA.close();
      deviceB.close();
    }
  });

  it('produces 100 distinct safe integer IDs even when called 100 times in the exact same millisecond', () => {
    const fixedMs = 1_795_200_000_000;
    const ids = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const id = generateSafeId(fixedMs);
      expect(Number.isSafeInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });
});
