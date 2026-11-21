// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearAllAppData, KruDeskDatabase } from '../../../db/database';
import { buildBackupPayload } from '../../backup';
import { decideFirstSignInAction } from '../firstSignIn';
import {
  isInternalSyncSettingKey,
  isSyncedSettingKey,
  SYNC_INITIAL_DONE_KEY,
} from '../syncCodec';
import { stopSyncEngine, useSyncStore } from '../useSyncStore';
import { SyncErrorBanner, SyncStatusBadge } from '../../../components/layout/SyncStatusBadge';
import { FirstSignInConflictModal } from '../../../features/sync/FirstSignInConflictModal';

describe('First sign-in decision logic & Sync UI (Step 4)', () => {
  beforeEach(() => {
    stopSyncEngine();
  });

  afterEach(() => {
    stopSyncEngine();
    cleanup();
  });

  it('decideFirstSignInAction covers all cloudEmpty x deviceEmpty combinations and initialDone guard', () => {
    // When initialDone is false: all 4 combinations
    expect(
      decideFirstSignInAction({ initialDone: false, cloudHasData: false, deviceHasData: false })
    ).toBe('none_needed');
    expect(
      decideFirstSignInAction({ initialDone: false, cloudHasData: true, deviceHasData: false })
    ).toBe('pull_from_cloud');
    expect(
      decideFirstSignInAction({ initialDone: false, cloudHasData: false, deviceHasData: true })
    ).toBe('upload_to_cloud');
    expect(
      decideFirstSignInAction({ initialDone: false, cloudHasData: true, deviceHasData: true })
    ).toBe('ask_conflict');

    // When initialDone is true: always already_done regardless of cloud/device state
    for (const cloudHasData of [false, true]) {
      for (const deviceHasData of [false, true]) {
        expect(
          decideFirstSignInAction({ initialDone: true, cloudHasData, deviceHasData })
        ).toBe('already_done');
      }
    }
  });

  it('keeps syncInitialDone internal (not synced to cloud and excluded from backup JSON)', async () => {
    expect(isInternalSyncSettingKey(SYNC_INITIAL_DONE_KEY)).toBe(true);
    expect(isSyncedSettingKey(SYNC_INITIAL_DONE_KEY)).toBe(false);

    const testDb = new KruDeskDatabase(`KruDeskDB_initial_flag_${Date.now()}`);
    await testDb.open();
    await clearAllAppData(testDb);
    try {
      await testDb.settings.put({ key: SYNC_INITIAL_DONE_KEY, value: true });
      await testDb.settings.put({ key: 'documentPlace', value: 'ភ្នំពេញ' });

      // Must NOT go to outbox
      expect(await testDb.outbox.get([`settings__${SYNC_INITIAL_DONE_KEY}`, 'v'])).toBeUndefined();

      // Must NOT appear in backup payload
      const backup = await buildBackupPayload(Date.now(), testDb);
      expect(backup.data.settings.some((s) => s.key === SYNC_INITIAL_DONE_KEY)).toBe(false);
      expect(backup.data.settings.some((s) => s.key === 'documentPlace')).toBe(true);
    } finally {
      await clearAllAppData(testDb);
      testDb.close();
    }
  });

  it('renders Khmer SyncStatusBadge states and SyncErrorBanner only when sync is enabled', () => {
    // Disabled (e.g. GitHub Pages build) -> renders nothing
    useSyncStore.setState({ enabled: false });
    const { container, rerender } = render(
      <>
        <SyncStatusBadge />
        <SyncErrorBanner />
      </>
    );
    expect(container.textContent).toBe('');

    // Synced
    useSyncStore.setState({
      enabled: true,
      status: { state: 'synced', pendingCount: 0, lastSyncedAt: Date.now(), errorMessage: null },
      errorDismissed: false,
    });
    rerender(
      <>
        <SyncStatusBadge />
        <SyncErrorBanner />
      </>
    );
    expect(screen.getByText('បាន sync')).toBeTruthy();

    // Syncing
    useSyncStore.setState({
      status: { state: 'syncing', pendingCount: 2, lastSyncedAt: null, errorMessage: null },
    });
    rerender(
      <>
        <SyncStatusBadge />
        <SyncErrorBanner />
      </>
    );
    expect(screen.getByText('កំពុង sync…')).toBeTruthy();

    // Pending (N)
    useSyncStore.setState({
      status: { state: 'pending', pendingCount: 3, lastSyncedAt: null, errorMessage: null },
    });
    rerender(
      <>
        <SyncStatusBadge />
        <SyncErrorBanner />
      </>
    );
    expect(screen.getByText('មិនទាន់ sync (3)')).toBeTruthy();

    // Offline
    useSyncStore.setState({
      status: { state: 'offline', pendingCount: 1, lastSyncedAt: null, errorMessage: null },
    });
    rerender(
      <>
        <SyncStatusBadge />
        <SyncErrorBanner />
      </>
    );
    expect(screen.getByText('គ្មានអ៊ីនធឺណិត')).toBeTruthy();

    // Error banner displays Khmer error message (oversize / unreadable photo)
    const errMsg = 'មិនអាចបញ្ជូនរូបថតសិស្សខ្លះទៅ Cloud បានទេ — សូមដាក់រូបថតម្ដងទៀត។';
    useSyncStore.setState({
      status: { state: 'error', pendingCount: 1, lastSyncedAt: null, errorMessage: errMsg },
      errorDismissed: false,
    });
    rerender(
      <>
        <SyncStatusBadge />
        <SyncErrorBanner />
      </>
    );
    expect(screen.getByRole('alert').textContent).toContain(errMsg);
  });

  it('FirstSignInConflictModal defaults to Cloud choice and dispatches selected choice on confirm', () => {
    const resolveSpy = vi.fn().mockResolvedValue(undefined);
    useSyncStore.setState({
      enabled: true,
      firstSignInPhase: 'conflict',
      conflictSummary: { deviceClassesCount: 2, deviceStudentsCount: 35 },
      conflictError: null,
      resolveConflict: resolveSpy,
    });

    render(<FirstSignInConflictModal />);

    const cloudOption = screen.getByRole('radio', {
      name: /ប្រើទិន្នន័យពី Cloud \(ជំនួសទិន្នន័យក្នុងឧបករណ៍នេះ\)/,
    });
    const deviceOption = screen.getByRole('radio', {
      name: /ប្រើទិន្នន័យឧបករណ៍នេះ \(ជំនួសទិន្នន័យនៅលើ Cloud និងឧបករណ៍ទាំងអស់\)/,
    });

    // Default = Cloud
    expect(cloudOption.getAttribute('aria-checked')).toBe('true');
    expect(deviceOption.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByText('បម្រុងទុក និងបន្តជំនួសទិន្នន័យ'));
    expect(resolveSpy).toHaveBeenCalledWith('cloud');

    // Switching to Device choice
    resolveSpy.mockClear();
    fireEvent.click(deviceOption);
    expect(deviceOption.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText('បម្រុងទុក និងបន្តជំនួសទិន្នន័យ'));
    expect(resolveSpy).toHaveBeenCalledWith('device');
  });

  it('renders awaiting-first-sync header text and defers slow first sign-in to awaiting-first-sync (Fixes 1a & 3)', () => {
    useSyncStore.setState({
      enabled: true,
      firstSignInPhase: 'pulling',
      firstSignInSlow: true,
    });

    // Deferring from slow screen transitions to awaiting-first-sync (NEVER 'done')
    useSyncStore.getState().deferFirstSignInToLocal();
    expect(useSyncStore.getState().firstSignInPhase).toBe('awaiting-first-sync');
    expect(useSyncStore.getState().firstSignInSlow).toBe(false);

    render(<SyncStatusBadge />);
    expect(screen.getByText('មិនទាន់ sync — រង់ចាំអ៊ីនធឺណិត')).toBeTruthy();
  });
});
