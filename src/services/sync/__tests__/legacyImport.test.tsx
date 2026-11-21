// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearAllAppData, KruDeskDatabase } from '../../../db/database';
import { LegacyImportModal } from '../../../features/sync/LegacyImportModal';
import {
  declineLegacyDbForUser,
  getLegacyDbClaimedBy,
  importLegacyDbIntoUserDb,
  inspectLegacyDbForUser,
  isLegacyDbDeclinedBy,
  type StorageLike,
} from '../legacyImport';
import { SYNC_PENDING_FULL_REPLACE_KEY } from '../syncCodec';
import { useSyncStore } from '../useSyncStore';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('Legacy KruDeskDB import (§5 / Step 6c)', () => {
  let legacyName: string;
  let legacyDb: KruDeskDatabase;
  let userDb: KruDeskDatabase;
  let storage: StorageLike;

  beforeEach(async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    legacyName = `KruDeskDB_legacy_test_${suffix}`;
    legacyDb = new KruDeskDatabase(legacyName, { enableOutbox: false });
    userDb = new KruDeskDatabase(`KruDeskDB_user_test_${suffix}`, { enableOutbox: true });
    storage = createMemoryStorage();
    await Promise.all([legacyDb.open(), userDb.open()]);
    await Promise.all([clearAllAppData(legacyDb), clearAllAppData(userDb)]);
  });

  afterEach(async () => {
    cleanup();
    await Promise.all([clearAllAppData(legacyDb), clearAllAppData(userDb)]);
    legacyDb.close();
    userDb.close();
    await legacyDb.delete();
    await userDb.delete();
  });

  it('detects unclaimed legacy DB with data, copies via buildBackupPayload+restoreBackupPayload without modifying/deleting legacy data, and marks claimed', async () => {
    const classId = await legacyDb.classes.add({
      name: '8A-Old',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
      createdAt: 1732000000000,
    });
    await legacyDb.students.add({
      classId,
      order: 1,
      studentId: 'OLD-1',
      nameKm: 'សិស្ស ចាស់ ១',
      gender: 'ស្រី',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    await legacyDb.students.add({
      classId,
      order: 2,
      studentId: 'OLD-2',
      nameKm: 'សិស្ស ចាស់ ២',
      gender: 'ប្រុស',
      dateOfBirth: '2013-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    // Unclaimed -> returns exact counts
    const summary = await inspectLegacyDbForUser('uid-teacher-1', {
      legacyDbName: legacyName,
      storage,
    });
    expect(summary).toEqual({ classesCount: 1, studentsCount: 2 });

    // Import into userDb
    const imported = await importLegacyDbIntoUserDb('uid-teacher-1', userDb, {
      legacyDbName: legacyName,
      storage,
    });
    expect(imported.classesCount).toBe(1);
    expect(imported.studentsCount).toBe(2);
    expect(await userDb.classes.count()).toBe(1);
    expect(await userDb.students.count()).toBe(2);
    expect(await userDb.settings.get(SYNC_PENDING_FULL_REPLACE_KEY)).toBeDefined();

    // Legacy DB is NEVER deleted or modified
    expect(await legacyDb.classes.count()).toBe(1);
    expect(await legacyDb.students.count()).toBe(2);
    expect(await legacyDb.outbox.count()).toBe(0);

    // Marked as claimed -> neither uid-1 nor uid-2 is asked again
    expect(getLegacyDbClaimedBy(storage)).toBe('uid-teacher-1');
    expect(
      await inspectLegacyDbForUser('uid-teacher-1', { legacyDbName: legacyName, storage })
    ).toBeNull();
    expect(
      await inspectLegacyDbForUser('uid-teacher-2', { legacyDbName: legacyName, storage })
    ).toBeNull();
  });

  it('remembers decline per uid without blocking another account on the same computer', async () => {
    await legacyDb.classes.add({
      name: '7B-Old',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#34c759',
      subjects: [],
      createdAt: 1732000000000,
    });

    declineLegacyDbForUser('uid-a', storage);
    expect(isLegacyDbDeclinedBy('uid-a', storage)).toBe(true);
    expect(
      await inspectLegacyDbForUser('uid-a', { legacyDbName: legacyName, storage })
    ).toBeNull();

    // Another teacher on the same computer is still asked
    expect(
      await inspectLegacyDbForUser('uid-b', { legacyDbName: legacyName, storage })
    ).toEqual({ classesCount: 1, studentsCount: 0 });
  });

  it('returns null without creating a DB if the legacy database does not exist', async () => {
    const missingName = `KruDeskDB_does_not_exist_${Date.now()}`;
    expect(
      await inspectLegacyDbForUser('uid-x', { legacyDbName: missingName, storage })
    ).toBeNull();
  });

  it('renders LegacyImportModal with the exact Khmer question and dispatches import / decline', () => {
    const resolveLegacyImport = vi.fn(async () => {});
    useSyncStore.setState({
      firstSignInPhase: 'legacy-import',
      legacyImportSummary: { classesCount: 2, studentsCount: 45 },
      legacyImportError: null,
      resolveLegacyImport,
    });

    render(<LegacyImportModal />);
    expect(
      screen.getByText('រកឃើញទិន្នន័យចាស់ (2 ថ្នាក់, 45 សិស្ស)។ តើជាទិន្នន័យរបស់អ្នកទេ?')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'បាទ/ចាស នាំចូលទិន្នន័យនេះ' }));
    expect(resolveLegacyImport).toHaveBeenCalledWith('import');

    fireEvent.click(screen.getByRole('button', { name: 'ទេ មិនមែនរបស់ខ្ញុំទេ' }));
    expect(resolveLegacyImport).toHaveBeenCalledWith('decline');
  });
});
