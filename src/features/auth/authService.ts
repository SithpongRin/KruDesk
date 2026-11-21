import type { User } from 'firebase/auth';
import { getFirebaseServices, isEmulatorEnabled } from '../../services/firebase/client';
import {
  readCachedAuthStatus,
  writeCachedAuthStatus,
  type UserApprovalStatus,
} from './authCache';

export interface AuthUserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

export interface ManagedUserRecord {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  status: UserApprovalStatus;
  createdAtMs: number | null;
  reviewedAtMs: number | null;
  reviewedBy: string | null;
}

export interface ApprovalCheckResult {
  status: UserApprovalStatus;
  isAdmin: boolean;
  fromCache: boolean;
  error?: string;
}

export function sanitizeDisplayName(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

export function sanitizePhotoURL(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  return trimmed;
}

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code || '';
  return code === 'permission-denied' || code.endsWith('/permission-denied');
}

function toTimestampMs(val: unknown): number | null {
  if (!val) return null;
  if (typeof val === 'number') return val;
  if (typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof (val as { seconds?: number }).seconds === 'number') {
    return (val as { seconds: number }).seconds * 1000;
  }
  return null;
}

export function isIosStandalonePwa(
  nav: {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
  } | undefined = typeof navigator !== 'undefined' ? (navigator as never) : undefined,
  isStandaloneDisplayMode: boolean =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  const isIosDevice =
    /\b(iPad|iPhone|iPod)\b/i.test(ua) ||
    (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  if (!isIosDevice) return false;
  return nav.standalone === true || isStandaloneDisplayMode;
}

export async function signInWithGoogle(): Promise<void> {
  const [{ auth }, authMod] = await Promise.all([getFirebaseServices(), import('firebase/auth')]);
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  // On iOS standalone PWA, popups do not return to the standalone context reliably — use redirect.
  if (isIosStandalonePwa()) {
    await authMod.signInWithRedirect(auth, provider);
    return;
  }

  try {
    await authMod.signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-blocked') {
      await authMod.signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

/**
 * Only available when VITE_USE_FIREBASE_EMULATOR === 'true'.
 * Mints a Google-provider credential directly in the local Auth Emulator.
 */
export async function signInWithEmulatorGoogle(params: {
  email: string;
  displayName?: string;
  photoURL?: string;
  uid?: string;
  emailVerified?: boolean;
}): Promise<void> {
  if (!isEmulatorEnabled()) {
    throw new Error('Emulator sign-in is only enabled when VITE_USE_FIREBASE_EMULATOR=true');
  }
  const [{ auth }, authMod] = await Promise.all([getFirebaseServices(), import('firebase/auth')]);
  const idTokenPayload = JSON.stringify({
    sub: params.uid || `emu_${params.email.replace(/[^a-zA-Z0-9]/g, '_')}`,
    email: params.email,
    email_verified: params.emailVerified ?? true,
    name: params.displayName || params.email.split('@')[0],
    picture: params.photoURL || '',
  });
  const credential = authMod.GoogleAuthProvider.credential(idTokenPayload);
  await authMod.signInWithCredential(auth, credential);
}

export async function signOutFirebase(): Promise<void> {
  const [{ auth }, authMod] = await Promise.all([getFirebaseServices(), import('firebase/auth')]);
  await authMod.signOut(auth);
}

/**
 * Checks whether the signed-in user is the Admin (`config/admin` readable)
 * and reads/creates their `users/{uid}` document.
 * Falls back to cached status in localStorage for the SAME uid only when offline.
 */
export async function checkUserApprovalAndAdmin(user: User): Promise<ApprovalCheckResult> {
  const uid = user.uid;
  const email = user.email || '';

  // If browser reports offline immediately, check cache for same uid
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = readCachedAuthStatus(uid);
    if (cached) {
      return {
        status: cached.status,
        isAdmin: cached.isAdmin,
        fromCache: true,
      };
    }
    return {
      status: 'pending',
      isAdmin: false,
      fromCache: false,
      error: 'មិនអាចភ្ជាប់អ៊ីនធឺណិតដើម្បីផ្ទៀងផ្ទាត់គណនីបានទេ។',
    };
  }

  try {
    const [{ firestore }, fsMod] = await Promise.all([
      getFirebaseServices(),
      import('firebase/firestore'),
    ]);

    const readServerOrLocal = async (ref: ReturnType<typeof fsMod.doc>) => {
      try {
        return await fsMod.getDocFromServer(ref);
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          throw err;
        }
        return await fsMod.getDoc(ref);
      }
    };

    // 1. Check config/admin first: only the single admin can read it per firestore.rules
    let isAdmin = false;
    try {
      const adminSnap = await readServerOrLocal(fsMod.doc(firestore, 'config', 'admin'));
      if (adminSnap.exists()) {
        isAdmin = true;
      }
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        isAdmin = false;
      } else {
        throw err;
      }
    }

    if (isAdmin) {
      writeCachedAuthStatus({
        uid,
        email,
        status: 'approved',
        isAdmin: true,
        checkedAt: Date.now(),
      });
      return {
        status: 'approved',
        isAdmin: true,
        fromCache: false,
      };
    }

    // 2. Non-admin: read or create users/{uid}
    const userRef = fsMod.doc(firestore, 'users', uid);
    const userSnap = await readServerOrLocal(userRef);

    const displayName = sanitizeDisplayName(user.displayName);
    const photoURL = sanitizePhotoURL(user.photoURL);

    let status: UserApprovalStatus = 'pending';

    if (!userSnap.exists()) {
      await fsMod.setDoc(userRef, {
        email,
        displayName,
        photoURL,
        status: 'pending',
        createdAt: fsMod.serverTimestamp(),
      });
      status = 'pending';
    } else {
      const data = userSnap.data() as {
        status?: string;
        displayName?: string | null;
        photoURL?: string | null;
      };
      if (
        data.status === 'approved' ||
        data.status === 'rejected' ||
        data.status === 'disabled' ||
        data.status === 'pending'
      ) {
        status = data.status;
      }

      // Refresh displayName / photoURL if changed
      const storedName = data.displayName ?? null;
      const storedPhoto = data.photoURL ?? null;
      if (storedName !== displayName || storedPhoto !== photoURL) {
        try {
          await fsMod.updateDoc(userRef, {
            displayName,
            photoURL,
          });
        } catch {
          // Ignore non-fatal profile refresh errors
        }
      }
    }

    writeCachedAuthStatus({
      uid,
      email,
      status,
      isAdmin: false,
      checkedAt: Date.now(),
    });

    return {
      status,
      isAdmin: false,
      fromCache: false,
    };
  } catch (err) {
    const cached = readCachedAuthStatus(uid);
    if (cached) {
      return {
        status: cached.status,
        isAdmin: cached.isAdmin,
        fromCache: true,
      };
    }
    return {
      status: 'pending',
      isAdmin: false,
      fromCache: false,
      error:
        err instanceof Error
          ? err.message
          : 'មិនអាចផ្ទៀងផ្ទាត់ស្ថានភាពគណនីបានទេ សូមពិនិត្យអ៊ីនធឺណិតរបស់អ្នក។',
    };
  }
}

