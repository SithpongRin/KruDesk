import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let servicesPromise: Promise<FirebaseServices> | null = null;
let emulatorsConnected = false;

/**
 * In Vitest unit tests (`import.meta.env.MODE === 'test'`), auth gate is off by default
 * so existing non-auth integration tests run without Firebase unless a test turns it on.
 */
let testModeAuthOverride: boolean | null = null;

export function setTestModeAuthEnabled(enabled: boolean | null): void {
  testModeAuthOverride = enabled;
}

export function isEmulatorEnabled(): boolean {
  return import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
}

export function isFirebaseConfigured(): boolean {
  if (import.meta.env.MODE === 'test') {
    return testModeAuthOverride === true;
  }
  if (isEmulatorEnabled()) {
    return true;
  }
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return Boolean(apiKey && projectId);
}

export async function getFirebaseServices(): Promise<FirebaseServices> {
  if (servicesPromise) {
    return servicesPromise;
  }

  servicesPromise = (async () => {
    const [{ getApps, initializeApp }, authMod, firestoreMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);

    const useEmulator = isEmulatorEnabled();
    const projectId =
      import.meta.env.VITE_FIREBASE_PROJECT_ID || (useEmulator ? 'demo-krudesk' : '');
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useEmulator ? 'demo-api-key' : ''),
      authDomain:
        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId || 'demo-krudesk'}.firebaseapp.com`,
      projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || (useEmulator ? '1:000:web:demo' : ''),
    };

    const existingApps = getApps();
    const app = existingApps.length > 0 ? existingApps[0]! : initializeApp(config);

    let auth: Auth;
    try {
      auth = authMod.initializeAuth(app, {
        persistence: authMod.browserLocalPersistence,
        popupRedirectResolver: authMod.browserPopupRedirectResolver,
      });
    } catch {
      auth = authMod.getAuth(app);
    }

    let firestore: Firestore;
    if (useEmulator) {
      firestore = firestoreMod.getFirestore(app);
    } else {
      try {
        firestore = firestoreMod.initializeFirestore(app, {
          localCache: firestoreMod.persistentLocalCache(),
        });
      } catch {
        firestore = firestoreMod.getFirestore(app);
      }
    }

    if (useEmulator && !emulatorsConnected) {
      emulatorsConnected = true;
      const authHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
      const firestorePort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8088);
      authMod.connectAuthEmulator(auth, authHost, { disableWarnings: true });
      firestoreMod.connectFirestoreEmulator(firestore, '127.0.0.1', firestorePort);
    }

    return { app, auth, firestore };
  })();

  return servicesPromise;
}
