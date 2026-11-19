// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db, clearAllAppData } from '../../../db/database';
import { useAppStore } from '../../../store/useAppStore';
import { toLocalDateKey } from '../../../lib/khmerDate';
import { AttendanceView } from '../AttendanceView';
import type { Profile } from '../../../types/domain';

const TEST_PROFILE: Profile = {
  teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
  schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
  directorName: 'ជា សារ៉ា',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};

function findRecentWeekdayDateKey(base: Date): string {
  // Pick a non-Sunday date <= base so Sunday rest-day guard never blocks the test
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (d.getDay() === 0) {
    d.setDate(d.getDate() - 1);
  }
  return toLocalDateKey(d);
}

describe('AttendanceView Roll Call & Session workflow', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps draft unsaved until Save, writes session+absences atomically, shows មក in grid, and deletes cleanly', async () => {
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

    const testDate = findRecentWeekdayDateKey(new Date());
    const testYm = testDate.slice(0, 7);

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: testYm,
      useKhmerNumerals: false,
      pendingRollCallDate: testDate,
    });

    const { container } = render(<AttendanceView profile={TEST_PROFILE} />);

    // Wait for Roll Call students & initial liveQuery sync; mark student 1 as អច្ប WITHOUT clicking Save
    const s1AbsentBtn = await waitFor(() => {
      const btn = container.querySelector<HTMLButtonElement>(`[data-rollcall-btn="${s1}-អច្ប"]`);
      expect(btn).toBeTruthy();
      expect(screen.getByText('មិនទាន់ហៅឈ្មោះ (ព្រាង)')).toBeTruthy();
      return btn!;
    });

    fireEvent.click(s1AbsentBtn);

    await waitFor(() => {
      expect(screen.getByText('មានការកែប្រែមិនទាន់រក្សាទុក')).toBeTruthy();
    });

    // Draft must NOT write to DB until Save is pressed
    expect(await db.attendanceSessions.toArray()).toHaveLength(0);
    expect(await db.attendance.toArray()).toHaveLength(0);

    // Trying to switch to Monthly Grid warns about unsaved changes
    fireEvent.click(screen.getByText('តារាងប្រចាំខែ'));
    await waitFor(() => {
      expect(screen.getByText('មិនទាន់បានរក្សាទុកការហៅឈ្មោះ')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('ត្រឡប់ក្រោយ'));

    // Click Save -> writes session + 1 absence in 1 transaction
    fireEvent.click(screen.getByText('រក្សាទុក'));

    await waitFor(async () => {
      const sessions = await db.attendanceSessions.toArray();
      const rows = await db.attendance.toArray();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].date).toBe(testDate);
      expect(rows).toHaveLength(1);
      expect(rows[0].studentRef).toBe(s1);
      expect(rows[0].status).toBe('អច្ប');
    });

    // Switch to Monthly Grid -> shows taken days = 1, ✓ only for s2 on testDate, empty on untaken days
    fireEvent.click(screen.getByText('តារាងប្រចាំខែ'));

    await waitFor(() => {
      expect(screen.getByTestId('taken-days-banner').textContent).toContain('1 ថ្ងៃ');
    });

    // Click a taken cell -> opens Roll Call for that date
    const cells = container.querySelectorAll<HTMLButtonElement>('[data-att-cell]');
    const takenCellWithAbsence = Array.from(cells).find((c) => c.textContent?.trim() === 'អច្ប');
    expect(takenCellWithAbsence).toBeTruthy();
    // Present count '✓' appears only once (for s2 on the single taken day; untaken days have no ✓)
    const presentCheckCells = Array.from(cells).filter((c) => c.textContent?.trim() === '✓');
    expect(presentCheckCells).toHaveLength(1);

    fireEvent.click(takenCellWithAbsence!);

    // Back in Roll Call: Delete session removes both session and absence rows
    await waitFor(() => {
      expect(screen.getByText('លុបការហៅឈ្មោះថ្ងៃនេះ')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('លុបការហៅឈ្មោះថ្ងៃនេះ'));
    fireEvent.click(screen.getByText('លុបចោល'));

    await waitFor(async () => {
      expect(await db.attendanceSessions.toArray()).toHaveLength(0);
      expect(await db.attendance.toArray()).toHaveLength(0);
    });
    void s2;
  });

  it('shows only the blocking banner on Sunday and future dates without draft badges or subtitle', async () => {
    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    });

    const today = new Date();
    const lastSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay());
    const sundayKey = toLocalDateKey(lastSunday);

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: sundayKey.slice(0, 7),
      useKhmerNumerals: false,
      pendingRollCallDate: sundayKey,
    });

    render(<AttendanceView profile={TEST_PROFILE} />);

    await waitFor(() => {
      expect(screen.getByTestId('rollcall-blocked-banner')).toBeTruthy();
    });
    expect(screen.queryByText('មិនទាន់ហៅឈ្មោះ (ព្រាង)')).toBeNull();
    expect(
      screen.queryByText('មិនទាន់ហៅឈ្មោះសម្រាប់ថ្ងៃនេះទេ (ព្រាង — មិនទាន់រក្សាទុក)')
    ).toBeNull();

    // Future date
    cleanup();
    const future = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    const futureKey = toLocalDateKey(future);

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: futureKey.slice(0, 7),
      useKhmerNumerals: false,
      pendingRollCallDate: futureKey,
    });

    render(<AttendanceView profile={TEST_PROFILE} />);

    await waitFor(() => {
      expect(screen.getByTestId('rollcall-blocked-banner')).toBeTruthy();
    });
    expect(screen.queryByText('មិនទាន់ហៅឈ្មោះ (ព្រាង)')).toBeNull();
    expect(
      screen.queryByText('មិនទាន់ហៅឈ្មោះសម្រាប់ថ្ងៃនេះទេ (ព្រាង — មិនទាន់រក្សាទុក)')
    ).toBeNull();
  });

  it('renders migrated subtitle without time and normal subtitle with time', async () => {
    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    });

    const d1 = new Date();
    if (d1.getDay() === 0) d1.setDate(d1.getDate() - 1);
    const migratedDate = toLocalDateKey(d1);

    const d2 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() - 1);
    if (d2.getDay() === 0) d2.setDate(d2.getDate() - 1);
    const normalDate = toLocalDateKey(d2);

    await db.attendanceSessions.bulkPut([
      { classId, date: migratedDate, savedAt: 1731800000000, migrated: true },
      { classId, date: normalDate, savedAt: 1731900000000 },
    ]);

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: migratedDate.slice(0, 7),
      useKhmerNumerals: false,
      pendingRollCallDate: migratedDate,
    });

    render(<AttendanceView profile={TEST_PROFILE} />);

    await waitFor(() => {
      expect(screen.getByText('បានរក្សាទុក (ពីទិន្នន័យចាស់)')).toBeTruthy();
    });
    expect(screen.queryByText(/បានរក្សាទុកនៅ/)).toBeNull();

    cleanup();
    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: normalDate.slice(0, 7),
      useKhmerNumerals: false,
      pendingRollCallDate: normalDate,
    });

    render(<AttendanceView profile={TEST_PROFILE} />);

    await waitFor(() => {
      expect(screen.getByText(/បានរក្សាទុកនៅ/)).toBeTruthy();
    });
    expect(screen.queryByText('បានរក្សាទុក (ពីទិន្នន័យចាស់)')).toBeNull();
  });
});
