/**
 * App-update helpers for the installed PWA (vite-plugin-pwa, registerType 'prompt').
 *
 * The browser only re-checks sw.js when the app starts and every 30 minutes, so a window
 * that stays open would not see a new deploy. We also check when the window becomes
 * visible again or gets focus (throttled), and the Settings page can check on demand.
 */

export type UpdateCheckResult = 'update-ready' | 'up-to-date' | 'unavailable' | 'skipped' | 'error';

/** Minimum time between automatic checks (focus / visibility). Manual checks ignore it. */
export const AUTO_CHECK_MIN_INTERVAL_MS = 60_000;
/** How long to wait for a newly found service worker to finish installing. */
export const INSTALL_WAIT_MS = 20_000;

type ApplyUpdateFn = (reloadPage?: boolean) => Promise<void>;

interface UpdaterState {
  registration: ServiceWorkerRegistration | null;
  applyUpdate: ApplyUpdateFn | null;
  lastCheckAt: number;
  inFlight: Promise<UpdateCheckResult> | null;
}

const state: UpdaterState = {
  registration: null,
  applyUpdate: null,
  lastCheckAt: 0,
  inFlight: null,
};

export function setUpdateRegistration(
  registration: ServiceWorkerRegistration | null | undefined,
  applyUpdate?: ApplyUpdateFn
): void {
  state.registration = registration ?? null;
  if (applyUpdate) state.applyUpdate = applyUpdate;
}

export function setApplyUpdate(applyUpdate: ApplyUpdateFn): void {
  state.applyUpdate = applyUpdate;
}

/** For tests only. */
export function resetAppUpdateState(): void {
  state.registration = null;
  state.applyUpdate = null;
  state.lastCheckAt = 0;
  state.inFlight = null;
}

function waitForInstalled(worker: ServiceWorker, timeoutMs: number): Promise<void> {
  if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      worker.removeEventListener('statechange', onChange);
      resolve();
    }
    function onChange() {
      if (worker.state !== 'installing') done();
    }
    worker.addEventListener('statechange', onChange);
  });
}

/**
 * Asks the browser to re-fetch sw.js. Resolves 'update-ready' when a new version is waiting.
 * Automatic callers pass `{ force: false }` and are throttled; concurrent calls share one check.
 */
export async function checkForAppUpdate(
  options: { force?: boolean; now?: number } = {}
): Promise<UpdateCheckResult> {
  const { force = false, now = Date.now() } = options;
  const reg = state.registration;
  if (!reg) return 'unavailable';
  if (reg.waiting) return 'update-ready';
  if (state.inFlight) return state.inFlight;
  if (!force && now - state.lastCheckAt < AUTO_CHECK_MIN_INTERVAL_MS) return 'skipped';

  state.lastCheckAt = now;
  state.inFlight = (async (): Promise<UpdateCheckResult> => {
    try {
      await reg.update();
      if (reg.installing) await waitForInstalled(reg.installing, INSTALL_WAIT_MS);
      return reg.waiting ? 'update-ready' : 'up-to-date';
    } catch {
      return 'error';
    } finally {
      state.inFlight = null;
    }
  })();
  return state.inFlight;
}

/** Activates the waiting version and reloads the page. */
export async function applyAppUpdate(): Promise<void> {
  if (state.applyUpdate) {
    await state.applyUpdate(true);
    return;
  }
  window.location.reload();
}

/**
 * Re-checks for a new version whenever the app window becomes visible or focused.
 * Returns a cleanup function.
 */
export function installAutoUpdateChecks(
  win: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document
): () => void {
  const onVisible = () => {
    if (doc.visibilityState === 'visible') void checkForAppUpdate();
  };
  const onFocus = () => void checkForAppUpdate();
  doc.addEventListener('visibilitychange', onVisible);
  win.addEventListener('focus', onFocus);
  return () => {
    doc.removeEventListener('visibilitychange', onVisible);
    win.removeEventListener('focus', onFocus);
  };
}
