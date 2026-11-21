import { create } from 'zustand';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null;
  if (mq?.('(display-mode: standalone)').matches) return true;
  if (mq?.('(display-mode: window-controls-overlay)').matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) {
    return true;
  }
  return false;
}

export function detectIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports Macintosh with multi-touch support
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

interface PwaInstallState {
  isInstalled: boolean;
  isIos: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  isInstalled: detectStandaloneMode(),
  isIos: detectIosDevice(),
  deferredPrompt: null,

  promptInstall: async () => {
    const promptEvent = get().deferredPrompt;
    if (!promptEvent) return 'unavailable';
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      set({ isInstalled: true, deferredPrompt: null });
    } else {
      // Chrome allows calling prompt() once per event; clear until browser fires again
      set({ deferredPrompt: null });
    }
    return outcome;
  },
}));

let listenersInstalled = false;

export function initPwaInstallListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;

  usePwaInstallStore.setState({
    isInstalled: detectStandaloneMode(),
    isIos: detectIosDevice(),
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwaInstallStore.setState({
      deferredPrompt: event as BeforeInstallPromptEvent,
      isInstalled: false,
    });
  });

  window.addEventListener('appinstalled', () => {
    usePwaInstallStore.setState({
      isInstalled: true,
      deferredPrompt: null,
    });
  });

  if (typeof window.matchMedia === 'function') {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      if (detectStandaloneMode()) {
        usePwaInstallStore.setState({ isInstalled: true, deferredPrompt: null });
      }
    };
    if (typeof standaloneMedia.addEventListener === 'function') {
      standaloneMedia.addEventListener('change', onDisplayModeChange);
    }
  }

  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
  };
  if (typeof nav.getInstalledRelatedApps === 'function') {
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (Array.isArray(apps) && apps.length > 0) {
          usePwaInstallStore.setState({ isInstalled: true, deferredPrompt: null });
        }
      })
      .catch(() => {});
  }
}
