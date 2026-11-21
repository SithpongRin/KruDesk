// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { clearAllAppData, KruDeskDatabase } from '../src/db/database';
import { markInitialSyncDone } from '../src/services/sync/firstSignIn';
import {
  makeTombstone,
  SYNC_LAST_PULL_WALL_AT_KEY,
  SYNC_LAST_PULLED_AT_KEY,
  SYNC_SCHEMA_VERSION,
  TOMBSTONE_RETENTION_MS,
} from '../src/services/sync/syncCodec';
import { SyncEngine } from '../src/services/sync/syncEngine';

const PROJECT_ID = 'demo-krudesk';
const TEACHER_UID = 'teacher-tombstone-uid';
const TEACHER_EMAIL = 'teacher.tombstone@example.com';

const DAY_MS = 24 * 60 * 60 * 1000;

let testEnv: RulesTestEnvironment;
const openDbs: KruDeskDatabase[] = [];
const engines: SyncEngine[] = [];

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

async function createDeviceDb(label: string): Promise<KruDeskDatabase> {
  const db = new KruDeskDatabase(`KruDeskDB_tomb_${label}_${Date.now()}_${Math.random()}`);
  await db.open();
  await clearAllAppData(db);
  openDbs.push(db);
  return db;
}

const baseClass = {
  gradeLevel: 8,
  academicYear: '2026-2027',
  color: '#0071e3',
  subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
  createdAt: 1732000000000,
};

