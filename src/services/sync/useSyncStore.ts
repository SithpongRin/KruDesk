import { create } from 'zustand';
import type { Firestore } from 'firebase/firestore';
import { db, getUserDbName, type KruDeskDatabase } from '../../db/database';
import { getFirebaseServices, isFirebaseConfigured } from '../firebase/client';
import { useAppStore } from '../../store/useAppStore';
import { SYNC_INITIAL_DONE_KEY } from './syncCodec';
import type { FirstSignInConflictChoice } from './firstSignIn';
import type { SyncEngine, SyncStatusSnapshot } from './syncEngine';

export const FIRST_SIGN_IN_SLOW_TIMEOUT_MS = 20_000;

export type FirstSignInPhase =
  | 'idle'
  | 'checking'
  | 'pulling'
  | 'uploading'
  | 'conflict'
  | 'resolving'
  | 'awaiting-first-sync'
  | 'done';

export interface FirstSignInConflictSummary {
  deviceClassesCount: number;
  deviceStudentsCount: number;
}

interface SyncStoreState {
  enabled: boolean;
  uid: string | null;
  status: SyncStatusSnapshot;
  firstSignInPhase: FirstSignInPhase;
  firstSignInSlow: boolean;
  conflictSummary: FirstSignInConflictSummary | null;
  conflictError: string | null;
  errorDismissed: boolean;

  resolveConflict: (choice: FirstSignInConflictChoice) => Promise<void>;
  retryFirstSignIn: () => Promise<void>;
  deferFirstSignInToLocal: () => void;
  triggerManualSync: () => Promise<void>;
  dismissError: () => void;
}

const DEFAULT_STATUS: SyncStatusSnapshot = {
  state: 'synced',
  pendingCount: 0,
  lastSyncedAt: null,
  errorMessage: null,
};

let activeEngine: SyncEngine | null = null;
let activeSyncUid: string | null = null;
let activeLocalDb: KruDeskDatabase | null = null;
let activeFirestore: Firestore | null = null;
let windowCleanup: (() => void) | null = null;
let slowTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let sessionToken = 0;
let attemptToken = 0;
let lastAwaitingFocusRetryAt = 0;

export function getActiveSyncEngine(): SyncEngine | null {
  return activeEngine;
}

function clearSlowTimer(): void {
  if (slowTimeoutTimer) {
    clearTimeout(slowTimeoutTimer);
    slowTimeoutTimer = null;
  }
}

function armSlowTimer(mySession: number, myAttempt: number): void {
  clearSlowTimer();
  slowTimeoutTimer = setTimeout(() => {
    slowTimeoutTimer = null;
    if (mySession !== sessionToken || myAttempt !== attemptToken) return;
    const phase = useSyncStore.getState().firstSignInPhase;
    if (phase === 'checking' || phase === 'pulling' || phase === 'uploading') {
      useSyncStore.setState({ firstSignInSlow: true });
    }
  }, FIRST_SIGN_IN_SLOW_TIMEOUT_MS);
}

/**
 * Synchronously stops the active SyncEngine (clearing debounce timers, slow timers,
 * and window listeners). MUST be called BEFORE `closeUserDb()` on sign-out, revocation,
 * or account switch so no pending timer can ever push to an old uid/db.
 */
export function stopSyncEngine(): void {
  sessionToken += 1;
  attemptToken += 1;
  clearSlowTimer();
  lastAwaitingFocusRetryAt = 0;

  if (activeEngine) {
    activeEngine.stop();
    activeEngine = null;
  }
  if (windowCleanup) {
    windowCleanup();
    windowCleanup = null;
  }

  activeSyncUid = null;
  activeLocalDb = null;
  activeFirestore = null;

  useSyncStore.setState({
    enabled: false,
    uid: null,
    status: { ...DEFAULT_STATUS },
    firstSignInPhase: 'idle',
    firstSignInSlow: false,
    conflictSummary: null,
    conflictError: null,
    errorDismissed: false,
  });
}

