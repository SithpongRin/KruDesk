import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_CHECK_MIN_INTERVAL_MS,
  applyAppUpdate,
  checkForAppUpdate,
  installAutoUpdateChecks,
  resetAppUpdateState,
  setApplyUpdate,
  setUpdateRegistration,
} from '../appUpdate';

type FakeReg = {
  waiting: unknown;
  installing: unknown;
  update: ReturnType<typeof vi.fn>;
};

function fakeRegistration(onUpdate: (reg: FakeReg) => void = () => {}): FakeReg {
  const reg: FakeReg = { waiting: null, installing: null, update: vi.fn() };
  reg.update.mockImplementation(async () => onUpdate(reg));
  return reg;
}

function fakeWorker(initial: string) {
  const listeners = new Set<() => void>();
  const worker = {
    state: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    finish(next: string) {
      worker.state = next;
      listeners.forEach((fn) => fn());
    },
  };
  return worker;
}

afterEach(() => {
  resetAppUpdateState();
  vi.useRealTimers();
});

describe('checkForAppUpdate', () => {
  it('is unavailable without a service worker registration', async () => {
    expect(await checkForAppUpdate({ force: true })).toBe('unavailable');
  });

  it('reports up-to-date when no new worker appears', async () => {
    const reg = fakeRegistration();
    setUpdateRegistration(reg as unknown as ServiceWorkerRegistration);
    expect(await checkForAppUpdate({ force: true })).toBe('up-to-date');
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('waits for a newly found worker to install and reports update-ready', async () => {
    const worker = fakeWorker('installing');
    const reg = fakeRegistration((r) => {
      r.installing = worker;
      setTimeout(() => {
        r.installing = null;
        r.waiting = worker;
        worker.finish('installed');
      }, 5);
    });
    setUpdateRegistration(reg as unknown as ServiceWorkerRegistration);
    expect(await checkForAppUpdate({ force: true })).toBe('update-ready');
  });

  it('returns update-ready immediately when a version is already waiting', async () => {
    const reg = fakeRegistration();
    reg.waiting = {};
    setUpdateRegistration(reg as unknown as ServiceWorkerRegistration);
    expect(await checkForAppUpdate()).toBe('update-ready');
    expect(reg.update).not.toHaveBeenCalled();
  });

  it('throttles automatic checks but not manual ones', async () => {
    const reg = fakeRegistration();
    setUpdateRegistration(reg as unknown as ServiceWorkerRegistration);
    const t0 = 1_000_000;
    expect(await checkForAppUpdate({ now: t0 })).toBe('up-to-date');
    expect(await checkForAppUpdate({ now: t0 + 1000 })).toBe('skipped');
    expect(await checkForAppUpdate({ now: t0 + 1000, force: true })).toBe('up-to-date');
    expect(
      await checkForAppUpdate({ now: t0 + 1000 + AUTO_CHECK_MIN_INTERVAL_MS })
    ).toBe('up-to-date');
    expect(reg.update).toHaveBeenCalledTimes(3);
  });

  it('reports error when the update request fails', async () => {
    const reg = fakeRegistration();
    reg.update.mockRejectedValueOnce(new Error('offline'));
    setUpdateRegistration(reg as unknown as ServiceWorkerRegistration);
    expect(await checkForAppUpdate({ force: true })).toBe('error');
  });
});

describe('installAutoUpdateChecks', () => {
  it('checks on focus and when the document becomes visible, and cleans up', async () => {
    const reg = fakeRegistration();
    setUpdateRegistration(reg as unknown as ServiceWorkerRegistration);

    const winListeners = new Map<string, () => void>();
    const docListeners = new Map<string, () => void>();
    const win = {
      addEventListener: (t: string, fn: () => void) => winListeners.set(t, fn),
      removeEventListener: (t: string) => winListeners.delete(t),
    };
    const doc = {
      visibilityState: 'hidden' as DocumentVisibilityState,
      addEventListener: (t: string, fn: () => void) => docListeners.set(t, fn),
      removeEventListener: (t: string) => docListeners.delete(t),
    };

    const cleanup = installAutoUpdateChecks(
      win as unknown as Window,
      doc as unknown as Document
    );

    docListeners.get('visibilitychange')!(); // still hidden -> no check
    expect(reg.update).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    docListeners.get('visibilitychange')!();
    await Promise.resolve();
    expect(reg.update).toHaveBeenCalledTimes(1);

    cleanup();
    expect(winListeners.size).toBe(0);
    expect(docListeners.size).toBe(0);
  });
});

describe('applyAppUpdate', () => {
  it('calls the registered apply function with reload', async () => {
    const apply = vi.fn(async () => {});
    setApplyUpdate(apply);
    await applyAppUpdate();
    expect(apply).toHaveBeenCalledWith(true);
  });
});
