// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel, Timestamp, type Firestore } from 'firebase/firestore';
import { clearAllAppData, KruDeskDatabase } from '../src/db/database';
import { parseAndValidateBackup, restoreBackupPayload } from '../src/services/backup';
import {
  isInitialSyncDone,
  resolveFirstSignInConflict,
  runFirstSignInFlow,
} from '../src/services/sync/firstSignIn';
import {
  importLegacyDbIntoUserDb,
  inspectLegacyDbForUser,
  type StorageLike,
} from '../src/services/sync/legacyImport';
import { SYNC_PENDING_FULL_REPLACE_KEY } from '../src/services/sync/syncCodec';
import { SyncEngine } from '../src/services/sync/syncEngine';

const PROJECT_ID = 'demo-krudesk';
const TEACHER_UID = 'teacher-step6c-uid';
const TEACHER_EMAIL = 'teacher.step6c@example.com';

let testEnv: RulesTestEnvironment;
const openDbs: KruDeskDatabase[] = [];

function getTeacherFirestore(label: string): Firestore {
  return testEnv
    .authenticatedContext(TEACHER_UID, {
      email: TEACHER_EMAIL,
      email_verified: true,
      name: label,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore() as unknown as Firestore;
}

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** Fake-data schema v1 backup fixture (no attendanceSessions, no templates, old subject ids). */
function makeV1BackupFixtureJson(): string {
  // Minimal valid 4-byte fake JPEG data URL
  const fakePhotoBase64 = 'data:image/jpeg;base64,/9j/4AAQ';
  return JSON.stringify({
    appName: 'KruDesk',
    schemaVersion: 1,
    exportedAt: 1731500000000,
    data: {
      settings: [
        {
          key: 'profile',
          value: {
            teacherName: 'គ្រូ សាកល្បង v1',
            schoolName: 'អនុវិទ្យាល័យ សាកល្បង',
            directorName: 'នាយក សាកល្បង',
            province: 'កណ្ដាល',
            academicYear: '2026-2027',
          },
        },
        { key: 'documentPlace', value: 'កណ្ដាល' },
        { key: 'theme', value: 'dark' },
      ],
      classes: [
        {
          id: 1,
          name: '8A-v1',
          gradeLevel: 8,
          academicYear: '2026-2027',
          color: '#0071e3',
          subjects: [
            { id: 'kh_essay', name: 'តែងសេចក្ដី', group: 'អក្សរសាស្ត្រខ្មែរ', maxScore: 60, order: 1 },
            { id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 2 },
            { id: 'subj_4', name: 'មុខវិជ្ជាទី 4 (កែឈ្មោះ)', maxScore: 50, order: 3 },
          ],
          createdAt: 1731000000000,
        },
      ],
      students: [
        {
          id: 10,
          classId: 1,
          order: 1,
          studentId: 'V1-001',
          nameKm: 'សិស្ស គំរូ v1',
          gender: 'ស្រី',
          dateOfBirth: '2013-04-05',
          photoBase64: fakePhotoBase64,
          status: 'active',
          createdAt: 1731000000000,
          updatedAt: 1731000000000,
        },
      ],
      attendance: [
        { classId: 1, studentRef: 10, date: '2026-11-12', status: 'ច្ប' },
        { classId: 1, studentRef: 10, date: '2026-11-15', status: 'អច្ប' },
      ],
      // Note: v1 backups have NO attendanceSessions and NO templates!
      holidays: [{ id: 1, date: '2026-11-09', label: 'បុណ្យឯករាជ្យជាតិ' }],
      monthlyScores: [
        { classId: 1, studentRef: 10, month: '2026-11', scores: { kh_essay: 52, math: 88 } },
      ],
      semesterExams: [
        { classId: 1, studentRef: 10, semester: 1, scores: { kh_essay: 50, math: 90 } },
      ],
    },
  });
}

describe('Step 6c — Legacy KruDeskDB import & v1 JSON backup full Cloud upload', () => {
  beforeAll(async () => {
    setLogLevel('silent');
    const [host = '127.0.0.1', portStr = '8088'] = (
      process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088'
    ).split(':');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host,
        port: Number(portStr),
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminFs = ctx.firestore();
      await setDoc(doc(adminFs, 'config', 'admin'), { email: 'admin@example.com' });
      await setDoc(doc(adminFs, 'users', TEACHER_UID), {
        email: TEACHER_EMAIL,
        displayName: 'គ្រូ សាកល្បង 6c',
        photoURL: null,
        status: 'approved',
        createdAt: Timestamp.now(),
      });
    });
  });

  afterEach(async () => {
    for (const db of openDbs.splice(0)) {
      try {
        await clearAllAppData(db);
      } catch {
        /* ignore */
      }
      db.close();
      try {
        await db.delete();
      } catch {
        /* ignore */
      }
    }
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('1. Legacy import BEFORE first sign-in: Cloud empty -> uploads imported legacy data; Cloud has data -> triggers Replace conflict with safety snapshots', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const legacyName = `KruDeskDB_emu_legacy_${suffix}`;
    const legacyDb = new KruDeskDatabase(legacyName, { enableOutbox: false });
    const dbA = new KruDeskDatabase(`KruDeskDB_emu_A_${suffix}`, { enableOutbox: true });
    const dbB = new KruDeskDatabase(`KruDeskDB_emu_B_${suffix}`, { enableOutbox: true });
    openDbs.push(legacyDb, dbA, dbB);
    await Promise.all([legacyDb.open(), dbA.open(), dbB.open()]);
    await Promise.all([clearAllAppData(legacyDb), clearAllAppData(dbA), clearAllAppData(dbB)]);

    const clsId = await legacyDb.classes.add({
      name: '8A-Legacy',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    await legacyDb.students.add({
      classId: clsId,
      order: 1,
      studentId: 'L01',
      nameKm: 'សិស្ស ទិន្នន័យចាស់',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    const storage1 = createMemoryStorage();
    const fsA = getTeacherFirestore('DevA');
    const fsB = getTeacherFirestore('DevB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A' });
    const engineB = new SyncEngine({ localDb: dbB, firestore: fsB, uid: TEACHER_UID, deviceId: 'dev-B' });

    // A) Cloud is empty -> import legacy DB into dbA -> normal first sign-in uploads everything!
    const found = await inspectLegacyDbForUser(TEACHER_UID, { legacyDbName: legacyName, storage: storage1 });
    expect(found).toEqual({ classesCount: 1, studentsCount: 1 });
    await importLegacyDbIntoUserDb(TEACHER_UID, dbA, { legacyDbName: legacyName, storage: storage1 });

    const actionA = await runFirstSignInFlow({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      engine: engineA,
    });
    expect(actionA).toBe('upload_to_cloud');
    expect(await isInitialSyncDone(dbA)).toBe(true);

    // B) Second device imports another unclaimed legacy DB while Cloud ALREADY has data -> ask_conflict!
    const storage2 = createMemoryStorage();
    await importLegacyDbIntoUserDb(TEACHER_UID, dbB, { legacyDbName: legacyName, storage: storage2 });
    const actionB = await runFirstSignInFlow({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
    });
    expect(actionB).toBe('ask_conflict');

    const res = await resolveFirstSignInConflict({
      choice: 'cloud',
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
      downloadDeviceBackup: async () => null,
    });
    expect(res.deviceSnapshot.source).toBe('pre-replace-device');
    expect(res.cloudSnapshot.source).toBe('pre-replace-cloud');
    expect(await isInitialSyncDone(dbB)).toBe(true);
    expect((await dbB.classes.toArray())[0]?.name).toBe('8A-Legacy');
    // Original legacyDb is completely untouched
    expect(await legacyDb.classes.count()).toBe(1);
    expect(await legacyDb.students.count()).toBe(1);
  });

  it('2. Old-format v1 JSON backup restores cleanly (derives attendanceSessions, normalizes subjects, restores photo) and uploads via pushFullReplace to Device B', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dbA = new KruDeskDatabase(`KruDeskDB_v1_A_${suffix}`, { enableOutbox: true });
    const dbB = new KruDeskDatabase(`KruDeskDB_v1_B_${suffix}`, { enableOutbox: true });
    openDbs.push(dbA, dbB);
    await Promise.all([dbA.open(), dbB.open()]);
    await Promise.all([clearAllAppData(dbA), clearAllAppData(dbB)]);

    const fsA = getTeacherFirestore('DevA-v1');
    const fsB = getTeacherFirestore('DevB-v1');
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-A-v1',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      deviceId: 'dev-B-v1',
      requireInitialDone: false,
    });

    // Seed pre-existing Cloud data that should be replaced by the v1 backup restore
    await dbA.classes.add({
      name: 'ថ្នាក់ចាស់-ត្រូវជំនួស',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#ff9500',
      subjects: [],
      createdAt: 1732000000000,
    });
    await engineA.pushOutbox();

    // Parse & restore the v1 JSON fixture ('replace')
    const parsedV1 = parseAndValidateBackup(makeV1BackupFixtureJson());
    expect(parsedV1.schemaVersion).toBe(1);
    const summary = await restoreBackupPayload(parsedV1, 'replace', dbA);
    expect(summary.classesCount).toBe(1);
    expect(summary.studentsCount).toBe(1);
    expect(summary.attendanceCount).toBe(2);
    expect(await dbA.settings.get(SYNC_PENDING_FULL_REPLACE_KEY)).toBeDefined();

    // pushOutbox detects syncPendingFullReplace -> executes pushFullReplace
    const pushRes = await engineA.pushOutbox();
    expect(pushRes.pushedDocsCount).toBeGreaterThanOrEqual(5);
    expect(await dbA.settings.get(SYNC_PENDING_FULL_REPLACE_KEY)).toBeUndefined();

    // Device B pulls everything and matches the restored v1 backup
    await engineB.pullChanges({ forceAll: true });

    const bClasses = await dbB.classes.toArray();
    expect(bClasses).toHaveLength(1);
    expect(bClasses[0]?.name).toBe('8A-v1');

    const bStudents = await dbB.students.toArray();
    expect(bStudents).toHaveLength(1);
    expect(bStudents[0]?.nameKm).toBe('សិស្ស គំរូ v1');
    expect(bStudents[0]?.photoBlob).toBeDefined();

    // Derived attendanceSessions from v1 absences must also sync!
    const bAttendance = await dbB.attendance.toArray();
    const bSessions = await dbB.attendanceSessions.toArray();
    expect(bAttendance).toHaveLength(2);
    expect(bSessions).toHaveLength(2);
    expect(bSessions.every((s) => s.migrated === true)).toBe(true);

    const bScores = await dbB.monthlyScores.toArray();
    const bExams = await dbB.semesterExams.toArray();
    const bHolidays = await dbB.holidays.toArray();
    expect(bScores).toHaveLength(1);
    expect(bScores[0]?.scores.math).toBe(88);
    expect(bExams).toHaveLength(1);
    expect(bExams[0]?.scores.kh_essay).toBe(50);
    expect(bHolidays).toHaveLength(1);
    expect((await dbB.settings.get('documentPlace'))?.value).toBe('កណ្ដាល');
    // Device-only theme setting from v1 backup must NOT sync to Device B
    expect(await dbB.settings.get('theme')).toBeUndefined();
  });
});
