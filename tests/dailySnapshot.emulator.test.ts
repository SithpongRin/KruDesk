// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  setLogLevel,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { clearAllAppData, KruDeskDatabase } from '../src/db/database';
import { toLocalDateKey } from '../src/lib/khmerDate';
import {
  listCloudSnapshots,
  readCloudSnapshotPayload,
  saveBackupPayloadToCloudSnapshot,
} from '../src/services/sync/cloudSnapshot';
import { markInitialSyncDone } from '../src/services/sync/firstSignIn';
import { SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY } from '../src/services/sync/syncCodec';
import { SyncEngine, type SyncStatusSnapshot } from '../src/services/sync/syncEngine';

const PROJECT_ID = 'demo-krudesk';
const TEACHER_UID = 'teacher-daily-snap-uid';
const TEACHER_EMAIL = 'teacher.daily@example.com';

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
  const db = new KruDeskDatabase(`KruDeskDB_daily_${label}_${Date.now()}_${Math.random()}`);
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

describe('Daily Cloud snapshot (§1.7 / Step 6a) with Firestore Emulator', () => {
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
        displayName: 'គ្រូ សាកល្បង Daily Snapshot',
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

  it('1. saves one daily snapshot on the first successful sync of the day, stores local day (unsynced & excluded from backup), and skips repeat syncs the same day', async () => {
    const dbA = await createDeviceDb('A');
    const fsA = getTeacherFirestore('DeviceA');
    const day1Ms = new Date(2026, 10, 21, 9, 0, 0).getTime(); // 2026-11-21 local
    const day1Key = toLocalDateKey(new Date(day1Ms));

    await markInitialSyncDone(dbA);
    const classId = await dbA.classes.add({ ...baseClass, name: '8A-Daily' });
    await dbA.students.add({
      classId,
      order: 1,
      studentId: 'D001',
      nameKm: 'សិស្ស ប្រចាំថ្ងៃ',
      gender: 'ស្រី',
      dateOfBirth: '2013-02-02',
      status: 'active',
      createdAt: day1Ms,
      updatedAt: day1Ms,
    });

    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-A',
      requireInitialDone: true,
      dailySnapshots: true,
      dailySnapshotNow: () => day1Ms,
    });
    engines.push(engineA);

    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();

    const snaps = await listCloudSnapshots(fsA, TEACHER_UID);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.source).toBe('daily');
    expect(snaps[0]?.classCount).toBe(1);
    expect(snaps[0]?.studentCount).toBe(1);
    expect(snaps[0]?.createdAt).toBe(day1Ms);

    // Local setting is saved, NOT synced to users/{uid}/docs, and NOT inside the snapshot payload
    const localDay = await dbA.settings.get(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY);
    expect(localDay?.value).toBe(day1Key);
    const syncedSettingDoc = await getDoc(
      doc(fsA, 'users', TEACHER_UID, 'docs', `settings__${SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY}`)
    );
    expect(syncedSettingDoc.exists()).toBe(false);

    const restored = await readCloudSnapshotPayload(fsA, TEACHER_UID, snaps[0]!.backupId);
    expect(restored.data.classes).toHaveLength(1);
    expect(restored.data.classes[0]?.name).toBe('8A-Daily');
    expect(restored.data.students).toHaveLength(1);
    expect(
      restored.data.settings.some((s) => s.key === SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY)
    ).toBe(false);

    // Second sync on the same day must NOT write another daily snapshot
    await dbA.classes.update(classId, { name: '8A-Daily-Edited' });
    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();

    const snapsAfterSecondSync = await listCloudSnapshots(fsA, TEACHER_UID);
    expect(snapsAfterSecondSync).toHaveLength(1);
  });

  it('2. does NOT create a daily snapshot when syncInitialDone is false or when offline', async () => {
    const dbA = await createDeviceDb('NoInit');
    const fsA = getTeacherFirestore('DeviceNoInit');
    const day1Ms = new Date(2026, 10, 21, 10, 0, 0).getTime();

    await dbA.classes.add({ ...baseClass, name: '7A' });

    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-noinit',
      requireInitialDone: false,
      dailySnapshots: true,
      dailySnapshotNow: () => day1Ms,
    });
    engines.push(engineA);

    // Even with requireInitialDone: false, syncInitialDone is NOT true -> no daily snapshot!
    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();
    expect(await listCloudSnapshots(fsA, TEACHER_UID)).toHaveLength(0);

    // Now mark syncInitialDone = true, but go offline -> still no daily snapshot!
    await markInitialSyncDone(dbA);
    engineA.setOffline(true);
    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();
    expect(await listCloudSnapshots(fsA, TEACHER_UID)).toHaveLength(0);
    expect(await dbA.settings.get(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY)).toBeUndefined();
  });

  it('3. second device on the same day reuses existing daily snapshot (no duplicate) and next day creates a new snapshot', async () => {
    const dbA = await createDeviceDb('A3');
    const dbB = await createDeviceDb('B3');
    const fsA = getTeacherFirestore('DeviceA3');
    const fsB = getTeacherFirestore('DeviceB3');
    let currentNow = new Date(2026, 10, 21, 8, 30, 0).getTime();

    await Promise.all([markInitialSyncDone(dbA), markInitialSyncDone(dbB)]);
    await dbA.classes.add({ ...baseClass, name: '9A' });

    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-A3',
      dailySnapshots: true,
      dailySnapshotNow: () => currentNow,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      deviceId: 'dev-B3',
      dailySnapshots: true,
      dailySnapshotNow: () => currentNow,
    });
    engines.push(engineA, engineB);

    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();
    expect(await listCloudSnapshots(fsA, TEACHER_UID)).toHaveLength(1);

    // Device B syncs later on the same day -> sees today's daily snapshot, does not write a 2nd one
    await engineB.syncNow();
    await engineB.waitForPendingDailySnapshot();
    expect(await listCloudSnapshots(fsB, TEACHER_UID)).toHaveLength(1);
    expect((await dbB.settings.get(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY))?.value).toBe(
      toLocalDateKey(new Date(currentNow))
    );

    // Advance to the next day -> creates a new daily snapshot
    currentNow = new Date(2026, 10, 22, 8, 30, 0).getTime();
    await engineA.syncNow();
    await engineA.waitForPendingDailySnapshot();
    const snapsDay2 = await listCloudSnapshots(fsA, TEACHER_UID);
    expect(snapsDay2).toHaveLength(2);
    expect(snapsDay2[0]?.createdAt).toBe(currentNow);
  });

  it('4. keeps only the newest 10 snapshots and deletes BOTH older metadata docs AND their chunk docs', async () => {
    const dbA = await createDeviceDb('Prune');
    const fsA = getTeacherFirestore('DevicePrune');
    await markInitialSyncDone(dbA);
    await dbA.classes.add({ ...baseClass, name: '8A-Prune' });

    let currentNow = new Date(2026, 10, 1, 9, 0, 0).getTime();
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'dev-prune',
      dailySnapshots: true,
      dailySnapshotNow: () => currentNow,
    });
    engines.push(engineA);

    const createdIds: string[] = [];
    for (let dayOffset = 0; dayOffset < 12; dayOffset++) {
      currentNow = new Date(2026, 10, 1 + dayOffset, 9, 0, 0).getTime();
      const meta = await engineA.runDailySnapshotIfDue(currentNow);
      expect(meta).not.toBeNull();
      createdIds.push(meta!.backupId);
    }

    const remaining = await listCloudSnapshots(fsA, TEACHER_UID);
    expect(remaining).toHaveLength(10);

    // Newest 10 kept (days 3..12 -> indices 2..11)
    const remainingIds = remaining.map((s) => s.backupId);
    expect(remainingIds).toEqual(createdIds.slice(2).reverse());

    // Oldest 2 (indices 0 and 1): BOTH metadata doc AND all chunk docs must be deleted!
    for (const deletedId of createdIds.slice(0, 2)) {
      const metaSnap = await getDoc(doc(fsA, 'users', TEACHER_UID, 'backups', deletedId));
      expect(metaSnap.exists()).toBe(false);
      const chunksSnap = await getDocs(
        collection(fsA, 'users', TEACHER_UID, 'backups', deletedId, 'chunks')
      );
      expect(chunksSnap.empty).toBe(true);
    }

    // And the newest remaining snapshot is still intact & SHA-256 verified
    const newestPayload = await readCloudSnapshotPayload(fsA, TEACHER_UID, remaining[0]!.backupId);
    expect(newestPayload.data.classes[0]?.name).toBe('8A-Prune');
  }, 30_000);

  it('5. snapshot failure NEVER blocks or fails normal sync, logs warning, skips rest of today, and retries tomorrow', async () => {
    const dbA = await createDeviceDb('Fail');
    const fsA = getTeacherFirestore('DeviceFail');
    await markInitialSyncDone(dbA);

    let currentNow = new Date(2026, 10, 21, 9, 0, 0).getTime();
    let shouldFail = true;
    let attempts = 0;
    const statuses: SyncStatusSnapshot[] = [];
    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const classId = await dbA.classes.add({ ...baseClass, name: '8B-Safe' });

      const engineA = new SyncEngine({
        localDb: dbA,
        firestore: fsA,
        uid: TEACHER_UID,
        deviceId: 'dev-fail',
        dailySnapshots: true,
        dailySnapshotNow: () => currentNow,
        saveDailySnapshot: async (fs, uid, payload, now) => {
          attempts++;
          if (shouldFail) {
            throw new Error('Simulated snapshot failure');
          }
          return saveBackupPayloadToCloudSnapshot(fs, uid, payload, 'daily', { now });
        },
        onStatusChange: (s) => statuses.push(s),
        onError,
      });
      engines.push(engineA);

      // Day 1 sync succeeds even though snapshot throws
      const res = await engineA.syncNow();
      expect(res.pushedEntriesCount).toBeGreaterThanOrEqual(1);
      await engineA.waitForPendingDailySnapshot();

      expect(attempts).toBe(1);
      expect(onError).not.toHaveBeenCalled();
      expect(statuses[statuses.length - 1]?.state).toBe('synced');
      expect(statuses[statuses.length - 1]?.errorMessage).toBeNull();
      expect(warnSpy).toHaveBeenCalled();

      // Cloud doc was synced normally
      const classDoc = await getDoc(doc(fsA, 'users', TEACHER_UID, 'docs', `class__${classId}`));
      expect(classDoc.exists()).toBe(true);

      // Another sync on Day 1 does NOT retry the failed snapshot
      await dbA.classes.update(classId, { name: '8B-Safe-2' });
      await engineA.syncNow();
      await engineA.waitForPendingDailySnapshot();
      expect(attempts).toBe(1);

      // Day 2: snapshot retries and succeeds!
      shouldFail = false;
      currentNow = new Date(2026, 10, 22, 9, 0, 0).getTime();
      await engineA.syncNow();
      await engineA.waitForPendingDailySnapshot();
      expect(attempts).toBe(2);

      const snaps = await listCloudSnapshots(fsA, TEACHER_UID);
      expect(snaps).toHaveLength(1);
      expect(snaps[0]?.createdAt).toBe(currentNow);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