export async function subscribeOwnUserStatus(
  uid: string,
  email: string,
  onStatusChange: (status: UserApprovalStatus) => void
): Promise<() => void> {
  const [{ firestore }, fsMod] = await Promise.all([
    getFirebaseServices(),
    import('firebase/firestore'),
  ]);
  const userRef = fsMod.doc(firestore, 'users', uid);
  return fsMod.onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) return;
      const raw = (snap.data() as { status?: string })?.status;
      if (
        raw === 'pending' ||
        raw === 'approved' ||
        raw === 'rejected' ||
        raw === 'disabled'
      ) {
        writeCachedAuthStatus({
          uid,
          email,
          status: raw,
          isAdmin: false,
          checkedAt: Date.now(),
        });
        onStatusChange(raw);
      }
    },
    () => {
      // Ignore snapshot listener errors when offline
    }
  );
}

export async function subscribeAllUsersForAdmin(
  onUsers: (users: ManagedUserRecord[]) => void,
  onError?: (err: Error) => void
): Promise<() => void> {
  const [{ firestore }, fsMod] = await Promise.all([
    getFirebaseServices(),
    import('firebase/firestore'),
  ]);
  const colRef = fsMod.collection(firestore, 'users');
  return fsMod.onSnapshot(
    colRef,
    (snapshot) => {
      const list: ManagedUserRecord[] = snapshot.docs.map((d) => {
        const data = d.data() as {
          email?: string;
          displayName?: string | null;
          photoURL?: string | null;
          status?: string;
          createdAt?: unknown;
          reviewedAt?: unknown;
          reviewedBy?: string | null;
        };
        const st: UserApprovalStatus =
          data.status === 'approved' ||
          data.status === 'rejected' ||
          data.status === 'disabled' ||
          data.status === 'pending'
            ? data.status
            : 'pending';
        return {
          uid: d.id,
          email: data.email || '',
          displayName: data.displayName ?? null,
          photoURL: data.photoURL ?? null,
          status: st,
          createdAtMs: toTimestampMs(data.createdAt),
          reviewedAtMs: toTimestampMs(data.reviewedAt),
          reviewedBy: data.reviewedBy ?? null,
        };
      });
      list.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      onUsers(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function updateUserApprovalStatus(
  targetUid: string,
  newStatus: UserApprovalStatus,
  adminEmail: string
): Promise<void> {
  const [{ firestore }, fsMod] = await Promise.all([
    getFirebaseServices(),
    import('firebase/firestore'),
  ]);
  const userRef = fsMod.doc(firestore, 'users', targetUid);
  await fsMod.updateDoc(userRef, {
    status: newStatus,
    reviewedBy: adminEmail,
    reviewedAt: fsMod.serverTimestamp(),
  });
}
