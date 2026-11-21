import Dexie from 'dexie';
import { KruDeskDatabase, LEGACY_DB_NAME } from '../../db/database';
import { buildBackupPayload, restoreBackupPayload, type RestoreSummary } from '../backup';
import { checkDeviceHasData } from './firstSignIn';

export const LEGACY_DB_CLAIMED_BY_KEY = 'krudesk.legacyDbClaimedBy';
export const LEGACY_DB_DECLINED_BY_KEY = 'krudesk.legacyDbDeclinedBy';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LegacyDbSummary {
  classesCount: number;
  studentsCount: number;
}

function getDefaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getLegacyDbClaimedBy(storage: StorageLike | null = getDefaultStorage()): string | null {
  if (!storage) return null;
  try {
    const val = storage.getItem(LEGACY_DB_CLAIMED_BY_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function markLegacyDbClaimedBy(
  uid: string,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage || !uid) return;
  try {
    storage.setItem(LEGACY_DB_CLAIMED_BY_KEY, uid);
  } catch {
    /* ignore storage quota/privacy errors */
  }
}

function readDeclinedUids(storage: StorageLike | null): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LEGACY_DB_DECLINED_BY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function isLegacyDbDeclinedBy(
  uid: string,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!uid) return false;
  return readDeclinedUids(storage).includes(uid);
}

export function declineLegacyDbForUser(
  uid: string,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage || !uid) return;
  try {
    const list = readDeclinedUids(storage);
    if (!list.includes(uid)) {
      list.push(uid);
      storage.setItem(LEGACY_DB_DECLINED_BY_KEY, JSON.stringify(list));
    }
  } catch {
    /* ignore storage errors */
  }
}

export interface LegacyDbOptions {
  legacyDbName?: string;
  storage?: StorageLike | null;
}

/**
 * Checks whether the legacy single-account `KruDeskDB` exists on this device, has teacher data,
 * has not been claimed by any account yet, and has not been declined by `uid`.
 * Read-only: never modifies or deletes the legacy database, and never creates it if absent.
 */
export async function inspectLegacyDbForUser(
  uid: string,
  options?: LegacyDbOptions
): Promise<LegacyDbSummary | null> {
  const storage = options?.storage !== undefined ? options.storage : getDefaultStorage();
  const legacyDbName = options?.legacyDbName ?? LEGACY_DB_NAME;

  if (!uid) return null;
  if (getLegacyDbClaimedBy(storage)) return null;
  if (isLegacyDbDeclinedBy(uid, storage)) return null;

  const exists = await Dexie.exists(legacyDbName);
  if (!exists) return null;

  const legacyDb = new KruDeskDatabase(legacyDbName, { enableOutbox: false });
  try {
    await legacyDb.open();
    const hasData = await checkDeviceHasData(legacyDb);
    if (!hasData) return null;

    const [classesCount, studentsCount] = await Promise.all([
      legacyDb.classes.count(),
      legacyDb.students.count(),
    ]);
    return { classesCount, studentsCount };
  } catch (err) {
    console.warn('[legacyImport] Failed to inspect legacy DB:', err);
    return null;
  } finally {
    legacyDb.close();
  }
}

/**
 * Copies all data from the legacy `KruDeskDB` into `userDb` (`KruDeskDB_<uid>`) using
 * `buildBackupPayload(..., legacyDb)` + `restoreBackupPayload(..., 'replace', userDb)`,
 * then marks the legacy DB as claimed by `uid`.
 * NEVER deletes or modifies any data in the legacy DB.
 */
export async function importLegacyDbIntoUserDb(
  uid: string,
  userDb: KruDeskDatabase,
  options?: LegacyDbOptions
): Promise<RestoreSummary> {
  const storage = options?.storage !== undefined ? options.storage : getDefaultStorage();
  const legacyDbName = options?.legacyDbName ?? LEGACY_DB_NAME;

  const legacyDb = new KruDeskDatabase(legacyDbName, { enableOutbox: false });
  let payload: Awaited<ReturnType<typeof buildBackupPayload>>;
  try {
    await legacyDb.open();
    payload = await buildBackupPayload(Date.now(), legacyDb);
  } finally {
    legacyDb.close();
  }

  const summary = await restoreBackupPayload(payload, 'replace', userDb);
  markLegacyDbClaimedBy(uid, storage);
  return summary;
}
