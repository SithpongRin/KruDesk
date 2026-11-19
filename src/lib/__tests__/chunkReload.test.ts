// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  clearChunkReloadGuard,
  isStaleChunkError,
  tryReloadOnceForStaleChunk,
} from '../chunkReload';

describe('Stale chunk reload guard', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reloads once on first stale-chunk error and does not reload on second error', () => {
    const reload = vi.fn();

    expect(tryReloadOnceForStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');

    // Second error in same session must not trigger another reload
    expect(tryReloadOnceForStaleChunk(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    // Clearing the guard after a healthy start allows a future deploy to reload once again
    clearChunkReloadGuard();
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    expect(tryReloadOnceForStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('detects Vite/browser dynamic import error messages', () => {
    expect(
      isStaleChunkError(
        new Error('Failed to fetch dynamically imported module: https://example.com/a.js')
      )
    ).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('Some other runtime error'))).toBe(false);
  });
});
