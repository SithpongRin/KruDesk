// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BackupRestoreModal } from '../BackupRestoreModal';
import type { KruDeskBackupPayload } from '../../../services/backup';

function makePayload(exportedAt: number): KruDeskBackupPayload {
  return {
    appName: 'KruDesk',
    schemaVersion: 3,
    exportedAt,
    data: {
      settings: [],
      classes: [],
      students: [],
      attendance: [],
      attendanceSessions: [],
      holidays: [],
      monthlyScores: [],
      semesterExams: [],
      templates: [],
    },
  };
}

describe('BackupRestoreModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('defaults to «បញ្ចូលបន្ថែម (Merge)» when the app already has data', async () => {
    const onConfirmRestore = vi.fn().mockResolvedValue(undefined);
    render(
      <BackupRestoreModal
        isOpen={true}
        onClose={() => {}}
        payload={makePayload(1)}
        fileName="test.json"
        onConfirmRestore={onConfirmRestore}
        allowMerge={true}
      />
    );

    fireEvent.click(screen.getByText('ស្ដារទិន្នន័យឥឡូវនេះ'));
    await waitFor(() => expect(onConfirmRestore).toHaveBeenCalledWith('merge'));
  });

  it('uses replace on onboarding (merge not allowed)', async () => {
    const onConfirmRestore = vi.fn().mockResolvedValue(undefined);
    render(
      <BackupRestoreModal
        isOpen={true}
        onClose={() => {}}
        payload={makePayload(1)}
        fileName="test.json"
        onConfirmRestore={onConfirmRestore}
        allowMerge={false}
      />
    );

    fireEvent.click(screen.getByText('ស្ដារទិន្នន័យឥឡូវនេះ'));
    await waitFor(() => expect(onConfirmRestore).toHaveBeenCalledWith('replace'));
  });

  it('goes back to merge when a new backup file is opened after choosing replace', async () => {
    const onConfirmRestore = vi.fn().mockResolvedValue(undefined);
    const props = {
      isOpen: true,
      onClose: () => {},
      fileName: 'test.json',
      onConfirmRestore,
      allowMerge: true,
    };
    const { rerender } = render(<BackupRestoreModal {...props} payload={makePayload(1)} />);

    fireEvent.click(screen.getByText('ជំនួសទិន្នន័យទាំងអស់'));
    rerender(<BackupRestoreModal {...props} payload={null} />);
    rerender(<BackupRestoreModal {...props} payload={makePayload(2)} />);

    fireEvent.click(screen.getByText('ស្ដារទិន្នន័យឥឡូវនេះ'));
    await waitFor(() => expect(onConfirmRestore).toHaveBeenCalledWith('merge'));
  });

  it('warns that replace mode replaces data on every signed-in device', () => {
    render(
      <BackupRestoreModal
        isOpen={true}
        onClose={() => {}}
        payload={makePayload(1)}
        fileName="test.json"
        onConfirmRestore={vi.fn().mockResolvedValue(undefined)}
        allowMerge={true}
      />
    );

    fireEvent.click(screen.getByText('ជំនួសទិន្នន័យទាំងអស់'));
    expect(
      screen.getByText(/ការជំនួសទិន្នន័យទាំងអស់នឹងជំនួសទិន្នន័យនៅលើឧបករណ៍ទាំងអស់ដែលចូលគណនីនេះ/)
    ).toBeDefined();
  });
});
