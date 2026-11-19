// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { db, clearAllAppData, setSetting } from '../../../db/database';
import { useAppStore } from '../../../store/useAppStore';
import { toLocalDateKey } from '../../../lib/khmerDate';
import { DashboardView } from '../DashboardView';
import type { Profile } from '../../../types/domain';

const TEST_PROFILE: Profile = {
  teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
  schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
  directorName: 'ជា សារ៉ា',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};

describe('DashboardView stats & backup reminder', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  it('displays class counts, today absences, top 3 monthly absentees, and turns backup reminder orange after 7 days', async () => {
    const todayKey = toLocalDateKey();
    const ym = todayKey.slice(0, 7);

    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    });

    const s1 = await db.students.add({
      classId,
      order: 1,
      studentId: 'KD-01',
      nameKm: 'កែវ ម៉ាលី',
      gender: 'ស្រី',
      dateOfBirth: '01/01/2013',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });
    const s2 = await db.students.add({
      classId,
      order: 2,
      studentId: 'KD-02',
      nameKm: 'ចាន់ ដារ៉ា',
      gender: 'ប្រុស',
      dateOfBirth: '02/01/2013',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });

    // Seed today's absence for s1 and 3 monthly absences for s1 vs 1 for s2
    await db.attendance.bulkPut([
      { classId, studentRef: s1, date: todayKey, status: 'អច្ប' },
      { classId, studentRef: s1, date: `${ym}-02`, status: 'ច្ប' },
      { classId, studentRef: s2, date: `${ym}-03`, status: 'ឈ' },
    ]);

    // Backup was 10 days ago -> overdue (>= 7 days -> orange card)
    const tenDaysAgo = Date.now() - 10 * 86_400_000;
    await setSetting('lastBackupAt', tenDaysAgo);

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: ym,
      useKhmerNumerals: false,
    });

    render(<DashboardView profile={TEST_PROFILE} />);

    await waitFor(() => {
      const card = screen.getByTestId('backup-reminder-card');
      expect(card.className).toContain('bg-orange-50');
      expect(card.textContent).toContain('10 ថ្ងៃមុន');
      expect(card.textContent).toContain('ថ្ងៃទី ');
      expect(card.textContent).toContain('ម៉ោង ');
      expect(screen.getAllByText('កែវ ម៉ាលី').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('today-absences-count').className).toContain('text-[#ff3b30]');
    });
  });

  it('shows 0 today absences in green and displays storage persistence helper when persisted() is false', async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    const persistedMock = vi.fn().mockResolvedValue(false);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: persistedMock, persist: persistMock },
    });

    useAppStore.setState({
      selectedClassId: null,
      useKhmerNumerals: false,
    });

    render(<DashboardView profile={TEST_PROFILE} />);

    await waitFor(() => {
      expect(screen.getByTestId('today-absences-count').className).toContain('text-[#34c759]');
      expect(screen.getByTestId('storage-persist-warning').textContent).toContain(
        'Chrome → Install KruDesk'
      );
    });

    fireEvent.click(screen.getByText('ស្នើសុំរក្សាទុកអចិន្ត្រៃយ៍'));
    await waitFor(() => {
      expect(persistMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('storage-persist-warning')).toBeNull();
    });
  });
});
