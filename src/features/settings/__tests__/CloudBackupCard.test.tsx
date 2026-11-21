// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearAllAppData, db } from '../../../db/database';
import { BACKUP_SCHEMA_VERSION, type KruDeskBackupPayload } from '../../../services/backup';
import type { CloudSnapshotMeta } from '../../../services/sync/cloudSnapshot';
import { useAppStore } from '../../../store/useAppStore';
import { CloudBackupCard } from '../CloudBackupCard';

const sampleSnapshots: CloudSnapshotMeta[] = [
  {
    backupId: 'snap_daily_1',
    createdAt: new Date(2026, 10, 21, 9, 15).getTime(),
    schemaVersion: 3,
    appCommit: '0274e5b',
    sizeBytes: 45_200,
    chunkCount: 1,
    classCount: 2,
    studentCount: 64,
    sha256: 'abc123',
    compression: 'gzip',
    source: 'daily',
  },
  {
    backupId: 'snap_pre_dev',
    createdAt: new Date(2026, 10, 20, 14, 0).getTime(),
    schemaVersion: 3,
    appCommit: 'b00d43a',
    sizeBytes: 12_800,
    chunkCount: 1,
    classCount: 1,
    studentCount: 30,
    sha256: 'def456',
    compression: 'gzip',
    source: 'pre-replace-device',
  },
  {
    backupId: 'snap_pre_cloud',
    createdAt: new Date(2026, 10, 19, 11, 30).getTime(),
    schemaVersion: 3,
    appCommit: 'b00d43a',
    sizeBytes: 18_400,
    chunkCount: 1,
    classCount: 1,
    studentCount: 32,
    sha256: 'ghi789',
    compression: 'gzip',
    source: 'pre-replace-cloud',
  },
];

const snapshotPayload: KruDeskBackupPayload = {
  appName: 'KruDesk',
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: new Date(2026, 10, 21, 9, 15).getTime(),
  data: {
    settings: [{ key: 'documentPlace', value: 'សៀមរាប' }],
    classes: [
      {
        id: 101,
        name: '8A-Restored',
        gradeLevel: 8,
        academicYear: '2026-2027',
        color: '#0071e3',
        subjects: [{ id: 'math', name: 'គណិតវិទ្យា', maxScore: 100, order: 1 }],
        createdAt: 1732000000000,
      },
    ],
    students: [
      {
        id: 201,
        classId: 101,
        order: 1,
        studentId: 'R001',
        nameKm: 'សិស្ស ស្ដារពី Cloud',
        gender: 'ស្រី',
        dateOfBirth: '2013-01-01',
        status: 'active',
        createdAt: 1732000000000,
        updatedAt: 1732000000000,
      },
    ],
    attendance: [],
    attendanceSessions: [],
    holidays: [],
    monthlyScores: [],
    semesterExams: [],
    templates: [],
  },
};