async function attemptFirstSignIn(
  engine: SyncEngine,
  targetDb: KruDeskDatabase,
  firestore: Firestore,
  uid: string,
  mySession: number
): Promise<void> {
  const myAttempt = ++attemptToken;
  const isSessionAlive = () => mySession === sessionToken && targetDb.isOpen();
  const isCancelled = () => !isSessionAlive() || myAttempt !== attemptToken;

  try {
    const { isInitialSyncDone, runFirstSignInFlow } = await import('./firstSignIn');
    if (isCancelled()) return;

    const doneAlready = await isInitialSyncDone(targetDb);
    if (isCancelled()) return;

    if (doneAlready) {
      clearSlowTimer();
      useSyncStore.setState({ firstSignInPhase: 'done', firstSignInSlow: false });
      await engine.start();
      return;
    }

    // While offline, stay in 'awaiting-first-sync' (NEVER 'done', NEVER call syncNow)
    if (engine.isOffline()) {
      clearSlowTimer();
      useSyncStore.setState({
        firstSignInPhase: 'awaiting-first-sync',
        firstSignInSlow: false,
      });
      await engine.start({ skipInitialSync: true });
      return;
    }

    useSyncStore.setState({ firstSignInPhase: 'checking', firstSignInSlow: false });
    armSlowTimer(mySession, myAttempt);

    const action = await runFirstSignInFlow({
      localDb: targetDb,
      firestore,
      uid,
      engine,
      isCancelled,
      onPhaseChange: (phase) => {
        if (isCancelled()) return;
        if (phase === 'checking' || phase === 'pulling' || phase === 'uploading') {
          useSyncStore.setState({ firstSignInPhase: phase });
        } else {
          clearSlowTimer();
          useSyncStore.setState({ firstSignInPhase: phase, firstSignInSlow: false });
        }
      },
    });

    if (!isSessionAlive() || action === 'cancelled') return;

    // If pull or upload completed without error even after the user deferred from the slow UI,
    // `syncInitialDone` is already true -> transition the active session to 'done' and start engine!
    if (action === 'pull_from_cloud' || action === 'upload_to_cloud') {
      clearSlowTimer();
      if (action === 'pull_from_cloud') {
        await useAppStore.getState().hydratePreferences();
      }
      if (!isSessionAlive()) return;
      useSyncStore.setState({ firstSignInPhase: 'done', firstSignInSlow: false });
      await engine.start({ skipInitialSync: true });
      return;
    }

    if (isCancelled()) return;
    clearSlowTimer();

    if (action === 'ask_conflict') {
      const [deviceClassesCount, deviceStudentsCount] = await Promise.all([
        targetDb.classes.count(),
        targetDb.students.count(),
      ]);
      if (isCancelled()) return;
      useSyncStore.setState({
        firstSignInPhase: 'conflict',
        firstSignInSlow: false,
        conflictSummary: { deviceClassesCount, deviceStudentsCount },
        conflictError: null,
      });
      return;
    }

    if (isCancelled()) return;
    useSyncStore.setState({ firstSignInPhase: 'done', firstSignInSlow: false });
    await engine.start({ skipInitialSync: action !== 'already_done' });
  } catch (err) {
    if (isCancelled()) return;
    clearSlowTimer();
    console.error('[useSyncStore] First sign-in attempt failed:', err);
    // Keep phase at 'awaiting-first-sync' — NEVER 'done' until syncInitialDone === true!
    useSyncStore.setState({
      firstSignInPhase: 'awaiting-first-sync',
      firstSignInSlow: false,
      status: {
        ...useSyncStore.getState().status,
        state: engine.isOffline() ? 'offline' : 'error',
        errorMessage:
          err instanceof Error ? err.message : 'មិនអាចពិនិត្យទិន្នន័យ Cloud បានទេ។',
      },
      errorDismissed: false,
    });
  }
}

/**
 * Starts the SyncEngine for an approved/admin user right after `openDbForUser(uid)`.
 * - No-op when Firebase is not configured (GitHub Pages stays local-only).
 * - Idempotent for the same `uid` so `start()` runs only once per session.
 * - Checks local `syncInitialDone` FIRST so normal opens never flash «កំពុងពិនិត្យទិន្នន័យ Cloud…».
 */
