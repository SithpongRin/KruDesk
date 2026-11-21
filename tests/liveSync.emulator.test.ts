// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, setLogLevel, Timestamp, type Firestore } from 'firebase/firestore';
import { clearAllAppData, KruDeskDatabase } from '../src/db/database';
import { SyncEngine } from '../src/services/sync/syncEngine';

const PROJECT_ID = 'demo-krudesk';
const TEACHER_UID = 'teacher-live-uid';
const TEACHER_EMAIL = 'teacher.live@example.com';
const OTHER_UID = 'other-live-uid';
const OTHER_EMAIL = 'other.live@example.com';
const PENDING_UID = 'pending-live-uid';
const PENDING_EMAIL = 'pending.live@example.com';

let testEnv: RulesTestEnvironment;
const openDbs: KruDeskDatabase[] = [];
const engines: SyncEngine[] = [];

function fsFor(uid: string, email: string, label: string): Firestore {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      name: label,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore() as unknown as Firestore;
}

async function device(label: string, opts: { requireInitialDone?: boolean } = {}) {
  const db = new KruDeskDatabase(`KruDeskDB_live_${label}_${Date.now()}_${Math.random()}`);
  await db.open();
  await clearAllAppData(db);
  openDbs.push(db);
  const engine = new SyncEngine({
    localDb: db,
    firestore: fsFor(TEACHER_UID, TEACHER_EMAIL, label),
    uid: TEACHER_UID,
    deviceId: label,
    debounceMs: 50,
    requireInitialDone: opts.requireInitialDone ?? false,
    liveUpdates: true,
    fallbackPullIntervalMs: 0, // only the marker listener in these tests
  });
  engines.push(engine);
  return { db, engine };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const baseClass = {
  gradeLevel: 8,
  academicYear: '2026-2027',
  color: '#0071e3',
  subjects: [],
  createdAt: 1732000000000,
};

describe('Live sync via users/{uid}/sync/marker (onSnapshot on one doc)', () => {
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
      const fs = ctx.firestore();
      await setDoc(doc(fs, 'config', 'admin'), { email: 'admin@example.com' });
      for (const [uid, email, status] of [
        [TEACHER_UID, TEACHER_EMAIL, 'approved'],
        [OTHER_UID, OTHER_EMAIL, 'approved'],
        [PENDING_UID, PENDING_EMAIL, 'pending'],
      ] as const) {
        await setDoc(doc(fs, 'users', uid), {
          email,
          displayName: null,
          photoURL: null,
          status,
          createdAt: Timestamp.now(),
        });
      }
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

  it('1. A pushes -> B receives it WITHOUT calling pullChanges (both devices open)', async () => {
    const A = await device('A');
    const B = await device('B');
    await A.engine.start({ skipInitialSync: true });
    await B.engine.start({ skipInitialSync: true });
    expect(A.engine.isLiveUpdatesActive()).toBe(true);
    expect(B.engine.isLiveUpdatesActive()).toBe(true);

    const classId = await A.db.classes.add({ ...baseClass, name: '8A' });
    await A.engine.pushOutbox();
    expect(await waitFor(async () => (await B.db.classes.get(classId))?.name === '8A')).toBe(true);

    // A later edit also arrives live
    await A.db.classes.update(classId, { name: '8A (កែ)' });
    await A.engine.pushOutbox();
    expect(
      await waitFor(async () => (await B.db.classes.get(classId))?.name === '8A (កែ)')
    ).toBe(true);

    // And the other way round: B edits -> A receives
    await B.db.classes.update(classId, { name: '8A (កែលើ B)' });
    await B.engine.pushOutbox();
    expect(
      await waitFor(async () => (await A.db.classes.get(classId))?.name === '8A (កែលើ B)')
    ).toBe(true);
  }, 40_000);

  it('2. a device does not re-pull because of its OWN push (no loop)', async () => {
    const A = await device('A');
    const B = await device('B');
    await A.engine.start({ skipInitialSync: true });
    await B.engine.start({ skipInitialSync: true });
    await new Promise((r) => setTimeout(r, 500)); // initial marker snapshots settle

    const pullSpyA = vi.spyOn(A.engine, 'pullChanges');
    const pullSpyB = vi.spyOn(B.engine, 'pullChanges');
    await A.db.classes.add({ ...baseClass, name: '9A' });
    await A.engine.pushOutbox();
    expect(await waitFor(async () => pullSpyB.mock.calls.length >= 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(pullSpyA).not.toHaveBeenCalled();
    expect(pullSpyB.mock.calls.length).toBe(1);
  }, 30_000);

  it('3. stop() removes the listener: later pushes are not pulled live', async () => {
    const A = await device('A');
    const B = await device('B');
    await A.engine.start({ skipInitialSync: true });
    await B.engine.start({ skipInitialSync: true });
    B.engine.stop();
    expect(B.engine.isLiveUpdatesActive()).toBe(false);

    const classId = await A.db.classes.add({ ...baseClass, name: '7A' });
    await A.engine.pushOutbox();
    await new Promise((r) => setTimeout(r, 2000));
    expect(await B.db.classes.get(classId)).toBeUndefined();
  }, 30_000);

  it('4. no live listener before the first sign-in decision (requireInitialDone)', async () => {
    const B = await device('B', { requireInitialDone: true });
    await B.engine.start({ skipInitialSync: true });
    expect(B.engine.isLiveUpdatesActive()).toBe(false);
  });

  it('5. rules: only the approved owner can read/write users/{uid}/sync/marker', async () => {
    const owner = fsFor(TEACHER_UID, TEACHER_EMAIL, 'owner');
    const other = fsFor(OTHER_UID, OTHER_EMAIL, 'other');
    const pending = fsFor(PENDING_UID, PENDING_EMAIL, 'pending');
    const unauth = testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
    const ref = (fs: Firestore, uid: string) => doc(fs, 'users', uid, 'sync', 'marker');

    await assertSucceeds(setDoc(ref(owner, TEACHER_UID), { updatedBy: 'x' }));
    await assertSucceeds(getDoc(ref(owner, TEACHER_UID)));
    await assertFails(getDoc(ref(other, TEACHER_UID)));
    await assertFails(setDoc(ref(other, TEACHER_UID), { updatedBy: 'y' }));
    await assertFails(setDoc(ref(pending, PENDING_UID), { updatedBy: 'z' }));
    await assertFails(getDoc(ref(unauth, TEACHER_UID)));
  });
});