describe('CloudBackupCard (Settings → ស្ដារពី Cloud Backup, Step 6b)', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData(db);
    useAppStore.setState({ toasts: [], useKhmerNumerals: false });
  });

  afterEach(async () => {
    cleanup();
    await clearAllAppData(db);
  });

  it('lists snapshots (1 query) with source labels, counts, size, and saves a manual snapshot on «បម្រុងទុកឥឡូវ»', async () => {
    const listSnapshotsFn = vi.fn(async () => sampleSnapshots);
    const manualMeta: CloudSnapshotMeta = {
      backupId: 'snap_manual_now',
      createdAt: new Date(2026, 10, 21, 17, 0).getTime(),
      schemaVersion: 3,
      appCommit: '0274e5b',
      sizeBytes: 25_600,
      chunkCount: 1,
      classCount: 3,
      studentCount: 90,
      sha256: 'man999',
      compression: 'gzip',
      source: 'manual',
    };
    const createManualSnapshotFn = vi.fn(async () => manualMeta);

    render(
      <CloudBackupCard
        uidOverride="teacher-uid"
        listSnapshotsFn={listSnapshotsFn}
        createManualSnapshotFn={createManualSnapshotFn}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('ប្រចាំថ្ងៃ')).toBeInTheDocument();
    });

    expect(listSnapshotsFn).toHaveBeenCalledTimes(1);
    expect(screen.getByText('មុនជំនួស (ឧបករណ៍)')).toBeInTheDocument();
    expect(screen.getByText('មុនជំនួស (Cloud)')).toBeInTheDocument();
    expect(screen.getByText('2 ថ្នាក់')).toBeInTheDocument();
    expect(screen.getByText('សិស្ស 64 នាក់')).toBeInTheDocument();

    // Click «បម្រុងទុកឥឡូវ» -> creates manual snapshot and prepends to list
    fireEvent.click(screen.getByRole('button', { name: 'បម្រុងទុកឥឡូវ' }));

    await waitFor(() => {
      expect(screen.getByText('ដោយដៃ')).toBeInTheDocument();
    });
    expect(createManualSnapshotFn).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 ថ្នាក់')).toBeInTheDocument();
    expect(screen.getByText('សិស្ស 90 នាក់')).toBeInTheDocument();
  });

  it('opens the shared BackupRestoreModal with every-device warning and replaces local DB on confirm', async () => {
    // Seed existing data that should be replaced by the Cloud Backup
    await db.classes.add({
      name: 'ថ្នាក់ចាស់-ត្រូវជំនួស',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#ff9500',
      subjects: [],
      createdAt: 1732000000000,
    });

    const listSnapshotsFn = vi.fn(async () => [sampleSnapshots[0]!]);
    const readSnapshotFn = vi.fn(async () => snapshotPayload);
    const onAfterRestore = vi.fn(async () => {});

    render(
      <CloudBackupCard
        uidOverride="teacher-uid"
        listSnapshotsFn={listSnapshotsFn}
        readSnapshotFn={readSnapshotFn}
        onAfterRestore={onAfterRestore}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ស្ដារ' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'ស្ដារ' }));

    // Shared BackupRestoreModal appears with the Khmer every-device replace warning
    await waitFor(() => {
      expect(screen.getByText('ផ្ទៀងផ្ទាត់ឯកសារ Backup មុនពេលស្ដារ')).toBeInTheDocument();
    });
    expect(readSnapshotFn).toHaveBeenCalledWith('teacher-uid', 'snap_daily_1');
    expect(
      screen.getByText(/ជំនួសទិន្នន័យនៅលើឧបករណ៍ទាំងអស់ដែលចូលគណនីនេះ/)
    ).toBeInTheDocument();
    // Cloud snapshot restore is replace-only (no merge button shown)
    expect(screen.queryByText('បញ្ចូលបន្ថែម (Merge)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ស្ដារទិន្នន័យឥឡូវនេះ' }));

    await waitFor(() => {
      expect(onAfterRestore).toHaveBeenCalledTimes(1);
    });

    const classes = await db.classes.toArray();
    const students = await db.students.toArray();
    expect(classes).toHaveLength(1);
    expect(classes[0]?.name).toBe('8A-Restored');
    expect(students).toHaveLength(1);
    expect(students[0]?.nameKm).toBe('សិស្ស ស្ដារពី Cloud');
  });

  it('shows an error toast and keeps local data untouched if SHA-256 / snapshot read fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const listSnapshotsFn = vi.fn(async () => [sampleSnapshots[0]!]);
      const readSnapshotFn = vi.fn(async () => {
        throw new Error('Cloud Snapshot មិនត្រឹមត្រូវ (SHA-256 មិនត្រូវគ្នា)។');
      });

      render(
        <CloudBackupCard
          uidOverride="teacher-uid"
          listSnapshotsFn={listSnapshotsFn}
          readSnapshotFn={readSnapshotFn}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ស្ដារ' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'ស្ដារ' }));

      await waitFor(() => {
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some((t) => t.type === 'error' && t.message?.includes('SHA-256'))).toBe(true);
      });
      expect(screen.queryByText('ផ្ទៀងផ្ទាត់ឯកសារ Backup មុនពេលស្ដារ')).not.toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
    }
  });
});
