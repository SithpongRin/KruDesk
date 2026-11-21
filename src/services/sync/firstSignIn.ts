import { collection, getDocs, limit, query, type Firestore } from 'firebase/firestore';
import { clearAllAppData, type KruDeskDatabase } from '../../db/database';
import { buildBackupPayload, downloadBackupJson } from '../backup';
import {
  saveBackupPayloadToCloudSnapshot,
  saveCloudSnapshotFromCloudDocs,
  type CloudSnapshotMeta,
} from './cloudSnapshot';
import { SYNC_INITIAL_DONE_KEY } from './syncCodec';
import type { SyncEngine } from './syncEngine';

export type FirstSignInAction =
  | 'already_done'
  | 'none_needed'
  | 'pull_from_cloud'
  | 'upload_to_cloud'
  | 'ask_conflict';

export type FirstSignInConflictChoice = 'cloud' | 'device';

export interface FirstSignInDecisionInput {
  initialDone: boolean;
  cloudHasData: boolean;
  deviceHasData: boolean;
}

/**
 * Pure decision function for first sign-in on a device (§1.6):
 * - Already completed on this account DB -> `already_done`
 * - Both empty -> `none_needed`
 * - Cloud has data, device empty -> `pull_from_cloud`
 * - Cloud empty, device has data -> `upload_to_cloud`
 * - Both have data -> `ask_conflict` (Replace, not merge, after saving safety backups)
 */
export function decideFirstSignInAction(input: FirstSignInDecisionInput): FirstSignInAction {
  if (input.initialDone) return 'already_done';
  if (!input.cloudHasData && !input.deviceHasData) return 'none_needed';
  if (input.cloudHasData && !input.deviceHasData) return 'pull_from_cloud';
  if (!input.cloudHasData && input.deviceHasData) return 'upload_to_cloud';
  return 'ask_conflict';
}

export async function isInitialSyncDone(localDb: KruDeskDatabase): Promise<boolean> {
  const row = await localDb.settings.get(SYNC_INITIAL_DONE_KEY);
  return row?.value === true;
}

export async function markInitialSyncDone(localDb: KruDeskDatabase): Promise<void> {
  await localDb.runRemoteTransaction([localDb.settings], async () => {
    await localDb.settings.put({ key: SYNC_INITIAL_DONE_KEY, value: true });
  });
}

/**
 * Cheap cloud check: ONE query with `limit(1)` on `users/{uid}/docs` (§1.6 / Step 4c).
 */
export async function checkCloudHasData(firestore: Firestore, uid: string): Promise<boolean> {
  const snap = await getDocs(query(collection(firestore, 'users', uid, 'docs'), limit(1)));
  return !snap.empty;
}

/**
 * Checks whether this account's local Dexie DB already contains any teacher/school data
 * (ignores device-only preferences and internal sync settings).
 */
export async function checkDeviceHasData(localDb: KruDeskDatabase): Promise<boolean> {
  const [
    classCount,
    studentCount,
    holidayCount,
    attCount,
    sessionCount,
    scoreCount,
    examCount,
    templateCount,
    profileRow,
  ] = await Promise.all([
    localDb.classes.count(),
    localDb.students.count(),
    localDb.holidays.count(),
    localDb.attendance.count(),
    localDb.attendanceSessions.count(),
    localDb.monthlyScores.count(),
    localDb.semesterExams.count(),
    localDb.templates.count(),
    localDb.settings.get('profile'),
  ]);

  if (
    classCount > 0 ||
    studentCount > 0 ||
    holidayCount > 0 ||
    attCount > 0 ||
    sessionCount > 0 ||
    scoreCount > 0 ||
    examCount > 0 ||
    templateCount > 0
  ) {
    return true;
  }

  const prof = profileRow?.value as { teacherName?: string; schoolName?: string } | undefined;
  return Boolean(prof?.teacherName?.trim() || prof?.schoolName?.trim());
}

export interface RunFirstSignInOptions {
  localDb: KruDeskDatabase;
  firestore: Firestore;
  uid: string;
  engine: SyncEngine;
  onPhaseChange?: (phase: 'checking' | 'pulling' | 'uploading' | 'conflict' | 'done') => void;
  /** Returns true if this attempt was cancelled/deferred by the user (e.g. after 20s timeout). */
  isCancelled?: () => boolean;
}

/**
 * Executes automatic first sign-in flow when unambiguous (empty+empty, cloud-only, device-only).
 * Returns `'ask_conflict'` without mutating either side when both device and cloud have data.
 */
