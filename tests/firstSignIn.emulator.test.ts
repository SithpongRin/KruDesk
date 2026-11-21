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
import { buildBackupPayload, type KruDeskBackupPayload } from '../src/services/backup';
import {
  buildBackupPayloadFromCloudDocs,
  MAX_BACKUP_CHUNK_CHARS,
  readCloudSnapshotPayload,
} from '../src/services/sync/cloudSnapshot';
import {
  isInitialSyncDone,
  resolveFirstSignInConflict,
  runFirstSignInFlow,
} from '../src/services/sync/firstSignIn';
import { SyncEngine } from '../src/services/sync/syncEngine';

const PROJECT_ID = 'demo-krudesk';
const TEACHER_UID = 'teacher-first-signin-uid';
const TEACHER_EMAIL = 'teacher.firstsignin@example.com';

let testEnv: RulesTestEnvironment;
let dbA: KruDeskDatabase;
let dbB: KruDeskDatabase;

function getTeacherFirestore(clientLabel: string): Firestore {
  const ctx = testEnv.authenticatedContext(TEACHER_UID, {
    email: TEACHER_EMAIL,
    email_verified: true,
    name: clientLabel,
    firebase: {
      sign_in_provider: 'google.com',
    },
  });
  return ctx.firestore() as unknown as Firestore;
}

