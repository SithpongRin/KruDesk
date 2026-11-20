import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { flushAllPendingSaves } from './lib/pendingSaves';
import { clearChunkReloadGuard, tryReloadOnceForStaleChunk } from './lib/chunkReload';
import {
  applyAppUpdate,
  installAutoUpdateChecks,
  setApplyUpdate,
  setUpdateRegistration,
} from './lib/appUpdate';
import { useAppStore } from './store/useAppStore';
import { APP_COMMIT, consumeAppUpdatedNotice } from './lib/appVersion';
import { getProfile } from './db/database';
import './index.css';

window.addEventListener('vite:preloadError', (event) => {
  if (tryReloadOnceForStaleChunk()) {
    event.preventDefault();
  }
});

if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// Clean up legacy runtime cache name so Workbox precache stays authoritative
if (typeof caches !== 'undefined') {
  caches.delete('krudesk-static-cache').catch(() => {});
}

let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};

let updateToastShown = false;

updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const store = useAppStore.getState();
    store.setAppUpdateReady(true);
    if (updateToastShown) return;
    updateToastShown = true;
    store.addToast({
      type: 'info',
      title: 'មានកំណែថ្មី — ចុចដើម្បីធ្វើបច្ចុប្បន្នភាព',
      duration: 0,
      actionLabel: 'ធ្វើបច្ចុប្បន្នភាព',
      onAction: () => void applyAppUpdate(),
    });
  },
  onRegisteredSW(_swUrl, registration) {
    setUpdateRegistration(registration);
    if (registration) {
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
      installAutoUpdateChecks();
    }
  },
});

// The browser may switch to a new version by itself (app closed and reopened, Ctrl+Shift+R);
// then no «មានកំណែថ្មី» prompt appears, so say once that the update is done. On the first
// recorded start, only a teacher who already has data (a profile) is told.
const showUpdatedNotice = () =>
  useAppStore.getState().addToast({
    type: 'success',
    title: 'បានធ្វើបច្ចុប្បន្នភាពរួចហើយ',
    message: `ឥឡូវកំពុងប្រើកំណែថ្មី (${APP_COMMIT})។ ទិន្នន័យរបស់អ្នកនៅដដែល។`,
    // stays until closed: the app is often still loading when it appears
    duration: 0,
  });
const updatedNotice = consumeAppUpdatedNotice();
if (updatedNotice === 'updated') {
  showUpdatedNotice();
} else if (updatedNotice === 'first') {
  getProfile()
    .then((profile) => {
      if (profile) showUpdatedNotice();
    })
    .catch(() => {});
}

setApplyUpdate(async (reloadPage) => {
  await flushAllPendingSaves();
  await updateSW(reloadPage);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

setTimeout(() => {
  clearChunkReloadGuard();
}, 5000);
