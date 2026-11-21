import { create } from 'zustand';
import type { User } from 'firebase/auth';
import {
  getFirebaseServices,
  isEmulatorEnabled,
  isFirebaseConfigured,
} from '../../services/firebase/client';
import { readCachedAuthStatus, type UserApprovalStatus } from './authCache';
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

  initAuth: () => () => void;
  signIn: () => Promise<void>;
  recheckStatus: () => Promise<void>;
  signOut: () => Promise<void>;
  setAuthError: (msg: string | null) => void;
}

let currentFirebaseUser: User | null = null;
let unsubUserDoc: (() => void) | null = null;
let unsubAdminUsers: (() => void) | null = null;

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

  setAuthError: (msg) => set({ authError: msg }),

  initAuth: () => {
    const required = isFirebaseConfigured();
    if (!required) {
      set({ authReady: true, authRequired: false });
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
            set({
              user: null,
              status: null,
              isAdmin: false,
              isChecking: false,
              authError: null,
              pendingUsersCount: 0,
              managedUsers: [],
              authReady: true,
            });
            return;
          }

          const profile = toAuthUserProfile(fbUser);
          const cached = readCachedAuthStatus(fbUser.uid);

          // Optimistically apply cached status for the SAME uid while online check runs
          if (cached) {
            set({
              user: profile,
              status: cached.status,
              isAdmin: cached.isAdmin,
              isChecking: true,
              authError: null,
              authReady: true,
            });
          } else {
            set({
              user: profile,
              isChecking: true,
              authError: null,
            });
          }

          const result = await checkUserApprovalAndAdmin(fbUser);
          if (cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;

          set({
            user: profile,
            status: result.status,
            isAdmin: result.isAdmin,
            isChecking: false,
            authError: result.error || null,
            authReady: true,
          });

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
              (newStatus) => {
                if (cancelled || currentFirebaseUser?.uid !== fbUser.uid) return;
                set({ status: newStatus });
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
    const result = await checkUserApprovalAndAdmin(fbUser);
    if (currentFirebaseUser?.uid !== fbUser.uid) return;

    set({
      status: result.status,
      isAdmin: result.isAdmin,
      isChecking: false,
      authError: result.error || null,
    });
  },

  signOut: async () => {
    cleanupDataSubscriptions();
    currentFirebaseUser = null;
    await signOutFirebase();
    set({
      user: null,
      status: null,
      isAdmin: false,
      isChecking: false,
      authError: null,
      pendingUsersCount: 0,
      managedUsers: [],
    });
  },
}));
