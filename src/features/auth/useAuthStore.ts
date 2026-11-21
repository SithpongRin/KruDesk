import { create } from 'zustand';
import type { User } from 'firebase/auth';
import {
  closeUserDb,
  getUserDbName,
  LEGACY_DB_NAME,
  openDbForUser,
} from '../../db/database';
import {
  getFirebaseServices,
  isEmulatorEnabled,
  isFirebaseConfigured,
} from '../../services/firebase/client';
import { useAppStore } from '../../store/useAppStore';
import {
  readCachedAuthStatus,
  writeCachedAuthStatus,
  type UserApprovalStatus,
} from './authCache';
import {
  checkUserApprovalAndAdmin,
  signInWithEmulatorGoogle,
  signInWithGoogle,
  signOutFirebase,
  subscribeAllUsersForAdmin,
  subscribeOwnUserStatus,
  type AuthUserProfile,
  type ManagedUserRecord,
} from './authService';

interface AuthState {
  authReady: boolean;
  authRequired: boolean;
  user: AuthUserProfile | null;
  status: UserApprovalStatus | null;
  isAdmin: boolean;
  isChecking: boolean;
  isSigningIn: boolean;
  authError: string | null;
  pendingUsersCount: number;
  managedUsers: ManagedUserRecord[];
  activeDbName: string;
  userDbReady: boolean;

  initAuth: () => () => void;
  signIn: () => Promise<void>;
  recheckStatus: () => Promise<void>;
  signOut: () => Promise<void>;
  setAuthError: (msg: string | null) => void;
}

let currentFirebaseUser: User | null = null;
let openedDbUid: string | null = null;
let unsubUserDoc: (() => void) | null = null;
let unsubAdminUsers: (() => void) | null = null;

let customReloadHandler: (() => void) | null = null;

export function setPageReloadHandlerForTest(handler: (() => void) | null): void {
  customReloadHandler = handler;
}

export function triggerPageReload(): void {
  if (customReloadHandler) {
    customReloadHandler();
    return;
  }
  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
    try {
      window.location.reload();
    } catch {
      // Ignore in test environments where window.location.reload is not implemented
    }
  }
}

export function getOpenedDbUid(): string | null {
  return openedDbUid;
}

const storeResetListeners = new Set<() => void>();

export function registerInMemoryStoreReset(listener: () => void): () => void {
  storeResetListeners.add(listener);
  return () => {
    storeResetListeners.delete(listener);
  };
}

export function resetInMemoryStores(): void {
  useAppStore.setState({
    selectedClassId: null,
    activeView: 'dashboard',
    hasUnsavedAttendance: false,
    pendingViewAfterLeaveConfirm: null,
    pendingOpenCreateClass: false,
    pendingRollCallDate: null,
  });
  for (const listener of storeResetListeners) {
    listener();
  }
}

function cleanupDataSubscriptions() {
  if (unsubUserDoc) {
    unsubUserDoc();
    unsubUserDoc = null;
  }
  if (unsubAdminUsers) {
    unsubAdminUsers();
    unsubAdminUsers = null;
  }
}

function toAuthUserProfile(fbUser: User): AuthUserProfile {
  return {
    uid: fbUser.uid,
    email: fbUser.email || '',
    displayName: fbUser.displayName,
    photoURL: fbUser.photoURL,
  };
}

/**
 * Opens `KruDeskDB_<uid>` and hydrates preferences.
 * If another user's database (`openedDbUid !== uid`) was already open in this page session,
 * closes the previous DB, resets in-memory stores, and triggers a full page reload so no
 * stale in-memory state from the previous user survives.
 */
export async function activateUserDatabase(uid: string): Promise<{ dbName: string; reloaded: boolean }> {
  if (openedDbUid !== null && openedDbUid !== uid) {
    deactivateUserDatabase();
    triggerPageReload();
    return { dbName: getUserDbName(uid), reloaded: true };
  }
  openedDbUid = uid;
  await openDbForUser(uid);
  await useAppStore.getState().hydratePreferences();
  return { dbName: getUserDbName(uid), reloaded: false };
}

export function deactivateUserDatabase(): void {
  openedDbUid = null;
  closeUserDb();
  resetInMemoryStores();
}

/**
 * Handles transitioning a user to a non-approved status (`pending` | `rejected` | `disabled`).
 * If the user previously had an active approved session/DB in this page load, updates the
 * localStorage cache to the new status first (preventing any reload loop), closes the DB,
 * resets in-memory stores, and triggers a single page reload.
 */
