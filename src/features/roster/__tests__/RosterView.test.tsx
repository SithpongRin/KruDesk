// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { db, clearAllAppData } from '../../../db/database';
import { useAppStore } from '../../../store/useAppStore';
import { RosterView } from '../RosterView';
import type { Profile } from '../../../types/domain';

const TEST_PROFILE: Profile = {
  teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
  schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
  directorName: 'ជា សារ៉ា',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};

describe('RosterView («បញ្ជីហៅឈ្មោះ»)', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the 10 columns, hides dropped/transferred students, and shows active counts', async () => {
    const classId = await db.classes.add({
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    });

    await db.students.bulkAdd([
      {
        classId,
        order: 1,
        studentId: 'KD-01',
        nameKm: 'កែវ ម៉ាលី',
        gender: 'ស្រី',
        dateOfBirth: '01/02/2013',
        fatherName: 'កែវ សុខ',
        fatherOccupation: 'កសិករ',
        motherName: 'ចាន់ នី',
        motherOccupation: 'លក់ដូរ',
        address: 'ភូមិកំពង់',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        classId,
        order: 2,
        studentId: 'KD-02',
        nameKm: 'ខេម ដារ៉ា',
        gender: 'ប្រុស',
        dateOfBirth: '03/04/2013',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        classId,
        order: 3,
        studentId: 'KD-03',
        nameKm: 'សិស្ស ឈប់រៀន',
        gender: 'ប្រុស',
        dateOfBirth: '05/06/2013',
        status: 'dropped',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        classId,
        order: 4,
        studentId: 'KD-04',
        nameKm: 'សិស្ស ផ្ទេរចេញ',
        gender: 'ស្រី',
        dateOfBirth: '07/08/2013',
        status: 'transferred',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    useAppStore.setState({
      selectedClassId: classId,
      useKhmerNumerals: false,
    });

    render(<RosterView profile={TEST_PROFILE} />);

    await waitFor(() => {
      expect(screen.getByText('កែវ ម៉ាលី')).toBeTruthy();
    });

    // Verify exact 10 column headers
    const headers = Array.from(document.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim()
    );
    expect(headers).toEqual([
      'ល.រ',
      'អត្តលេខ',
      'គោត្តនាម និងនាម',
      'ភេទ',
      'ថ្ងៃខែឆ្នាំកំណើត',
      'ឈ្មោះឪពុក',
      'មុខរបរ (ឪពុក)',
      'ឈ្មោះម្តាយ',
      'មុខរបរ (ម្តាយ)',
      'ទីកន្លែងរស់នៅបច្ចុប្បន្ន',
    ]);

    // Active students shown, dropped/transferred hidden
    expect(screen.getByText('ខេម ដារ៉ា')).toBeTruthy();
    expect(screen.queryByText('សិស្ស ឈប់រៀន')).toBeNull();
    expect(screen.queryByText('សិស្ស ផ្ទេរចេញ')).toBeNull();

    // Parent details and fallback '—'
    expect(screen.getByText('កែវ សុខ')).toBeTruthy();
    expect(screen.getByText('កសិករ')).toBeTruthy();
    expect(screen.getByText('ចាន់ នី')).toBeTruthy();
    expect(screen.getByText('លក់ដូរ')).toBeTruthy();
    expect(screen.getByText('ភូមិកំពង់')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);

    // Counts reflect active students only (1 male, 1 female, 2 total)
    expect(screen.getByText('ប្រុស 1')).toBeTruthy();
    expect(screen.getByText('ស្រី 1')).toBeTruthy();
    expect(screen.getByText('សរុប 2')).toBeTruthy();
  });
});
