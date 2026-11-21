export function validateVercelBuildEnv(env: Record<string, string | undefined>): void {
  if (!env.VERCEL) return;
  if (env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    throw new Error(
      'Fail-closed: VITE_USE_FIREBASE_EMULATOR=true is forbidden on Vercel builds.'
    );
  }
  if (!env.VITE_FIREBASE_API_KEY?.trim() || !env.VITE_FIREBASE_PROJECT_ID?.trim()) {
    throw new Error(
      'Fail-closed: VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID are required on Vercel builds.'
    );
  }
}
