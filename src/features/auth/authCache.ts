export type UserApprovalStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface CachedAuthStatus {
  uid: string;
  email: string;
  status: UserApprovalStatus;
  isAdmin: boolean;
  checkedAt: number;
}

export const AUTH_CACHE_STORAGE_KEY = 'krudesk.authStatusCache';

const VALID_STATUSES = new Set<UserApprovalStatus>(['pending', 'approved', 'rejected', 'disabled']);

const memoryFallback = new Map<string, string>();

function getStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  if (
    typeof window !== 'undefined' &&
    window.localStorage &&
    typeof window.localStorage.getItem === 'function' &&
    typeof window.localStorage.setItem === 'function' &&
    typeof window.localStorage.removeItem === 'function'
  ) {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => memoryFallback.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryFallback.set(key, value);
    },
    removeItem: (key: string) => {
      memoryFallback.delete(key);
    },
  };
}

export function readCachedAuthStatus(uid: string): CachedAuthStatus | null {
  if (!uid) {
    return null;
  }
  try {
    const raw = getStorage().getItem(AUTH_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAuthStatus>;
    if (
      !parsed ||
      typeof parsed.uid !== 'string' ||
      parsed.uid !== uid ||
      typeof parsed.email !== 'string' ||
      typeof parsed.status !== 'string' ||
      !VALID_STATUSES.has(parsed.status as UserApprovalStatus) ||
      typeof parsed.isAdmin !== 'boolean' ||
      typeof parsed.checkedAt !== 'number'
    ) {
      return null;
    }
    return {
      uid: parsed.uid,
      email: parsed.email,
      status: parsed.status as UserApprovalStatus,
      isAdmin: parsed.isAdmin,
      checkedAt: parsed.checkedAt,
    };
  } catch {
    return null;
  }
}

export function writeCachedAuthStatus(entry: CachedAuthStatus): void {
  if (!entry.uid) {
    return;
  }
  try {
    getStorage().setItem(AUTH_CACHE_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCachedAuthStatus(): void {
  try {
    getStorage().removeItem(AUTH_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
