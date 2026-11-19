export const CHUNK_RELOAD_KEY = 'krudesk-chunk-reload';

export const STALE_CHUNK_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed/;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return STALE_CHUNK_PATTERN.test(message);
}

/**
 * Reloads the page at most once per session when a stale lazy-loaded chunk fails to fetch.
 * Returns true if a reload was triggered, false if the guard was already set or storage failed.
 */
export function tryReloadOnceForStaleChunk(
  reloadFn: () => void = () => window.location.reload()
): boolean {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') {
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    return false;
  }
  reloadFn();
  return true;
}

export function clearChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // ignore storage errors
  }
}