describe('Step 6d — Tombstone purge (> 90 days) & stale-device safety guard', () => {
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
        displayName: 'គ្រូ សាកល្បង Tombstone',
        photoURL: null,
        status: 'approved',
        createdAt: Timestamp.now(),
      });
    });
  });

  afterEach(async () => {
    for (const e of engines.splice(0)) e.stop();
    for (const db of openDbs.splice(0)) {
      try {
        await clearAllAppData(db);
      } catch {
        /* ignore */
      }
      db.close();
    }
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('1. purges tombstones older than 90 days from docs written by this device (and during daily snapshot), keeps < 90-day tombstones, and never scans untouched docs', async () => {
    const dbA = await createDeviceDb('PurgeA');
    const fsA = getTeacherFirestore('DevPurgeA');
    await markInitialSyncDone(dbA);

    const nowMs = new Date(2026, 10, 21, 10, 0, 0).getTime();
    const expiredTs = nowMs - TOMBSTONE_RETENTION_MS - 5 * DAY_MS; // 95 days old
    const recentTs = nowMs - 10 * DAY_MS; // 10 days old

    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-purge-A',
      dailySnapshots: true,
      dailySnapshotNow: () => nowMs,
    });
    engines.push(engineA);

    // Seed class + live student + two tombstones (one 95d old, one 10d old) in students__<classId>
    const classId = await dbA.classes.add({ ...baseClass, name: '8A' });
    const liveStudentId = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S01',
      nameKm: 'សិស្ស នៅរៀន',
      gender: 'ស្រី',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await engineA.pushOutbox();

    // Inject an expired tombstone (95d old) and a recent tombstone (10d old) into students__<classId>
    // AND an expired tombstone into an untouched holidays doc that this device will NOT write
    const studentsDocRef = doc(fsA, 'users', TEACHER_UID, 'docs', `students__${classId}`);
    const currentSnap = await getDoc(studentsDocRef);
    const currentRows = (currentSnap.data()?.rows ?? {}) as Record<string, unknown>;
    await setDoc(studentsDocRef, {
      kind: 'students',
      schemaVersion: SYNC_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
      updatedBy: 'other-dev',
      rows: {
        ...currentRows,
        s_999001: makeTombstone(expiredTs),
        s_999002: makeTombstone(recentTs),
      },
    });

    const untouchedDocRef = doc(fsA, 'users', TEACHER_UID, 'docs', 'holidays');
    await setDoc(untouchedDocRef, {
      kind: 'holidays',
      schemaVersion: SYNC_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
      updatedBy: 'other-dev',
      rows: {
        h_888001: makeTombstone(expiredTs),
      },
    });

    // Pull so engineA observes the tombstones in remote docs
    await engineA.pullChanges({ forceAll: true });

    // Edit the live student -> engineA writes students__<classId> anyway -> expired tombstone purged!
    await dbA.students.update(liveStudentId, { nameKm: 'សិស្ស នៅរៀន (កែ)' });
    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();

    const afterStudentsSnap = await getDoc(studentsDocRef);
    const afterRows = (afterStudentsSnap.data()?.rows ?? {}) as Record<string, unknown>;
    expect(afterRows[`s_${liveStudentId}`]).toBeDefined();
    // 95-day-old tombstone was PURGED!
    expect(Object.prototype.hasOwnProperty.call(afterRows, 's_999001')).toBe(false);
    // 10-day-old tombstone was KEPT!
    expect(afterRows['s_999002']).toEqual({ __deleted: true, ts: recentTs });

    // Untouched doc (never written by this device) was NOT scanned/written just for purging!
    const afterUntouchedSnap = await getDoc(untouchedDocRef);
    const untouchedRows = (afterUntouchedSnap.data()?.rows ?? {}) as Record<string, unknown>;
    expect(untouchedRows['h_888001']).toEqual({ __deleted: true, ts: expiredTs });
  });

  it('2. Safety guard: a stale device (lastPulledAt > 90 days old) forces full pull and SKIPS self-heal (cloud wins) so purged deleted rows are never resurrected', async () => {
    const dbA = await createDeviceDb('StaleA');
    const dbB = await createDeviceDb('StaleB');
    const fsA = getTeacherFirestore('DevStaleA');
    const fsB = getTeacherFirestore('DevStaleB');
    await Promise.all([markInitialSyncDone(dbA), markInitialSyncDone(dbB)]);

    const day0Ms = new Date(2026, 7, 1, 9, 0, 0).getTime(); // Aug 1, 2026
    const day95Ms = day0Ms + 95 * DAY_MS; // 95 days later (> 90d horizon)
    let clockA = day0Ms;
    let clockB = day0Ms;

    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-stale-A',
      dailySnapshots: true,
      dailySnapshotNow: () => clockA,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      deviceId: 'dev-stale-B',
      dailySnapshots: false,
      dailySnapshotNow: () => clockB,
    });
    engines.push(engineA, engineB);

    // Day 0: Device A creates class + 2 students; Device B syncs both
    const classId = await dbA.classes.add({ ...baseClass, name: '8A-Guard' });
    const keepId = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'K01',
      nameKm: 'សិស្ស រក្សាទុក',
      gender: 'ស្រី',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: day0Ms,
      updatedAt: day0Ms,
    });
    const deletedId = await dbA.students.add({
      classId,
      order: 2,
      studentId: 'D02',
      nameKm: 'សិស្ស ត្រូវលុប',
      gender: 'ប្រុស',
      dateOfBirth: '2013-02-02',
      status: 'active',
      createdAt: day0Ms,
      updatedAt: day0Ms,
    });

    await engineA.syncNow();
    await engineB.pullChanges({ forceAll: true });
    expect(await dbB.students.get(keepId)).toBeDefined();
    expect(await dbB.students.get(deletedId)).toBeDefined();

    // Device B goes offline for 95 days! Meanwhile on Day 1, Device A deletes `deletedId`
    // and by Day 95 its tombstone has been purged from Cloud (only `keepId` remains in students doc).
    await dbA.students.delete(deletedId);
    await engineA.pushOutbox();

    // Simulate Day 1 tombstone timestamp on Cloud, then Device A writes on Day 95 -> purges it!
    const studentsDocRef = doc(fsA, 'users', TEACHER_UID, 'docs', `students__${classId}`);
    const snapBeforePurge = await getDoc(studentsDocRef);
    const rowsBeforePurge = (snapBeforePurge.data()?.rows ?? {}) as Record<string, unknown>;
    await setDoc(studentsDocRef, {
      kind: 'students',
      schemaVersion: SYNC_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
      updatedBy: 'dev-stale-A',
      rows: {
        ...rowsBeforePurge,
        [`s_${deletedId}`]: makeTombstone(day0Ms + DAY_MS), // Day 1 tombstone -> 94 days old at Day 95
      },
    });

    clockA = day95Ms;
    await engineA.pullChanges({ forceAll: true });
    await dbA.students.update(keepId, { nameKm: 'សិស្ស រក្សាទុក (ថ្មី)' });
    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();

    // Confirm tombstone for `deletedId` is completely GONE from Cloud doc
    const purgedSnap = await getDoc(studentsDocRef);
    const purgedRows = (purgedSnap.data()?.rows ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(purgedRows, `s_${deletedId}`)).toBe(false);

    // Day 95: Device B wakes up (its lastPulledAt / wall clock is 95 days old!).
    // Suppose teacher also added 1 brand-new offline student on Device B before syncing.
    const offlineNewId = await dbB.students.add({
      classId,
      order: 3,
      studentId: 'N03',
      nameKm: 'សិស្ស ថ្មីលើ B',
      gender: 'ស្រី',
      dateOfBirth: '2013-03-03',
      status: 'active',
      createdAt: day95Ms,
      updatedAt: day95Ms,
    });

    // Ensure Device B's stored pull timestamps are at Day 0 (95 days before Day 95)
    await dbB.runRemoteTransaction([dbB.settings], async () => {
      await dbB.settings.put({ key: SYNC_LAST_PULLED_AT_KEY, value: day0Ms });
      await dbB.settings.put({ key: SYNC_LAST_PULL_WALL_AT_KEY, value: day0Ms });
    });

    clockB = day95Ms;
    const pullResB = await engineB.pullChanges();

    // Guard MUST have skipped self-heal -> deletedId is NOT re-queued & is deleted locally!
    expect(pullResB.requeuedCount).toBe(0);
    expect(await dbB.students.get(deletedId)).toBeUndefined();
    expect((await dbB.students.get(keepId))?.nameKm).toBe('សិស្ស រក្សាទុក (ថ្មី)');
    // Unpushed offline student on B is STILL preserved in Dexie & outbox!
    expect(await dbB.students.get(offlineNewId)).toBeDefined();
    expect(await dbB.outbox.get([`students__${classId}`, `s_${deletedId}`])).toBeUndefined();
    expect(await dbB.outbox.get([`students__${classId}`, `s_${offlineNewId}`])).toBeDefined();

    // Pushing B's outbox sends ONLY `offlineNewId` — NEVER resurrects `deletedId` on Cloud!
    await engineB.pushOutbox();
    const finalCloudSnap = await getDoc(studentsDocRef);
    const finalCloudRows = (finalCloudSnap.data()?.rows ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(finalCloudRows, `s_${deletedId}`)).toBe(false);
    expect(finalCloudRows[`s_${keepId}`]).toBeDefined();
    expect(finalCloudRows[`s_${offlineNewId}`]).toBeDefined();

    // And now that syncLastPullWallAt is refreshed to Day 95, normal self-heal resumes cleanly
    const wallRow = await dbB.settings.get(SYNC_LAST_PULL_WALL_AT_KEY);
    expect(wallRow?.value).toBe(day95Ms);
  });
});