export async function startSyncForUser(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    return;
  }
  if (activeSyncUid === uid && (activeEngine !== null || useSyncStore.getState().enabled)) {
    return;
  }

  stopSyncEngine();
  const mySession = ++sessionToken;
  const targetDb = db;
  if (targetDb.name !== getUserDbName(uid) || !targetDb.isOpen()) {
    return;
  }

  activeSyncUid = uid;
  activeLocalDb = targetDb;

  // Read local `syncInitialDone` BEFORE setting phase so normal opens never flash the checking screen (Fix 4)
  let doneAlready = false;
  try {
    const row = await targetDb.settings.get(SYNC_INITIAL_DONE_KEY);
    doneAlready = row?.value === true;
  } catch {
    doneAlready = false;
  }

  if (mySession !== sessionToken || !targetDb.isOpen() || db !== targetDb) {
    return;
  }

  const startsOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const initialPhase: FirstSignInPhase = doneAlready
    ? 'done'
    : startsOffline
      ? 'awaiting-first-sync'
      : 'checking';

  useSyncStore.setState({
    enabled: true,
    uid,
    firstSignInPhase: initialPhase,
    firstSignInSlow: false,
    conflictSummary: null,
    conflictError: null,
    errorDismissed: false,
  });

  if (initialPhase === 'checking') {
    armSlowTimer(mySession, attemptToken);
  }

  try {
    const [{ firestore }, { SyncEngine }] = await Promise.all([
      getFirebaseServices(),
      import('./syncEngine'),
    ]);
    if (mySession !== sessionToken || !targetDb.isOpen() || db !== targetDb) {
      return;
    }

    activeFirestore = firestore;

    const engine = new SyncEngine({
      localDb: targetDb,
      firestore,
      uid,
      requireInitialDone: true,
      onStatusChange: (snapshot) => {
        if (mySession !== sessionToken) return;
        useSyncStore.setState((prev) => ({
          status: snapshot,
          errorDismissed:
            snapshot.errorMessage && snapshot.errorMessage !== prev.status.errorMessage
              ? false
              : prev.errorDismissed,
        }));
      },
      onError: (khmerMessage) => {
        if (mySession !== sessionToken) return;
        useAppStore.getState().addToast({
          type: 'error',
          title: 'បញ្ហា Sync ទិន្នន័យ',
          message: khmerMessage,
          duration: 7000,
        });
      },
    });

    activeEngine = engine;

    // Attach window/document lifecycle listeners
    if (typeof window !== 'undefined') {
      const handleOnline = () => {
        if (mySession !== sessionToken || activeEngine !== engine) return;
        engine.setOffline(false);
        const phase = useSyncStore.getState().firstSignInPhase;
        if (phase === 'awaiting-first-sync') {
          void attemptFirstSignIn(engine, targetDb, firestore, uid, mySession);
        }
      };
      const handleOffline = () => {
        if (mySession !== sessionToken || activeEngine !== engine) return;
        engine.setOffline(true);
      };
      const handleFocusOrVisible = () => {
        if (mySession !== sessionToken || activeEngine !== engine) return;
        const phase = useSyncStore.getState().firstSignInPhase;
        if (phase === 'done') {
          void engine.onWindowFocus().catch(() => {});
        } else if (phase === 'awaiting-first-sync' && !engine.isOffline()) {
          const now = Date.now();
          if (now - lastAwaitingFocusRetryAt >= 60_000) {
            lastAwaitingFocusRetryAt = now;
            void attemptFirstSignIn(engine, targetDb, firestore, uid, mySession);
          }
        }
      };
      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          handleFocusOrVisible();
        }
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('focus', handleFocusOrVisible);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      windowCleanup = () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('focus', handleFocusOrVisible);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      };
    }

    await attemptFirstSignIn(engine, targetDb, firestore, uid, mySession);
  } catch (err) {
    if (mySession !== sessionToken) return;
    clearSlowTimer();
    console.error('[useSyncStore] Failed to start cloud sync:', err);
    // Only keep 'done' if syncInitialDone was ALREADY true locally; otherwise stay at 'awaiting-first-sync'!
    useSyncStore.setState({
      firstSignInPhase: doneAlready ? 'done' : 'awaiting-first-sync',
      firstSignInSlow: false,
      status: {
        ...useSyncStore.getState().status,
        state: 'error',
        errorMessage:
          err instanceof Error ? err.message : 'មិនអាចតភ្ជាប់ប្រព័ន្ធ Sync ទៅ Cloud បានទេ។',
      },
      errorDismissed: false,
    });
  }
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  enabled: false,
  uid: null,
  status: { ...DEFAULT_STATUS },
  firstSignInPhase: 'idle',
  firstSignInSlow: false,
  conflictSummary: null,
  conflictError: null,
  errorDismissed: false,

  resolveConflict: async (choice) => {
    const engine = activeEngine;
    const localDb = activeLocalDb;
    const firestore = activeFirestore;
    const uid = activeSyncUid;
    const tokenAtStart = sessionToken;

    if (!engine || !localDb || !firestore || !uid) {
      return;
    }

    set({ firstSignInPhase: 'resolving', firstSignInSlow: false, conflictError: null });
    try {
      const { resolveFirstSignInConflict } = await import('./firstSignIn');
      await resolveFirstSignInConflict({
        choice,
        localDb,
        firestore,
        uid,
        engine,
      });

      if (tokenAtStart !== sessionToken) return;

      await useAppStore.getState().hydratePreferences();
      await engine.start({ skipInitialSync: true });

      if (tokenAtStart !== sessionToken) return;

      set({
        firstSignInPhase: 'done',
        firstSignInSlow: false,
        conflictSummary: null,
        conflictError: null,
      });

      useAppStore.getState().addToast({
        type: 'success',
        title: 'Sync ទិន្នន័យជោគជ័យ!',
        message:
          choice === 'cloud'
            ? 'បានបម្រុងទុក និងទាញយកទិន្នន័យពី Cloud រួចរាល់។'
            : 'បានបម្រុងទុក និងផ្ទុកទិន្នន័យឧបករណ៍នេះទៅ Cloud រួចរាល់។',
      });
    } catch (err) {
      if (tokenAtStart !== sessionToken) return;
      console.error('[useSyncStore] Conflict resolution failed:', err);
      set({
        firstSignInPhase: 'conflict',
        conflictError:
          err instanceof Error
            ? err.message
            : 'មិនអាចបម្រុងទុក ឬជំនួសទិន្នន័យបានទេ សូមពិនិត្យអ៊ីនធឺណិត រួចព្យាយាមម្ដងទៀត។',
      });
    }
  },

  retryFirstSignIn: async () => {
    const uid = get().uid ?? activeSyncUid;
    if (!uid) return;
    set({ errorDismissed: false, firstSignInSlow: false });
    if (activeEngine && activeLocalDb && activeFirestore) {
      await attemptFirstSignIn(activeEngine, activeLocalDb, activeFirestore, uid, sessionToken);
      return;
    }
    // Engine was not created yet (e.g. initial Firebase boot failed while offline) -> restart cleanly
    activeSyncUid = null;
    await startSyncForUser(uid);
  },

  deferFirstSignInToLocal: () => {
    attemptToken += 1;
    clearSlowTimer();
    set({
      firstSignInPhase: 'awaiting-first-sync',
      firstSignInSlow: false,
    });
  },

  triggerManualSync: async () => {
    const phase = get().firstSignInPhase;
    if (phase !== 'done') {
      // Never call syncNow() before first sign-in decision — re-run first sign-in flow instead (Fix 1c)
      await get().retryFirstSignIn();
      return;
    }
    if (!activeEngine) {
      const uid = get().uid ?? activeSyncUid;
      if (uid) {
        activeSyncUid = null;
        await startSyncForUser(uid);
      }
      return;
    }
    set({ errorDismissed: false });
    try {
      await activeEngine.syncNow();
    } catch (err) {
      console.error('[useSyncStore] Manual sync failed:', err);
    }
  },

  dismissError: () => set({ errorDismissed: true }),
}));