export async function runFirstSignInFlow(
  options: RunFirstSignInOptions
): Promise<FirstSignInAction | 'cancelled'> {
  const { localDb, firestore, uid, engine, onPhaseChange, isCancelled } = options;

  const initialDone = await isInitialSyncDone(localDb);
  if (isCancelled?.()) return 'cancelled';
  if (initialDone) {
    onPhaseChange?.('done');
    return 'already_done';
  }

  onPhaseChange?.('checking');
  const [cloudHasData, deviceHasData] = await Promise.all([
    checkCloudHasData(firestore, uid),
    checkDeviceHasData(localDb),
  ]);
  if (isCancelled?.()) return 'cancelled';

  const action = decideFirstSignInAction({
    initialDone: false,
    cloudHasData,
    deviceHasData,
  });

  if (action === 'none_needed') {
    await markInitialSyncDone(localDb);
    onPhaseChange?.('done');
    return action;
  }

  if (action === 'pull_from_cloud') {
    onPhaseChange?.('pulling');
    await engine.pullChanges({ forceAll: true, bypassInitialSyncGuard: true });
    // Pull completed without error -> mark syncInitialDone even if the UI attempt was deferred
    // while pulling, so a subsequent retry never sees cloud-pulled rows as a false conflict!
    if (localDb.isOpen()) {
      await markInitialSyncDone(localDb);
    }
    if (!isCancelled?.()) {
      onPhaseChange?.('done');
    }
    return action;
  }

  if (action === 'upload_to_cloud') {
    onPhaseChange?.('uploading');
    // Use pushFullReplace so rows created before the outbox existed are uploaded too
    await engine.pushFullReplace({ bypassInitialSyncGuard: true });
    // Upload completed without error -> mark syncInitialDone even if the UI attempt was deferred!
    if (localDb.isOpen()) {
      await markInitialSyncDone(localDb);
    }
    if (!isCancelled?.()) {
      onPhaseChange?.('done');
    }
    return action;
  }

  onPhaseChange?.('conflict');
  return 'ask_conflict';
}

export interface ResolveConflictOptions {
  choice: FirstSignInConflictChoice;
  localDb: KruDeskDatabase;
  firestore: Firestore;
  uid: string;
  engine: SyncEngine;
  /**
   * Optional override for the extra local browser JSON download (defaults to `downloadBackupJson()`).
   * Note: the durable safety backups are BOTH Cloud snapshots (`pre-replace-device` + `pre-replace-cloud`),
   * which MUST succeed before anything is replaced.
   */
  downloadDeviceBackup?: () => Promise<unknown>;
  /** Optional test hook to inject/override saving the device snapshot. */
  saveDeviceSnapshot?: (
    firestore: Firestore,
    uid: string,
    payload: Awaited<ReturnType<typeof buildBackupPayload>>
  ) => Promise<CloudSnapshotMeta>;
  /** Optional test hook to inject/override saving the cloud snapshot. */
  saveCloudSnapshot?: (firestore: Firestore, uid: string) => Promise<CloudSnapshotMeta>;
}

export interface ResolveConflictResult {
  choice: FirstSignInConflictChoice;
  deviceSnapshot: CloudSnapshotMeta;
  cloudSnapshot: CloudSnapshotMeta;
  deviceBackupResult: unknown;
}

/**
 * Resolves a both-have-data first sign-in conflict via REPLACE (teacher's decision §1.6):
 * 1. Saves BOTH durable snapshots to `users/{uid}/backups` FIRST:
 *    - `pre-replace-device`: full payload of this device's local Dexie data
 *    - `pre-replace-cloud`: full payload of the current Cloud `users/{uid}/docs` data
 *    If EITHER snapshot fails, throws immediately and touches NEITHER device NOR cloud data.
 * 2. Triggers the browser JSON backup download as an extra local safety copy (best-effort on iOS PWA).
 * 3. Replaces the chosen target (passing explicit `bypassInitialSyncGuard: true`):
 *    - `'cloud'` (default): clear local (no outbox) + `pullChanges({ forceAll: true })`
 *    - `'device'`: `pushFullReplace()`
 * 4. Marks `syncInitialDone = true`.
 */
export async function resolveFirstSignInConflict(
  options: ResolveConflictOptions
): Promise<ResolveConflictResult> {
  const { choice, localDb, firestore, uid, engine } = options;
  const doSaveDeviceSnapshot =
    options.saveDeviceSnapshot ??
    ((fs, u, payload) => saveBackupPayloadToCloudSnapshot(fs, u, payload, 'pre-replace-device'));
  const doSaveCloudSnapshot =
    options.saveCloudSnapshot ??
    ((fs, u) => saveCloudSnapshotFromCloudDocs(fs, u, 'pre-replace-cloud'));
  const doDownloadDeviceBackup = options.downloadDeviceBackup ?? (() => downloadBackupJson());

  // 1. Mandatory durable snapshots in `users/{uid}/backups` BEFORE touching either side!
  const devicePayload = await buildBackupPayload(Date.now(), localDb);
  const deviceSnapshot = await doSaveDeviceSnapshot(firestore, uid, devicePayload);
  const cloudSnapshot = await doSaveCloudSnapshot(firestore, uid);

  // 2. Extra browser JSON download (best-effort so iOS standalone PWA quirks never block after
  //    both durable cloud snapshots are already confirmed saved)
  let deviceBackupResult: unknown = null;
  try {
    deviceBackupResult = await doDownloadDeviceBackup();
  } catch (err) {
    console.warn('[FirstSignIn] Extra browser JSON download failed (cloud snapshots are saved):', err);
  }

  // 3. Execute full replacement according to teacher's choice
  if (choice === 'cloud') {
    await clearAllAppData(localDb);
    await engine.pullChanges({ forceAll: true, bypassInitialSyncGuard: true });
  } else {
    await engine.pushFullReplace({ bypassInitialSyncGuard: true });
  }

  // 4. Mark initial sync complete on this account DB
  await markInitialSyncDone(localDb);

  return {
    choice,
    deviceSnapshot,
    cloudSnapshot,
    deviceBackupResult,
  };
}