export function handleRevokedOrUnapprovedStatus(
  uid: string,
  email: string,
  newStatus: Exclude<UserApprovalStatus, 'approved'>,
  wasPreviouslyApprovedInSession: boolean
): boolean {
  writeCachedAuthStatus({
    uid,
    email,
    status: newStatus,
    isAdmin: false,
    checkedAt: Date.now(),
  });
  deactivateUserDatabase();
  if (wasPreviouslyApprovedInSession) {
    triggerPageReload();
    return true;
  }
  return false;
}

declare global {
  interface Window {
    __KRUDESK_EMULATOR_SIGN_IN__?: typeof signInWithEmulatorGoogle;
    __KRUDESK_EMULATOR_SIGN_OUT__?: () => Promise<void>;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  authReady: !isFirebaseConfigured(),
  authRequired: isFirebaseConfigured(),
  user: null,
  status: null,
  isAdmin: false,
  isChecking: false,
  isSigningIn: false,
  authError: null,
  pendingUsersCount: 0,
  managedUsers: [],
  activeDbName: LEGACY_DB_NAME,
  userDbReady: !isFirebaseConfigured(),

  setAuthError: (msg) => set({ authError: msg }),

  initAuth: () => {
    const required = isFirebaseConfigured();
    if (!required) {
      set({
        authReady: true,
        authRequired: false,
        activeDbName: LEGACY_DB_NAME,
        userDbReady: true,
      });
      return () => {};
    }

    set({ authRequired: true });

    if (typeof window !== 'undefined' && isEmulatorEnabled()) {
      window.__KRUDESK_EMULATOR_SIGN_IN__ = signInWithEmulatorGoogle;
      window.__KRUDESK_EMULATOR_SIGN_OUT__ = () => get().signOut();
    }

    let cancelled = false;
    let unsubAuth: (() => void) | null = null;

    const handleOnlineRecheck = () => {
      if (currentFirebaseUser) {
        void get().recheckStatus();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnlineRecheck);
    }

    void (async () => {
      try {
        const [{ auth }, authMod] = await Promise.all([
          getFirebaseServices(),
          import('firebase/auth'),
        ]);
        if (cancelled) return;

        // Consume any pending redirect result if signInWithRedirect (or iOS PWA redirect) was used
        void authMod.getRedirectResult(auth).catch((err) => {
          if (cancelled) return;
          const code = (err as { code?: string })?.code || '';
          if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
            set({ authError: 'ការចូលប្រើត្រូវបានបោះបង់។' });
          } else if (err instanceof Error && err.message) {
            set({ authError: err.message });
          }
        });

        unsubAuth = authMod.onAuthStateChanged(auth, async (fbUser) => {
          if (cancelled) return;
          cleanupDataSubscriptions();
          currentFirebaseUser = fbUser;

          if (!fbUser) {
            const hadOpenDb = openedDbUid !== null;
            deactivateUserDatabase();
            set({
              user: null,
              status: null,
              isAdmin: false,
              isChecking: false,
              authError: null,
              pendingUsersCount: 0,
              managedUsers: [],
              activeDbName: LEGACY_DB_NAME,
              userDbReady: false,
              authReady: true,
            });
            if (hadOpenDb) {
              triggerPageReload();
            }
            return;
          }

          // If a different user's DB was already opened in this session, reload cleanly
          if (openedDbUid !== null && openedDbUid !== fbUser.uid) {
            deactivateUserDatabase();
            triggerPageReload();
            return;
          }

          const profile = toAuthUserProfile(fbUser);
          const cached = readCachedAuthStatus(fbUser.uid);

          // Optimistically apply cached status for the SAME uid while online check runs
          if (cached && (cached.isAdmin || cached.status === 'approved')) {
            const { dbName, reloaded } = await activateUserDatabase(fbUser.uid);
            if (reloaded || cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;
            set({
              user: profile,
              status: cached.status,
              isAdmin: cached.isAdmin,
              isChecking: true,
              authError: null,
              activeDbName: dbName,
              userDbReady: true,
              authReady: true,
            });
          } else if (cached) {
            set({
              user: profile,
              status: cached.status,
              isAdmin: cached.isAdmin,
              isChecking: true,
              authError: null,
              userDbReady: false,
              authReady: true,
            });
          } else {
            set({
              user: profile,
              isChecking: true,
              authError: null,
              userDbReady: false,
            });
          }

          const wasApprovedBeforeCheck =
            openedDbUid === fbUser.uid || get().status === 'approved' || get().isAdmin;
          const result = await checkUserApprovalAndAdmin(fbUser);
          if (cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;

          if (result.isAdmin || result.status === 'approved') {
            const { dbName, reloaded } = await activateUserDatabase(fbUser.uid);
            if (reloaded || cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;
            set({
              user: profile,
              status: result.status,
              isAdmin: result.isAdmin,
              isChecking: false,
              authError: result.error || null,
              activeDbName: dbName,
              userDbReady: true,
              authReady: true,
            });
          } else {
            set({
              user: profile,
              status: result.status,
              isAdmin: false,
              isChecking: false,
              authError: result.error || null,
              activeDbName: LEGACY_DB_NAME,
              userDbReady: false,
              authReady: true,
            });
            handleRevokedOrUnapprovedStatus(
              fbUser.uid,
              fbUser.email || '',
              result.status,
              wasApprovedBeforeCheck
            );
          }

          if (result.isAdmin) {
            unsubAdminUsers = await subscribeAllUsersForAdmin((users) => {
              if (cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;
              const pendingCount = users.filter((u) => u.status === 'pending').length;
              set({
                managedUsers: users,
                pendingUsersCount: pendingCount,
              });
            });
          } else {
            unsubUserDoc = await subscribeOwnUserStatus(
              fbUser.uid,
              fbUser.email || '',
              async (newStatus) => {
                if (cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;
                if (newStatus === 'approved') {
                  const { dbName, reloaded } = await activateUserDatabase(fbUser.uid);
                  if (reloaded || cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;
                  set({
                    status: 'approved',
                    activeDbName: dbName,
                    userDbReady: true,
                  });
                } else {
                  const wasApproved =
                    openedDbUid === fbUser.uid || get().status === 'approved' || get().isAdmin;
                  set({
                    status: newStatus,
                    activeDbName: LEGACY_DB_NAME,
                    userDbReady: false,
                  });
                  handleRevokedOrUnapprovedStatus(
                    fbUser.uid,
                    fbUser.email || '',
                    newStatus,
                    wasApproved
                  );
                }
              }
            );
          }
        });
      } catch (err) {
        if (cancelled) return;
        set({
          authReady: true,
          isChecking: false,
          authError:
            err instanceof Error ? err.message : 'មិនអាចចាប់ផ្ដើមប្រព័ន្ធផ្ទៀងផ្ទាត់គណនីបានទេ។',
        });
      }
    })();

    return () => {
      cancelled = true;
      cleanupDataSubscriptions();
      if (unsubAuth) {
        unsubAuth();
        unsubAuth = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnlineRecheck);
      }
    };
  },

  signIn: async () => {
    set({ isSigningIn: true, authError: null });
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        set({ authError: 'ការចូលប្រើត្រូវបានបោះបង់។' });
      } else {
        set({
          authError:
            err instanceof Error
              ? err.message
              : 'មិនអាចចូលប្រើដោយ Google បានទេ សូមព្យាយាមម្ដងទៀត។',
        });
      }
    } finally {
      set({ isSigningIn: false });
    }
  },

  recheckStatus: async () => {
    if (!currentFirebaseUser) return;
    set({ isChecking: true, authError: null });
    const fbUser = currentFirebaseUser;
    const wasApproved =
      openedDbUid === fbUser.uid || get().status === 'approved' || get().isAdmin;
    const result = await checkUserApprovalAndAdmin(fbUser);
    if (currentFirebaseUser?.uid !== fbUser.uid) return;

    if (result.isAdmin || result.status === 'approved') {
      const { dbName, reloaded } = await activateUserDatabase(fbUser.uid);
      if (reloaded || currentFirebaseUser?.uid !== fbUser.uid) return;
      set({
        status: result.status,
        isAdmin: result.isAdmin,
        isChecking: false,
        authError: result.error || null,
        activeDbName: dbName,
        userDbReady: true,
      });
    } else {
      set({
        status: result.status,
        isAdmin: false,
        isChecking: false,
        authError: result.error || null,
        activeDbName: LEGACY_DB_NAME,
        userDbReady: false,
      });
      handleRevokedOrUnapprovedStatus(
        fbUser.uid,
        fbUser.email || '',
        result.status,
        wasApproved
      );
    }
  },

  signOut: async () => {
    cleanupDataSubscriptions();
    currentFirebaseUser = null;
    deactivateUserDatabase();
    try {
      await signOutFirebase();
    } finally {
      set({
        user: null,
        status: null,
        isAdmin: false,
        isChecking: false,
        authError: null,
        pendingUsersCount: 0,
        managedUsers: [],
        activeDbName: LEGACY_DB_NAME,
        userDbReady: false,
      });
      triggerPageReload();
    }
  },
}));
