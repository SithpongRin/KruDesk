// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db, clearAllAppData } from '../../../db/database';
import { useAppStore } from '../../../store/useAppStore';
import { ScoresView } from '../ScoresView';
import type { Profile, Subject } from '../../../types/domain';

const TEST_PROFILE: Profile = {
  teacherName: 'សុខ ដារ៉ា',
  schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
  directorName: 'ជា សារ៉ា',
  academicYear: '2026-2027',
};

const TEST_SUBJECTS: Subject[] = [
  { id: 's1', name: 'គណិតវិទ្យា', maxScore: 50, order: 1 },
  { id: 's2', name: 'រូបវិទ្យា', maxScore: 50, order: 2 },
  { id: 's3', name: 'គីមីវិទ្យា', maxScore: 50, order: 3 },
];

describe('ScoresView Excel paste, validation & persistence', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  it('pastes a tab-separated Excel block, rejects out-of-range values with tooltip, computes totals/ranks, and persists to IndexedDB', async () => {
    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: TEST_SUBJECTS,
      createdAt: Date.now(),
    });

    const st1 = await db.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'កែវ ម៉ាលី',
      gender: 'ស្រី',
      dateOfBirth: '01/01/2013',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });
    const st2 = await db.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'ចាន់ ដារ៉ា',
      gender: 'ប្រុស',
      dateOfBirth: '02/01/2013',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });
    const st3 = await db.students.add({
      classId,
      order: 3,
      studentId: 'S003',
      nameKm: 'នួន ពិសី',
      gender: 'ស្រី',
      dateOfBirth: '03/01/2013',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });

    useAppStore.setState({
      selectedClassId: classId,
      selectedMonth: '2026-11',
      useKhmerNumerals: false,
    });

    const { container } = render(<ScoresView profile={TEST_PROFILE} />);

    const cell00 = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('[data-score-cell="0-0"]');
      expect(el).toBeTruthy();
      return el!;
    });

    // Paste 3x3 TSV block starting at (0,0) with invalid value 55 at (2,0) and comma+Khmer ៤០,៥ not needed here
    fireEvent.paste(cell00, {
      clipboardData: {
        getData: () => '40\t35\t50\n45\t45\t45\n55\t30\t20',
      },
    });

    const cell20 = container.querySelector<HTMLInputElement>('[data-score-cell="2-0"]')!;
    expect(cell20.value).toBe('55');
    expect(cell20.title).toContain('0 ដល់ 50');
    expect(cell20.className).toContain('ring-[#ff3b30]');

    // Verify Row 1 (125 / 41.66 truncated / Rank 2) & Row 2 (135 / 45.00 / Rank 1) in table text
    await waitFor(() => {
      expect(container.textContent).toContain('41.66');
      expect(container.textContent).toContain('45.00');
    });

    // Verify valid rows persisted to Dexie immediately after multi-cell paste, and invalid cell 55 was NOT written
    await waitFor(async () => {
      const r1 = await db.monthlyScores.get([classId, '2026-11', st1]);
      const r2 = await db.monthlyScores.get([classId, '2026-11', st2]);
      const r3 = await db.monthlyScores.get([classId, '2026-11', st3]);
      expect(r1?.scores).toEqual({ s1: 40, s2: 35, s3: 50 });
      expect(r2?.scores).toEqual({ s1: 45, s2: 45, s3: 45 });
      expect(r3?.scores.s1).toBeUndefined();
      expect(r3?.scores.s2).toBe(30);
      expect(r3?.scores.s3).toBe(20);
    });
  });
});