describe('First sign-in flows (§1.6 / Step 4) with Firestore Emulator', () => {
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
      await setDoc(doc(adminFs, 'config', 'admin'), {
        email: 'admin@example.com',
      });
      await setDoc(doc(adminFs, 'users', TEACHER_UID), {
        email: TEACHER_EMAIL,
        displayName: 'គ្រូ សាកល្បង First Sign-In',
        photoURL: null,
        status: 'approved',
        createdAt: Timestamp.now(),
      });
    });

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    dbA = new KruDeskDatabase(`KruDeskDB_fsi_A_${suffix}`);
    dbB = new KruDeskDatabase(`KruDeskDB_fsi_B_${suffix}`);
    await Promise.all([dbA.open(), dbB.open()]);
    await Promise.all([clearAllAppData(dbA), clearAllAppData(dbB)]);
  });

  afterEach(async () => {
    await Promise.all([clearAllAppData(dbA), clearAllAppData(dbB)]);
    dbA.close();
    dbB.close();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('Case 1: Cloud has data, Device empty -> pulls all data (including photo), marks syncInitialDone, device & cloud match', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const fsB = getTeacherFirestore('DeviceB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A', requireInitialDone: false });
    const engineB = new SyncEngine({ localDb: dbB, firestore: fsB, uid: TEACHER_UID, deviceId: 'dev-B' });

    // Seed Cloud via Device A
    await dbA.settings.put({
      key: 'profile',
      value: {
        teacherName: 'លោកគ្រូ ក',
        schoolName: 'សាលា ក',
        directorName: 'នាយក ក',
        province: 'កណ្ដាល',
        academicYear: '2026-2027',
      },
    });
    const classId = await dbA.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const studentId = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស លើ Cloud',
      gender: 'ស្រី',
      dateOfBirth: '2013-01-01',
      photoBlob: new Blob([photoBytes], { type: 'image/jpeg' }),
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await dbA.monthlyScores.put({
      classId,
      studentRef: studentId,
      month: '2026-11',
      scores: { math: 92 },
    });
    await engineA.pushOutbox();

    // Fresh empty Device B runs first sign-in flow
    const phases: string[] = [];
    const action = await runFirstSignInFlow({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
      onPhaseChange: (p) => phases.push(p),
    });

    expect(action).toBe('pull_from_cloud');
    expect(phases).toContain('pulling');
    expect(await isInitialSyncDone(dbB)).toBe(true);
    expect(await dbB.outbox.count()).toBe(0);

    // Device B holds the exact same data as Cloud
    const bClass = await dbB.classes.get(classId);
    const bStudent = await dbB.students.get(studentId);
    const bScore = await dbB.monthlyScores.get([classId, '2026-11', studentId]);
    expect(bClass?.name).toBe('8A');
    expect(bStudent?.nameKm).toBe('សិស្ស លើ Cloud');
    expect(bStudent?.photoBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await bStudent!.photoBlob!.arrayBuffer()))).toEqual(
      Array.from(photoBytes)
    );
    expect(bScore?.scores.math).toBe(92);

    // Second call returns already_done immediately
    const secondAction = await runFirstSignInFlow({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
    });
    expect(secondAction).toBe('already_done');
  });

  it('Case 2: Cloud empty, Device has data (even written before outbox existed) -> uploads all via pushFullReplace, device & cloud match', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const fsB = getTeacherFirestore('DeviceB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A' });
    const engineB = new SyncEngine({ localDb: dbB, firestore: fsB, uid: TEACHER_UID, deviceId: 'dev-B', requireInitialDone: false });

    // Seed Device A bypassing outbox (simulates pre-outbox rows on first device!)
    const preOutboxClassId = 101;
    const preOutboxStudentId = 202;
    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);
    await dbA.runRemoteTransaction(
      [dbA.settings, dbA.classes, dbA.students, dbA.monthlyScores],
      async () => {
        await dbA.settings.put({
          key: 'profile',
          value: {
            teacherName: 'លោកគ្រូ ឧបករណ៍ទី១',
            schoolName: 'សាលា ទី១',
            directorName: 'នាយក ទី១',
            province: 'ភ្នំពេញ',
            academicYear: '2026-2027',
          },
        });
        await dbA.classes.put({
          id: preOutboxClassId,
          name: '7B-PreOutbox',
          gradeLevel: 7,
          academicYear: '2026-2027',
          color: '#34c759',
          subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
          createdAt: 1732000000000,
        });
        await dbA.students.put({
          id: preOutboxStudentId,
          classId: preOutboxClassId,
          order: 1,
          studentId: 'P001',
          nameKm: 'សិស្ស មុន Outbox',
          gender: 'ប្រុស',
          dateOfBirth: '2013-03-03',
          photoBlob: new Blob([photoBytes], { type: 'image/jpeg' }),
          status: 'active',
          createdAt: 1732000000000,
          updatedAt: 1732000000000,
        });
        await dbA.monthlyScores.put({
          classId: preOutboxClassId,
          studentRef: preOutboxStudentId,
          month: '2026-11',
          scores: { math: 87 },
        });
      }
    );
    expect(await dbA.outbox.count()).toBe(0);

    // Run first sign-in on Device A (Cloud is empty)
    const phases: string[] = [];
    const action = await runFirstSignInFlow({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      engine: engineA,
      onPhaseChange: (p) => phases.push(p),
    });

    expect(action).toBe('upload_to_cloud');
    expect(phases).toContain('uploading');
    expect(await isInitialSyncDone(dbA)).toBe(true);

    // Verify Cloud now holds all pre-outbox data by pulling onto Device B
    await engineB.pullChanges({ forceAll: true });
    expect((await dbB.classes.get(preOutboxClassId))?.name).toBe('7B-PreOutbox');
    const bSt = await dbB.students.get(preOutboxStudentId);
    expect(bSt?.nameKm).toBe('សិស្ស មុន Outbox');
    expect(bSt?.photoBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await bSt!.photoBlob!.arrayBuffer()))).toEqual(
      Array.from(photoBytes)
    );
    expect((await dbB.monthlyScores.get([preOutboxClassId, '2026-11', preOutboxStudentId]))?.scores.math).toBe(87);
  });

  it('Case 3A: Both have data -> asks conflict, aborts safely if backup fails, and Cloud choice saves both backups before replacing device', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const fsB = getTeacherFirestore('DeviceB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A', requireInitialDone: false });
    const engineB = new SyncEngine({ localDb: dbB, firestore: fsB, uid: TEACHER_UID, deviceId: 'dev-B' });

    // Seed Cloud with Class Cloud
    const cloudClassId = await dbA.classes.add({
      name: 'ថ្នាក់ Cloud 9A',
      gradeLevel: 9,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const cloudStudentId = await dbA.students.add({
      classId: cloudClassId,
      order: 1,
      studentId: 'C001',
      nameKm: 'សិស្ស Cloud',
      gender: 'ស្រី',
      dateOfBirth: '2012-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await engineA.pushOutbox();

    // Seed Device B with different local data (Class Local)
    const localClassId = await dbB.classes.add({
      name: 'ថ្នាក់ Local 7A',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#ff9500',
      subjects: [],
      createdAt: 1732000000000,
    });
    await dbB.students.add({
      classId: localClassId,
      order: 1,
      studentId: 'L001',
      nameKm: 'សិស្ស Local',
      gender: 'ប្រុស',
      dateOfBirth: '2014-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    // 1. First sign-in detects conflict without modifying either side
    const action = await runFirstSignInFlow({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
    });
    expect(action).toBe('ask_conflict');
    expect(await isInitialSyncDone(dbB)).toBe(false);
    expect((await dbB.classes.get(localClassId))?.name).toBe('ថ្នាក់ Local 7A');

    // 2. Safety check: if saving the device cloud snapshot fails, NOTHING is lost on device or cloud!
    await expect(
      resolveFirstSignInConflict({
        choice: 'cloud',
        localDb: dbB,
        firestore: fsB,
        uid: TEACHER_UID,
        engine: engineB,
        saveDeviceSnapshot: async () => {
          throw new Error('Device snapshot failed');
        },
      })
    ).rejects.toThrow('Device snapshot failed');
    expect((await dbB.classes.get(localClassId))?.name).toBe('ថ្នាក់ Local 7A');
    expect(await isInitialSyncDone(dbB)).toBe(false);

    // 2b. Safety check: if saving the cloud snapshot fails, NOTHING is lost on device or cloud!
    await expect(
      resolveFirstSignInConflict({
        choice: 'cloud',
        localDb: dbB,
        firestore: fsB,
        uid: TEACHER_UID,
        engine: engineB,
        saveCloudSnapshot: async () => {
          throw new Error('Cloud snapshot failed');
        },
      })
    ).rejects.toThrow('Cloud snapshot failed');
    expect((await dbB.classes.get(localClassId))?.name).toBe('ថ្នាក់ Local 7A');
    expect(await isInitialSyncDone(dbB)).toBe(false);

    // 3. Now resolve with Cloud choice (default): BOTH device & cloud snapshots are saved to
    //    users/{uid}/backups before replacing (even if the extra browser JSON download fails on iOS PWA)
    let capturedDeviceBackup: KruDeskBackupPayload | null = null;
    const res = await resolveFirstSignInConflict({
      choice: 'cloud',
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
      downloadDeviceBackup: async () => {
        capturedDeviceBackup = await buildBackupPayload(Date.now(), dbB);
        return capturedDeviceBackup;
      },
    });

    // Safety net verified: BOTH deviceSnapshot ('pre-replace-device') AND cloudSnapshot ('pre-replace-cloud')
    // exist in users/{uid}/backups and can be read back with SHA-256 verification!
    expect(capturedDeviceBackup!.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Local 7A']);
    expect(capturedDeviceBackup!.data.students.map((s) => s.nameKm)).toEqual(['សិស្ស Local']);

    expect(res.deviceSnapshot.source).toBe('pre-replace-device');
    expect(res.deviceSnapshot.chunkCount).toBeGreaterThanOrEqual(1);
    const restoredDeviceSnap = await readCloudSnapshotPayload(
      fsB,
      TEACHER_UID,
      res.deviceSnapshot.backupId
    );
    expect(restoredDeviceSnap.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Local 7A']);
    expect(restoredDeviceSnap.data.students.map((s) => s.nameKm)).toEqual(['សិស្ស Local']);

    expect(res.cloudSnapshot.source).toBe('pre-replace-cloud');
    expect(res.cloudSnapshot.chunkCount).toBeGreaterThanOrEqual(1);
    expect(res.cloudSnapshot.sizeBytes).toBeLessThanOrEqual(MAX_BACKUP_CHUNK_CHARS);
    const restoredCloudSnap = await readCloudSnapshotPayload(
      fsB,
      TEACHER_UID,
      res.cloudSnapshot.backupId
    );
    expect(restoredCloudSnap.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Cloud 9A']);
    expect(restoredCloudSnap.data.students.map((s) => s.nameKm)).toEqual(['សិស្ស Cloud']);

    // Device B now matches Cloud identically (Local data replaced by Cloud data, outbox empty)
    expect(await dbB.classes.get(localClassId)).toBeUndefined();
    expect((await dbB.classes.get(cloudClassId))?.name).toBe('ថ្នាក់ Cloud 9A');
    expect((await dbB.students.get(cloudStudentId))?.nameKm).toBe('សិស្ស Cloud');
    expect(await dbB.outbox.count()).toBe(0);
    expect(await isInitialSyncDone(dbB)).toBe(true);
  });

  it('Case 3B: Both have data -> Device choice saves BOTH device & cloud snapshots first, then replaces Cloud so all devices match Device', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const fsB = getTeacherFirestore('DeviceB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A', requireInitialDone: false });
    const engineB = new SyncEngine({ localDb: dbB, firestore: fsB, uid: TEACHER_UID, deviceId: 'dev-B' });

    // Seed Cloud with Class Cloud
    const cloudClassId = await dbA.classes.add({
      name: 'ថ្នាក់ Cloud ចាស់',
      gradeLevel: 10,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    await dbA.students.add({
      classId: cloudClassId,
      order: 1,
      studentId: 'C100',
      nameKm: 'សិស្ស Cloud ចាស់',
      gender: 'ប្រុស',
      dateOfBirth: '2011-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await engineA.pushOutbox();

    // Seed Device B with Class Local + student photo
    const localClassId = await dbB.classes.add({
      name: 'ថ្នាក់ Device ថ្មី',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#34c759',
      subjects: [],
      createdAt: 1732000000000,
    });
    const localPhotoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 42, 43, 44]);
    const localStudentId = await dbB.students.add({
      classId: localClassId,
      order: 1,
      studentId: 'D001',
      nameKm: 'សិស្ស Device ថ្មី',
      gender: 'ស្រី',
      dateOfBirth: '2013-05-05',
      photoBlob: new Blob([localPhotoBytes], { type: 'image/jpeg' }),
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    const res = await resolveFirstSignInConflict({
      choice: 'device',
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
      // Simulate iOS standalone PWA download failing — durable cloud snapshots still protect both sides
      downloadDeviceBackup: async () => {
        throw new Error('iOS download unavailable');
      },
    });

    // BOTH durable snapshots in users/{uid}/backups can be read back and preserve pre-replace states!
    expect(res.deviceSnapshot.source).toBe('pre-replace-device');
    const restoredDeviceSnap = await readCloudSnapshotPayload(
      fsB,
      TEACHER_UID,
      res.deviceSnapshot.backupId
    );
    expect(restoredDeviceSnap.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Device ថ្មី']);
    expect(restoredDeviceSnap.data.students.map((s) => s.nameKm)).toEqual(['សិស្ស Device ថ្មី']);
    expect(restoredDeviceSnap.data.students[0]?.photoBase64).toContain('data:image/jpeg;base64,');

    expect(res.cloudSnapshot.source).toBe('pre-replace-cloud');
    const restoredCloudSnap = await readCloudSnapshotPayload(
      fsB,
      TEACHER_UID,
      res.cloudSnapshot.backupId
    );
    expect(restoredCloudSnap.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Cloud ចាស់']);
    expect(restoredCloudSnap.data.students.map((s) => s.nameKm)).toEqual(['សិស្ស Cloud ចាស់']);

    // Cloud docs now match Device B identically
    const cloudAfter = await buildBackupPayloadFromCloudDocs(fsB, TEACHER_UID);
    expect(cloudAfter.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Device ថ្មី']);
    expect(cloudAfter.data.students.map((s) => s.nameKm)).toEqual(['សិស្ស Device ថ្មី']);

    // Device A pulls -> old cloud class is gone and Device B's class + student + photo appear!
    await engineA.pullChanges();
    expect(await dbA.classes.get(cloudClassId)).toBeUndefined();
    expect((await dbA.classes.get(localClassId))?.name).toBe('ថ្នាក់ Device ថ្មី');
    const aStudent = await dbA.students.get(localStudentId);
    expect(aStudent?.nameKm).toBe('សិស្ស Device ថ្មី');
    expect(aStudent?.photoBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await aStudent!.photoBlob!.arrayBuffer()))).toEqual(
      Array.from(localPhotoBytes)
    );
    expect(await isInitialSyncDone(dbB)).toBe(true);
  });

  it('Guard (Fix 1b): by default (requireInitialDone=true), while syncInitialDone is false, syncNow(), pushOutbox(), pullChanges(), and setOffline(false) do nothing — no silent merge!', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const fsB = getTeacherFirestore('DeviceB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A', requireInitialDone: false });
    // Device B uses default requireInitialDone (true!)
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      deviceId: 'dev-B',
    });

    // Seed Cloud with Class Cloud
    const cloudClassId = await dbA.classes.add({
      name: 'ថ្នាក់ Cloud ដើម',
      gradeLevel: 9,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    await engineA.pushOutbox();

    // Seed Device B with Class Local while syncInitialDone is NOT set
    const localClassId = await dbB.classes.add({
      name: 'ថ្នាក់ Device ដើម',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#ff9500',
      subjects: [],
      createdAt: 1732000000000,
    });
    expect(await isInitialSyncDone(dbB)).toBe(false);

    // Try every sync entry point on Device B before first sign-in decision is made
    const pushRes = await engineB.pushOutbox();
    const pullRes = await engineB.pullChanges();
    const syncRes = await engineB.syncNow();
    engineB.setOffline(true);
    engineB.setOffline(false);
    await engineB.onWindowFocus();

    expect(pushRes.pushedEntriesCount).toBe(0);
    expect(pullRes.pulledDocsCount).toBe(0);
    expect(syncRes.pushedEntriesCount).toBe(0);
    expect(syncRes.pulledDocsCount).toBe(0);

    // Device B is completely untouched (still only Local class, Cloud class NOT pulled)
    expect((await dbB.classes.toArray()).map((c) => c.name)).toEqual(['ថ្នាក់ Device ដើម']);
    expect(await dbB.classes.get(cloudClassId)).toBeUndefined();
    expect(await dbB.classes.get(localClassId)).toBeDefined();

    // Cloud is completely untouched (still only Cloud class, Local class NOT pushed)
    const cloudNow = await buildBackupPayloadFromCloudDocs(fsB, TEACHER_UID);
    expect(cloudNow.data.classes.map((c) => c.name)).toEqual(['ថ្នាក់ Cloud ដើម']);
  });

  it('Defer during pulling/uploading (Small Fix 1): if pull/upload finishes without error after UI cancel, syncInitialDone is still marked true so retry never triggers a false conflict dialog', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const fsB = getTeacherFirestore('DeviceB');
    const engineA = new SyncEngine({ localDb: dbA, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-A', requireInitialDone: false });
    const engineB = new SyncEngine({ localDb: dbB, firestore: fsB, uid: TEACHER_UID, deviceId: 'dev-B' });

    // Seed Cloud via Device A
    const cloudClassId = await dbA.classes.add({
      name: '8A-Cloud',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    await engineA.pushOutbox();

    // Device B starts first sign-in; teacher clicks «ប្រើក្នុងឧបករណ៍នេះសិន» RIGHT AS 'pulling' begins!
    let uiCancelled = false;
    const action = await runFirstSignInFlow({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
      isCancelled: () => uiCancelled,
      onPhaseChange: (phase) => {
        if (phase === 'pulling') {
          uiCancelled = true;
        }
      },
    });

    expect(action).toBe('pull_from_cloud');
    expect((await dbB.classes.get(cloudClassId))?.name).toBe('8A-Cloud');
    // syncInitialDone MUST be true because pullChanges completed without error!
    expect(await isInitialSyncDone(dbB)).toBe(true);

    // Subsequent retry MUST return 'already_done' (NOT 'ask_conflict'!)
    const retryAction = await runFirstSignInFlow({
      localDb: dbB,
      firestore: fsB,
      uid: TEACHER_UID,
      engine: engineB,
    });
    expect(retryAction).toBe('already_done');

    // Same check for deferring during 'uploading' on a fresh cloud!
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminFs = ctx.firestore();
      await setDoc(doc(adminFs, 'config', 'admin'), { email: 'admin@example.com' });
      await setDoc(doc(adminFs, 'users', TEACHER_UID), {
        email: TEACHER_EMAIL,
        displayName: 'គ្រូ សាកល្បង',
        photoURL: null,
        status: 'approved',
        createdAt: Timestamp.now(),
      });
    });
    const dbC = new KruDeskDatabase(`KruDeskDB_fsi_C_${Date.now()}`);
    await dbC.open();
    await clearAllAppData(dbC);
    try {
      await dbC.classes.add({
        name: '7C-Local',
        gradeLevel: 7,
        academicYear: '2026-2027',
        color: '#34c759',
        subjects: [],
        createdAt: 1732000000000,
      });
      const engineC = new SyncEngine({ localDb: dbC, firestore: fsA, uid: TEACHER_UID, deviceId: 'dev-C' });
      let uploadCancelled = false;
      const uploadAction = await runFirstSignInFlow({
        localDb: dbC,
        firestore: fsA,
        uid: TEACHER_UID,
        engine: engineC,
        isCancelled: () => uploadCancelled,
        onPhaseChange: (phase) => {
          if (phase === 'uploading') {
            uploadCancelled = true;
          }
        },
      });
      expect(uploadAction).toBe('upload_to_cloud');
      expect(await isInitialSyncDone(dbC)).toBe(true);
      const retryUpload = await runFirstSignInFlow({
        localDb: dbC,
        firestore: fsA,
        uid: TEACHER_UID,
        engine: engineC,
      });
      expect(retryUpload).toBe('already_done');
    } finally {
      await clearAllAppData(dbC);
      dbC.close();
    }
  });
});
