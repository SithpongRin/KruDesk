// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateVercelBuildEnv } from '../../../build/validateVercelBuildEnv';

describe('validateVercelBuildEnv (fail-closed on Vercel)', () => {
  it('enforces fail-closed Vercel build env validation while allowing GitHub Pages builds without auth', () => {
    // GitHub Pages / non-Vercel build works without Firebase env vars
    expect(() => validateVercelBuildEnv({})).not.toThrow();

    // Vercel build fails when VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID is missing
    expect(() =>
      validateVercelBuildEnv({
        VERCEL: '1',
        VITE_FIREBASE_PROJECT_ID: 'krudesk-1fa42',
      })
    ).toThrow(/VITE_FIREBASE_API_KEY/);

    expect(() =>
      validateVercelBuildEnv({
        VERCEL: '1',
        VITE_FIREBASE_API_KEY: 'AIzaSyTest',
      })
    ).toThrow(/VITE_FIREBASE_PROJECT_ID/);

    // Vercel build fails if VITE_USE_FIREBASE_EMULATOR=true
    expect(() =>
      validateVercelBuildEnv({
        VERCEL: '1',
        VITE_FIREBASE_API_KEY: 'AIzaSyTest',
        VITE_FIREBASE_PROJECT_ID: 'krudesk-1fa42',
        VITE_USE_FIREBASE_EMULATOR: 'true',
      })
    ).toThrow(/VITE_USE_FIREBASE_EMULATOR/);

    // Vercel build succeeds when required env vars are present and emulator is off
    expect(() =>
      validateVercelBuildEnv({
        VERCEL: '1',
        VITE_FIREBASE_API_KEY: 'AIzaSyTest',
        VITE_FIREBASE_PROJECT_ID: 'krudesk-1fa42',
      })
    ).not.toThrow();
  });
});
