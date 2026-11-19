import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { flushAllPendingSaves } from './lib/pendingSaves';
import { clearChunkReloadGuard, tryReloadOnceForStaleChunk } from './lib/chunkReload';
import { useAppStore } from './store/useAppStore';
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

updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    useAppStore.getState().addToast({
      type: 'info',
      title: 'មានកំណែថ្មី — ចុចដើម្បីធ្វើបច្ចុប្បន្នភាព',
      duration: 0,
      actionLabel: 'ធ្វើបច្ចុប្បន្នភាព',
      onAction: async () => {
        await flushAllPendingSaves();
        await updateSW(true);
      },
    });
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
    }
  },
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
