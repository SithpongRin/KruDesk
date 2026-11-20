/** Build information shown in Settings → «អំពីកម្មវិធី». */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_COMMIT: string = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev';
export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';

export const LAST_SEEN_COMMIT_KEY = 'krudesk.lastSeenCommit';

/**
 * Compares this build with the one recorded at the last start and records this one:
 * 'updated' once when the build changed (the browser switched to the new version by itself,
 * e.g. after closing and reopening the app), 'first' when nothing was recorded yet (first
 * start ever, or the first start of the build that introduced this check), else 'same'.
 */
export function consumeAppUpdatedNotice(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage,
  commit: string = APP_COMMIT
): 'updated' | 'first' | 'same' {
  if (!storage || commit === 'dev') return 'same';
  try {
    const previous = storage.getItem(LAST_SEEN_COMMIT_KEY);
    if (previous === commit) return 'same';
    storage.setItem(LAST_SEEN_COMMIT_KEY, commit);
    return previous === null ? 'first' : 'updated';
  } catch {
    return 'same';
  }
}
