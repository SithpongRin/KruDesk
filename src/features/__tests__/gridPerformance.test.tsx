// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db, clearAllAppData } from '../../db/database';
import { createLowerSecondarySubjects } from '../../db/presets';
import { useAppStore } from '../../store/useAppStore';
import { AttendanceView } from '../attendance/AttendanceView';
import { ScoresView } from '../scores/ScoresView';
import type { Profile } from '../../types/domain';

const TEST_PROFILE: Profile = {
  teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
  schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
  directorName: 'ជា សារ៉ា',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};

describe('Grid interaction performance at full 45-student scale', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  async function seed45Class(): Promise<number> {
    const subjects = createLowerSecondarySubjects(); // 19 subjects
    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects,
      createdAt: 1,
    });

    const students = Array.from({ length: 45 }, (_, i) => ({
      classId,
      order: i + 1,
      studentId: `KD-${String(i + 1).padStart(3, '0')}`,
      nameKm: `សិស្ស ទី${i + 1}`,
      gender: (i % 2 === 0 ? 'ប្រុស' : 'ស្រី') as 'ប្រុស' | 'ស្រី',
      dateOfBirth: '01/01/2013',
      status: 'active' as const,
      createdAt: 1,
      updatedAt: 1,
    }));
    await db.students.bulkAdd(students);

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: '2026-10', // 31 days (October 2026)
      pendingRollCallDate: '2026-10-15', // Past school day
      useKhmerNumerals: false,
    });
    return classId;
  }

  it('handles 45 students x 31 days attendance grid & roll call tap smoothly', async () => {
    const classId = await seed45Class();
    await db.attendanceSessions.put({ classId, date: '2026-10-01', savedAt: 1000 });
    const { container, getByText } = render(<AttendanceView profile={TEST_PROFILE} />);

    // 1. Wait for 45-student Roll Call list + initial query load to finish, then measure single tap latency
    const firstRollBtn = await waitFor(
      () => {
        expect(container.textContent).toContain('មិនទាន់ហៅឈ្មោះ (ព្រាង)');
        const btns = container.querySelectorAll<HTMLButtonElement>('[data-rollcall-btn$="-អច្ប"]');
        expect(btns.length).toBe(45);
        return btns[0];
      },
      { timeout: 4000 }
    );

    const t0 = performance.now();
    fireEvent.click(firstRollBtn);
    const t1 = performance.now();
    const latencyMs = t1 - t0;
    expect(latencyMs).toBeLessThan(250);
    console.info(`[PERF] 45-student Roll Call single tap latency: ${latencyMs.toFixed(2)} ms`);

    // Discard unsaved change if switching tab via ConfirmDialog
    fireEvent.click(getByText('តារាងប្រចាំខែ'));
    const discardBtn = await waitFor(() => getByText('បោះបង់ការកែប្រែ'));
    fireEvent.click(discardBtn);

    // 2. Verify 45x31 monthly grid renders smoothly
    await waitFor(() => {
      const cells = container.querySelectorAll<HTMLButtonElement>('[data-att-cell]');
      expect(cells.length).toBeGreaterThanOrEqual(45 * 20);
    });
  });

  it('handles 45 students x 19 subjects score entry smoothly', async () => {
    await seed45Class();
    const { container } = render(<ScoresView profile={TEST_PROFILE} />);

    const cell = await waitFor(() => {
      const cells = container.querySelectorAll<HTMLInputElement>('[data-score-cell]');
      // Lower-secondary preset has 15 active subjects (school documents) out of 19
      expect(cells.length).toBe(45 * 15);
      return cells[0];
    });

    const t0 = performance.now();
    fireEvent.change(cell, { target: { value: '32.5' } });
    const t1 = performance.now();
    const latencyMs = t1 - t0;

    expect(cell.value).toBe('32.5');
    expect(latencyMs).toBeLessThan(250);
    console.info(`[PERF] 45x19 Score single-cell input latency: ${latencyMs.toFixed(2)} ms`);
  });
});
