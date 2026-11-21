// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, setLogLevel, Timestamp, type Firestore } from 'firebase/firestore';
import { clearAllAppData, KruDeskDatabase } from '../src/db/database';
import { BACKUP_SCHEMA_VERSION, restoreBackupPayload, type KruDeskBackupPayload } from '../src/services/backup';
import { applyRemoteDocToDexie, SyncEngine } from '../src/services/sync/syncEngine';
import { SYNC_PENDING_PHOTOS_KEY } from '../src/services/sync/syncCodec';

const PROJECT_ID = 'demo-krudesk';
const TEACHER_UID = 'teacher-sync-uid';
const TEACHER_EMAIL = 'teacher.sync@example.com';

let testEnv: RulesTestEnvironment;
let dbA: KruDeskDatabase;
let dbB: KruDeskDatabase;

function getTeacherFirestore(clientLabel: string): Firestore {
  // Distinguish contexts slightly so each client has its own Firestore instance for the same UID
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

describe('SyncEngine multi-device synchronization with Firestore Emulator (§6.3)', () => {
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
        displayName: 'គ្រូ សាកល្បង Sync',
        photoURL: null,
        status: 'approved',
        createdAt: Timestamp.now(),
      });
    });

    dbA = new KruDeskDatabase(`KruDeskDB_emu_A_${Date.now()}`);
    dbB = new KruDeskDatabase(`KruDeskDB_emu_B_${Date.now()}`);
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

  it('1. edit on Device A -> appears on Device B (classes, students, attendance, scores, holidays, synced settings; excludes device-only settings)', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    // Device A writes synced profile setting + device-only theme setting
    await dbA.settings.put({
      key: 'profile',
      value: {
        teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
        schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
        directorName: 'លោក ជា សារ៉ា',
        province: 'កណ្ដាល',
        academicYear: '2026-2027',
      },
    });
    await dbA.settings.put({ key: 'theme', value: 'dark' });

    // Device A creates a class, 2 students, attendance session + absence, monthly score, semester exam, and holiday
    const classId = await dbA.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });

    const student1Id = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'កែវ សុខា',
      gender: 'ស្រី',
      dateOfBirth: '2013-05-10',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    await dbA.attendanceSessions.put({
      classId,
      date: '2026-11-20',
      savedAt: 1732000005000,
    });
    await dbA.attendance.put({
      classId,
      studentRef: student1Id,
      date: '2026-11-20',
      status: 'ច្ប',
    });

    await dbA.monthlyScores.put({
      classId,
      studentRef: student1Id,
      month: '2026-11',
      scores: { math: 88 },
    });

    await dbA.semesterExams.put({
      classId,
      studentRef: student1Id,
      semester: 1,
      scores: { math: 90 },
    });

    const holidayId = await dbA.holidays.add({
      date: '2026-11-09',
      label: 'បុណ្យឯករាជ្យជាតិ',
    });

    // Push from Device A -> outbox becomes empty
    const pushRes = await engineA.pushOutbox();
    expect(pushRes.pushedEntriesCount).toBeGreaterThanOrEqual(7);
    expect(await dbA.outbox.count()).toBe(0);

    // Pull on Device B -> all synced data appears on Device B with identical IDs
    const pullRes = await engineB.pullChanges();
    expect(pullRes.pulledDocsCount).toBeGreaterThanOrEqual(6);

    const bProfile = await dbB.settings.get('profile');
    expect((bProfile?.value as { teacherName: string })?.teacherName).toBe('លោកគ្រូ សុខ ដារ៉ា');

    // Device-only setting 'theme' must NOT have synced to Device B
    expect(await dbB.settings.get('theme')).toBeUndefined();

    const bClass = await dbB.classes.get(classId);
    expect(bClass?.name).toBe('8A');

    const bStudent = await dbB.students.get(student1Id);
    expect(bStudent?.nameKm).toBe('កែវ សុខា');

    const bSession = await dbB.attendanceSessions.get([classId, '2026-11-20']);
    expect(bSession?.savedAt).toBe(1732000005000);

    const bAtt = await dbB.attendance.get([classId, '2026-11-20', student1Id]);
    expect(bAtt?.status).toBe('ច្ប');

    const bScore = await dbB.monthlyScores.get([classId, '2026-11', student1Id]);
    expect(bScore?.scores.math).toBe(88);

    const bExam = await dbB.semesterExams.get([classId, 1, student1Id]);
    expect(bExam?.scores.math).toBe(90);

    const bHoliday = await dbB.holidays.get(holidayId);
    expect(bHoliday?.label).toBe('បុណ្យឯករាជ្យជាតិ');

    // Pulling on Device B must NOT write anything to Device B's outbox
    expect(await dbB.outbox.count()).toBe(0);
  });

  it('2. offline edit then reconnect: queues in outbox while offline, preserves unpushed local edits during pull, and syncs on reconnect', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    // Seed initial class and 2 students from Device A while online
    const classId = await dbA.classes.add({
      name: '7A',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    const s1 = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស ទី១',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const s2 = await dbA.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'សិស្ស ទី២',
      gender: 'ស្រី',
      dateOfBirth: '2013-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await engineA.pushOutbox();
    await engineB.pullChanges();

    // Now Device A goes OFFLINE and edits Student 1's name and score
    engineA.setOffline(true);
    await dbA.students.update(s1, { nameKm: 'សិស្ស ទី១ (កែពេល Offline)' });
    await dbA.monthlyScores.put({
      classId,
      studentRef: s1,
      month: '2026-11',
      scores: { math: 95 },
    });

    // While offline, pushOutbox sends 0 entries and keeps them in dbA.outbox
    const offlinePush = await engineA.pushOutbox();
    expect(offlinePush.pushedEntriesCount).toBe(0);
    expect(await dbA.outbox.count()).toBe(2);

    // Meanwhile Device B (online) updates Student 2's name in the same class and pushes
    await dbB.students.update(s2, { nameKm: 'សិស្ស ទី២ (កែលើឧបករណ៍ B)' });
    await engineB.pushOutbox();

    // Even if Device A pulls before pushing its outbox, A's pending outbox edit on s1 MUST NOT be overwritten!
    engineA.setOffline(false);
    await engineA.pullChanges();
    expect((await dbA.students.get(s1))?.nameKm).toBe('សិស្ស ទី១ (កែពេល Offline)');
    expect((await dbA.students.get(s2))?.nameKm).toBe('សិស្ស ទី២ (កែលើឧបករណ៍ B)');

    // Now Device A pushes its pending outbox -> Device B pulls and gets A's offline edits too
    await engineA.pushOutbox();
    expect(await dbA.outbox.count()).toBe(0);

    await engineB.pullChanges();
    expect((await dbB.students.get(s1))?.nameKm).toBe('សិស្ស ទី១ (កែពេល Offline)');
    expect((await dbB.monthlyScores.get([classId, '2026-11', s1]))?.scores.math).toBe(95);
    expect((await dbB.students.get(s2))?.nameKm).toBe('សិស្ស ទី២ (កែលើឧបករណ៍ B)');
  });

  it('3. two devices editing different students in the same month both survive (field-level writes)', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    // Seed shared class and 2 students
    const classId = await dbA.classes.add({
      name: '9A',
      gradeLevel: 9,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    const student1 = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស ក',
      gender: 'ប្រុស',
      dateOfBirth: '2012-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const student2 = await dbA.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'សិស្ស ខ',
      gender: 'ស្រី',
      dateOfBirth: '2012-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    await engineA.pushOutbox();
    await engineB.pullChanges();

    // Device A enters Nov 2026 score & attendance for Student 1
    await dbA.monthlyScores.put({
      classId,
      studentRef: student1,
      month: '2026-11',
      scores: { math: 91 },
    });
    await dbA.attendance.put({
      classId,
      studentRef: student1,
      date: '2026-11-18',
      status: 'ច្ប',
    });

    // Concurrently (before pulling A's changes!), Device B enters Nov 2026 score & attendance for Student 2
    await dbB.monthlyScores.put({
      classId,
      studentRef: student2,
      month: '2026-11',
      scores: { math: 84 },
    });
    await dbB.attendance.put({
      classId,
      studentRef: student2,
      date: '2026-11-19',
      status: 'អច្ប',
    });

    // Both push to the SAME Firestore documents (ms__<classId>__2026-11 and att__<classId>__2026-11)
    await engineA.pushOutbox();
    await engineB.pushOutbox();

    // Both pull -> BOTH students' scores and attendance in 2026-11 must survive on both devices!
    await engineA.pullChanges();
    await engineB.pullChanges();

    expect((await dbA.monthlyScores.get([classId, '2026-11', student1]))?.scores.math).toBe(91);
    expect((await dbA.monthlyScores.get([classId, '2026-11', student2]))?.scores.math).toBe(84);
    expect((await dbB.monthlyScores.get([classId, '2026-11', student1]))?.scores.math).toBe(91);
    expect((await dbB.monthlyScores.get([classId, '2026-11', student2]))?.scores.math).toBe(84);

    expect((await dbA.attendance.get([classId, '2026-11-18', student1]))?.status).toBe('ច្ប');
    expect((await dbA.attendance.get([classId, '2026-11-19', student2]))?.status).toBe('អច្ប');
    expect((await dbB.attendance.get([classId, '2026-11-18', student1]))?.status).toBe('ច្ប');
    expect((await dbB.attendance.get([classId, '2026-11-19', student2]))?.status).toBe('អច្ប');
  });

  it('4. delete propagates from Device A to Device B (students, scores, attendance, holidays, and classes)', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    const classId = await dbA.classes.add({
      name: '10A',
      gradeLevel: 10,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const s1 = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស ត្រូវលុប',
      gender: 'ប្រុស',
      dateOfBirth: '2011-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const s2 = await dbA.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'សិស្ស នៅសល់',
      gender: 'ស្រី',
      dateOfBirth: '2011-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const holidayId = await dbA.holidays.add({
      date: '2026-11-09',
      label: 'បុណ្យឯករាជ្យជាតិ',
    });

    await engineA.pushOutbox();
    await engineB.pullChanges();

    expect(await dbB.students.count()).toBe(2);
    expect(await dbB.holidays.count()).toBe(1);

    // Device A deletes Student 1 and the holiday
    await dbA.students.delete(s1);
    await dbA.holidays.delete(holidayId);
    await engineA.pushOutbox();

    // Device B pulls -> Student 1 and holiday are deleted on Device B, while Student 2 remains
    await engineB.pullChanges();
    expect(await dbB.students.get(s1)).toBeUndefined();
    expect((await dbB.students.get(s2))?.nameKm).toBe('សិស្ស នៅសល់');
    expect(await dbB.holidays.get(holidayId)).toBeUndefined();

    // Device A deletes the class itself -> propagates to Device B
    await dbA.classes.delete(classId);
    await engineA.pushOutbox();
    await engineB.pullChanges();
    expect(await dbB.classes.get(classId)).toBeUndefined();
  });

  it('5. (Fix 1) concurrent teacher edits made while a pull is running still reach outbox and survive pull', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    // Seed initial class and 2 students on both devices
    const classId = await dbA.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    const s1 = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស ទី១ ដើម',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const s2 = await dbA.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'សិស្ស ទី២ ដើម',
      gender: 'ស្រី',
      dateOfBirth: '2013-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await engineA.pushOutbox();
    await engineB.pullChanges();

    // Device A modifies both students and adds scores, then pushes
    await dbA.students.update(s1, { nameKm: 'សិស្ស ទី១ ពី Cloud' });
    await dbA.students.update(s2, { nameKm: 'សិស្ស ទី២ ពី Cloud' });
    await dbA.monthlyScores.put({
      classId,
      studentRef: s1,
      month: '2026-11',
      scores: { math: 70 },
    });
    await engineA.pushOutbox();

    // Device B pulls while the teacher concurrently edits Student 1, enters Student 2's score,
    // and adds a holiday right in the middle of applying pulled documents
    let concurrentHolidayId = 0;
    await engineB.pullChanges({
      onBeforeApplyDoc: async (docId) => {
        if (docId === `students__${classId}`) {
          await dbB.students.update(s1, { nameKm: 'សិស្ស ទី១ (កែកំឡុងពេល Pull)' });
          await dbB.monthlyScores.put({
            classId,
            studentRef: s2,
            month: '2026-11',
            scores: { math: 96 },
          });
        }
      },
    });

    // Also verify true Promise.all concurrency while applyRemoteDocToDexie executes on dbB
    await Promise.all([
      applyRemoteDocToDexie(dbB, 'holidays', {
        kind: 'holidays',
        schemaVersion: 1,
        rows: {},
      }),
      (async () => {
        concurrentHolidayId = await dbB.holidays.add({
          date: '2026-12-10',
          label: 'ថ្ងៃបន្ថែមស្របពេល Pull',
        });
      })(),
    ]);

    // Every concurrent local edit MUST be in dbB.outbox and MUST NOT have been overwritten
    expect((await dbB.students.get(s1))?.nameKm).toBe('សិស្ស ទី១ (កែកំឡុងពេល Pull)');
    expect((await dbB.students.get(s2))?.nameKm).toBe('សិស្ស ទី២ ពី Cloud');
    expect((await dbB.monthlyScores.get([classId, '2026-11', s1]))?.scores.math).toBe(70);
    expect((await dbB.monthlyScores.get([classId, '2026-11', s2]))?.scores.math).toBe(96);

    expect(await dbB.outbox.get([`students__${classId}`, `s_${s1}`])).toBeDefined();
    expect(await dbB.outbox.get([`ms__${classId}__2026-11`, `m_${s2}`])).toBeDefined();
    expect(await dbB.outbox.get(['holidays', `h_${concurrentHolidayId}`])).toBeDefined();

    // Push from Device B -> Device A pulls and receives all concurrent edits
    await engineB.pushOutbox();
    await engineA.pullChanges();
    expect((await dbA.students.get(s1))?.nameKm).toBe('សិស្ស ទី១ (កែកំឡុងពេល Pull)');
    expect((await dbA.monthlyScores.get([classId, '2026-11', s2]))?.scores.math).toBe(96);
    expect((await dbA.holidays.get(concurrentHolidayId))?.label).toBe('ថ្ងៃបន្ថែមស្របពេល Pull');
  });

  it('6. (Fix 2) photo survives on a new device even when photo__<id> has older updatedAt than students__<classId>, and pending photo attaches when student arrives later', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    const classId = await dbA.classes.add({
      name: '8B',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 11, 22, 33, 44]);
    const photoBlob = new Blob([photoBytes], { type: 'image/jpeg' });
    const studentId = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស មានរូបថត',
      gender: 'ស្រី',
      dateOfBirth: '2013-06-15',
      photoBlob,
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    // Push 1: writes class__, students__, and photo__ (compressed at push time from pendingPhoto)
    await engineA.pushOutbox();
    expect(await dbA.outbox.count()).toBe(0);

    // Wait briefly, then update ONLY the student's name so students__<classId> gets a NEWER
    // serverTimestamp updatedAt than photo__<studentId>
    await new Promise((r) => setTimeout(r, 30));
    await dbA.students.update(studentId, { nameKm: 'សិស្ស មានរូបថត (កែឈ្មោះ)' });
    await engineA.pushOutbox();

    // Verify in Firestore that photo__<id> is strictly older than students__<classId>
    const photoSnap = await getDoc(doc(fsA, 'users', TEACHER_UID, 'docs', `photo__${studentId}`));
    const studentsSnap = await getDoc(
      doc(fsA, 'users', TEACHER_UID, 'docs', `students__${classId}`)
    );
    const photoMs = (photoSnap.data()?.updatedAt as Timestamp).toMillis();
    const studentsMs = (studentsSnap.data()?.updatedAt as Timestamp).toMillis();
    expect(photoMs).toBeLessThan(studentsMs);

    // Part A: Brand-new Device B pulls everything -> class -> students -> photo order preserves photo!
    await engineB.pullChanges();
    const bStudent = await dbB.students.get(studentId);
    expect(bStudent?.nameKm).toBe('សិស្ស មានរូបថត (កែឈ្មោះ)');
    expect(bStudent?.photoBlob).toBeDefined();
    const bBytes = new Uint8Array(await bStudent!.photoBlob!.arrayBuffer());
    expect(Array.from(bBytes)).toEqual(Array.from(photoBytes));
    expect(await dbB.outbox.count()).toBe(0);

    // Part B: Brand-new Device C receives photo__<id> BEFORE students__<classId> arrives ->
    // photo is held in syncPendingPhotos and attached as soon as students__<classId> is applied!
    const dbC = new KruDeskDatabase(`KruDeskDB_emu_C_${Date.now()}`);
    await dbC.open();
    await clearAllAppData(dbC);
    try {
      await applyRemoteDocToDexie(
        dbC,
        `photo__${studentId}`,
        photoSnap.data() as Record<string, unknown>
      );
      expect(await dbC.students.get(studentId)).toBeUndefined();
      const pendingSetting = await dbC.settings.get(SYNC_PENDING_PHOTOS_KEY);
      expect(
        (pendingSetting?.value as Record<string, unknown>)?.[String(studentId)]
      ).toBeDefined();

      // Later, students__<classId> arrives on Device C -> pending photo attaches automatically
      await applyRemoteDocToDexie(
        dbC,
        `students__${classId}`,
        studentsSnap.data() as Record<string, unknown>
      );
      const cStudent = await dbC.students.get(studentId);
      expect(cStudent?.photoBlob).toBeDefined();
      const cBytes = new Uint8Array(await cStudent!.photoBlob!.arrayBuffer());
      expect(Array.from(cBytes)).toEqual(Array.from(photoBytes));
      expect(await dbC.settings.get(SYNC_PENDING_PHOTOS_KEY)).toBeUndefined();
    } finally {
      await clearAllAppData(dbC);
      dbC.close();
    }
  });

  it('7. (Fix 4) writes tombstones instead of deleteField, deletes locally only on tombstones, and self-heals local rows missing in cloud without a tombstone', async () => {
    const fsA = getTeacherFirestore('DeviceA');
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    const classId = await dbA.classes.add({
      name: '9B',
      gradeLevel: 9,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    const s1 = await dbA.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស ត្រូវលុប',
      gender: 'ប្រុស',
      dateOfBirth: '2012-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const s2 = await dbA.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'សិស្ស នៅសល់',
      gender: 'ស្រី',
      dateOfBirth: '2012-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await dbA.monthlyScores.put({
      classId,
      studentRef: s2,
      month: '2026-11',
      scores: { math: 80 },
    });
    await engineA.pushOutbox();
    await engineB.pullChanges();

    // Part A: Device A deletes s1 -> Firestore stores tombstone { __deleted: true, ts } (NOT deleteField)
    await dbA.students.delete(s1);
    await engineA.pushOutbox();

    const studentsSnap = await getDoc(
      doc(fsA, 'users', TEACHER_UID, 'docs', `students__${classId}`)
    );
    const rowsMap = studentsSnap.data()?.rows as Record<string, unknown>;
    expect(rowsMap[`s_${s1}`]).toEqual({
      __deleted: true,
      ts: expect.any(Number),
    });

    // Part B: Simulate two local rows on Device B that are missing from Cloud WITHOUT tombstones
    // and NOT in Device B's outbox (e.g. recovered local data)
    const sLocalOnlyId = 888777666;
    await dbB.runRemoteTransaction([dbB.students, dbB.monthlyScores], async () => {
      await dbB.students.put({
        id: sLocalOnlyId,
        classId,
        order: 3,
        studentId: 'S999',
        nameKm: 'សិស្សក្នុងម៉ាស៊ីនត្រូវ Self-Heal',
        gender: 'ប្រុស',
        dateOfBirth: '2012-03-03',
        status: 'active',
        createdAt: 1732000000000,
        updatedAt: 1732000000000,
      });
      await dbB.monthlyScores.put({
        classId,
        studentRef: sLocalOnlyId,
        month: '2026-11',
        scores: { math: 99 },
      });
    });
    expect(await dbB.outbox.count()).toBe(0);

    // Device A also updates s2's monthly score so Device B pulls BOTH students__ and ms__ docs
    await dbA.monthlyScores.put({
      classId,
      studentRef: s2,
      month: '2026-11',
      scores: { math: 82 },
    });
    await engineA.pushOutbox();

    // Device B pulls:
    // - s1 IS deleted (because Cloud has a tombstone for s1)
    // - sLocalOnlyId and its monthly score are NOT deleted (no tombstone!) and ARE re-queued into outbox!
    const pullRes = await engineB.pullChanges();
    expect(await dbB.students.get(s1)).toBeUndefined();
    expect((await dbB.students.get(sLocalOnlyId))?.nameKm).toBe(
      'សិស្សក្នុងម៉ាស៊ីនត្រូវ Self-Heal'
    );
    expect((await dbB.monthlyScores.get([classId, '2026-11', sLocalOnlyId]))?.scores.math).toBe(
      99
    );
    expect(pullRes.requeuedCount).toBe(2);
    expect(await dbB.outbox.get([`students__${classId}`, `s_${sLocalOnlyId}`])).toBeDefined();
    expect(await dbB.outbox.get([`ms__${classId}__2026-11`, `m_${sLocalOnlyId}`])).toBeDefined();

    // Self-healed rows push from Device B -> appear on Device A!
    await engineB.pushOutbox();
    await engineA.pullChanges();
    expect((await dbA.students.get(sLocalOnlyId))?.nameKm).toBe(
      'សិស្សក្នុងម៉ាស៊ីនត្រូវ Self-Heal'
    );
    expect((await dbA.monthlyScores.get([classId, '2026-11', sLocalOnlyId]))?.scores.math).toBe(
      99
    );
  });

  it('8. (Fix 5) oversized doc is kept in outbox with a Khmer error without blocking other docs, and whole-doc size is checked', async () => {
    const errors: string[] = [];
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
      onError: (msg) => errors.push(msg),
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    // Normal class + student alongside an oversized setting (> 900 KB)
    const classId = await dbA.classes.add({
      name: '11A',
      gradeLevel: 11,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    await dbA.settings.put({
      key: 'certificateBorder',
      value: { imageDataUrl: 'X'.repeat(950 * 1024) },
    });

    // Multi-row doc whose FIRST row is 500 KB (pushed OK), then SECOND row is 450 KB -> combined > 900 KB
    await dbA.monthlyScores.put({
      classId,
      studentRef: 1,
      month: '2026-11',
      scores: { math: 80 },
      note: 'A'.repeat(500 * 1024),
    });

    const firstPush = await engineA.pushOutbox();
    expect(firstPush.skippedOversizedDocIds).toEqual(['settings__certificateBorder']);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toContain('900 KB');

    // Oversized setting entry is STILL kept in outbox (NOT silently dropped!)
    expect(await dbA.outbox.get(['settings__certificateBorder', 'v'])).toBeDefined();

    // Normal class & first 500 KB score WERE NOT blocked and arrived on Device B!
    await engineB.pullChanges();
    expect((await dbB.classes.get(classId))?.name).toBe('11A');
    expect((await dbB.monthlyScores.get([classId, '2026-11', 1]))?.scores.math).toBe(80);

    // Adding a second 450 KB row to the same ms__ doc pushes WHOLE doc over 900 KB (even though new row alone is 450 KB)
    await dbA.monthlyScores.put({
      classId,
      studentRef: 2,
      month: '2026-11',
      scores: { math: 85 },
      note: 'B'.repeat(450 * 1024),
    });
    const secondPush = await engineA.pushOutbox();
    expect(secondPush.skippedOversizedDocIds).toContain(`ms__${classId}__2026-11`);
    expect(await dbA.outbox.get([`ms__${classId}__2026-11`, 'm_2'])).toBeDefined();

    // Once the teacher shrinks the oversized setting, it syncs cleanly to Device B
    await dbA.settings.put({ key: 'certificateBorder', value: { presetId: 'orange_kbach' } });
    await dbA.monthlyScores.put({
      classId,
      studentRef: 2,
      month: '2026-11',
      scores: { math: 85 },
      note: 'short',
    });
    const thirdPush = await engineA.pushOutbox();
    expect(thirdPush.skippedOversizedDocIds).toEqual([]);
    expect(await dbA.outbox.count()).toBe(0);

    await engineB.pullChanges();
    expect(
      ((await dbB.settings.get('certificateBorder'))?.value as { presetId?: string })?.presetId
    ).toBe('orange_kbach');
    expect((await dbB.monthlyScores.get([classId, '2026-11', 2]))?.note).toBe('short');
  });

  it('9. (Fix 6) restoreBackupPayload replace and clearAllAppData(syncToCloud) sync as a full replace across devices', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    // Seed initial data on Device A and sync to Device B
    const oldClassId = await dbA.classes.add({
      name: 'ថ្នាក់ចាស់ 7A',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const oldHolidayId = await dbA.holidays.add({
      date: '2026-11-09',
      label: 'បុណ្យចាស់',
    });
    await engineA.pushOutbox();
    await engineB.pullChanges();
    expect((await dbB.classes.get(oldClassId))?.name).toBe('ថ្នាក់ចាស់ 7A');
    expect((await dbB.holidays.get(oldHolidayId))?.label).toBe('បុណ្យចាស់');

    // Device A restores a backup in 'replace' mode -> clears old tables and inserts new data
    const backupPayload: KruDeskBackupPayload = {
      appName: 'KruDesk',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: 1732100000000,
      data: {
        settings: [{ key: 'documentPlace', value: 'សៀមរាប' }],
        classes: [
          {
            id: 1,
            name: 'ថ្នាក់ថ្មី 8C',
            gradeLevel: 8,
            academicYear: '2026-2027',
            color: '#34c759',
            subjects: [],
            createdAt: 1732100000000,
          },
        ],
        students: [
          {
            id: 10,
            classId: 1,
            order: 1,
            studentId: 'N001',
            nameKm: 'សិស្សពី Backup',
            gender: 'ស្រី',
            dateOfBirth: '2013-07-07',
            status: 'active',
            createdAt: 1732100000000,
            updatedAt: 1732100000000,
          },
        ],
        attendance: [],
        attendanceSessions: [],
        holidays: [],
        monthlyScores: [],
        semesterExams: [],
        templates: [],
      },
    };

    await restoreBackupPayload(backupPayload, 'replace', dbA);
    await engineA.pushOutbox();

    // Device B pulls -> old class & holiday are tombstoned/deleted, new backup class & student appear!
    await engineB.pullChanges();
    expect(await dbB.classes.get(oldClassId)).toBeUndefined();
    expect(await dbB.holidays.get(oldHolidayId)).toBeUndefined();
    const bClasses = await dbB.classes.toArray();
    expect(bClasses).toHaveLength(1);
    expect(bClasses[0]?.name).toBe('ថ្នាក់ថ្មី 8C');
    const bStudents = await dbB.students.toArray();
    expect(bStudents).toHaveLength(1);
    expect(bStudents[0]?.nameKm).toBe('សិស្សពី Backup');
    expect((await dbB.settings.get('documentPlace'))?.value).toBe('សៀមរាប');

    // Device A runs «លុបទិន្នន័យទាំងអស់» (clearAllAppData with syncToCloud: true) -> wipes Device B too!
    await clearAllAppData(dbA, { syncToCloud: true });
    await engineA.pushOutbox();
    await engineB.pullChanges();
    expect(await dbB.classes.count()).toBe(0);
    expect(await dbB.students.count()).toBe(0);
    expect(await dbB.settings.get('documentPlace')).toBeUndefined();
  });

  it('10. (Fix A) one unreadable/corrupted photoBlob stays in outbox with a Khmer error and does NOT block other docs or the student row itself', async () => {
    const errors: string[] = [];
    const fsA = getTeacherFirestore('DeviceA');
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: fsA,
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
      onError: (msg) => errors.push(msg),
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    const class1Id = await dbA.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const class2Id = await dbA.classes.add({
      name: '8B',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#34c759',
      subjects: [],
      createdAt: 1732000000000,
    });

    // Student 1 has an unreadable/corrupted photoBlob ({}), Student 2 has a valid photoBlob
    const student1Id = await dbA.students.add({
      classId: class1Id,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស រូបខូច',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      photoBlob: {} as unknown as Blob,
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const validPhotoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 8, 9]);
    const student2Id = await dbA.students.add({
      classId: class2Id,
      order: 1,
      studentId: 'S002',
      nameKm: 'សិស្ស រូបល្អ',
      gender: 'ស្រី',
      dateOfBirth: '2013-02-02',
      photoBlob: new Blob([validPhotoBytes], { type: 'image/jpeg' }),
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    // Push must NOT throw; all other docs + student1 row itself + student2 photo MUST push!
    const pushRes = await engineA.pushOutbox();
    expect(pushRes.failedPhotoDocIds).toEqual([`photo__${student1Id}`]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('មិនអាចបញ្ជូនរូបថតសិស្សខ្លះទៅ Cloud បានទេ');

    // Failed photo entry STAYS in outbox (neither dropped nor tombstoned in Cloud!)
    const remainingOutbox = await dbA.outbox.toArray();
    expect(remainingOutbox).toHaveLength(1);
    expect(remainingOutbox[0]?.docId).toBe(`photo__${student1Id}`);
    const badPhotoSnap = await getDoc(doc(fsA, 'users', TEACHER_UID, 'docs', `photo__${student1Id}`));
    expect(badPhotoSnap.exists()).toBe(false);

    // Device B pulls -> receives BOTH classes, Student 1's row, Student 2's row, and Student 2's valid photo!
    await engineB.pullChanges();
    expect((await dbB.classes.get(class1Id))?.name).toBe('8A');
    expect((await dbB.classes.get(class2Id))?.name).toBe('8B');
    expect((await dbB.students.get(student1Id))?.nameKm).toBe('សិស្ស រូបខូច');
    const bStudent2 = await dbB.students.get(student2Id);
    expect(bStudent2?.nameKm).toBe('សិស្ស រូបល្អ');
    expect(bStudent2?.photoBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await bStudent2!.photoBlob!.arrayBuffer()))).toEqual(
      Array.from(validPhotoBytes)
    );

    // Once the teacher replaces Student 1's photo with a valid Blob, it pushes cleanly
    const fixedPhotoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 99, 88, 77]);
    await dbA.students.update(student1Id, {
      photoBlob: new Blob([fixedPhotoBytes], { type: 'image/jpeg' }),
    });
    const retryRes = await engineA.pushOutbox();
    expect(retryRes.failedPhotoDocIds).toEqual([]);
    expect(await dbA.outbox.count()).toBe(0);

    await engineB.pullChanges();
    const bStudent1Fixed = await dbB.students.get(student1Id);
    expect(bStudent1Fixed?.photoBlob).toBeDefined();
    expect(Array.from(new Uint8Array(await bStudent1Fixed!.photoBlob!.arrayBuffer()))).toEqual(
      Array.from(fixedPhotoBytes)
    );
  });

  it('11. (Fix B) single-flight lock serializes concurrent pushOutbox, pullChanges, and syncNow calls cleanly', async () => {
    const engineA = new SyncEngine({
      localDb: dbA,
      firestore: getTeacherFirestore('DeviceA'),
      uid: TEACHER_UID,
      deviceId: 'device-A',
      requireInitialDone: false,
    });
    const engineB = new SyncEngine({
      localDb: dbB,
      firestore: getTeacherFirestore('DeviceB'),
      uid: TEACHER_UID,
      deviceId: 'device-B',
      requireInitialDone: false,
    });

    const classId = await dbA.classes.add({
      name: '12A',
      gradeLevel: 12,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });

    // Fire multiple sync operations concurrently on Device A -> must serialize without error
    await Promise.all([
      engineA.pushOutbox(),
      engineA.syncNow(),
      engineA.pullChanges(),
      engineA.syncNow(),
    ]);
    expect(await dbA.outbox.count()).toBe(0);

    // Fire concurrent pulls/syncs on Device B -> must converge cleanly
    await Promise.all([engineB.pullChanges(), engineB.syncNow(), engineB.pullChanges()]);
    expect((await dbB.classes.get(classId))?.name).toBe('12A');
    expect(await dbB.outbox.count()).toBe(0);
  });
});
