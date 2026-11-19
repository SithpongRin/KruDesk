// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualResultsSheet } from '../AnnualResultsSheet';
import { DEFAULT_SCORE_CONFIG, type Profile, type SchoolClass } from '../../types/domain';
import type { AnnualResultsSummary } from '../../lib/monthlyResults';

describe('AnnualResultsSheet', () => {
  it('renders all annual table columns, summary counts, and failure note', () => {
    const cls: SchoolClass = {
      id: 1,
      name: '៨ក',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    };
    const profile: Profile = {
      teacherName: 'សុខ ដារ៉ា',
      schoolName: 'វិទ្យាល័យ កំពង់',
      directorName: 'ជា សារ៉ា',
      province: 'កណ្ដាល',
      academicYear: '2026-2027',
    };
    const summary: AnnualResultsSummary = {
      rows: [
        {
          student: {
            id: 1,
            classId: 1,
            order: 1,
            studentId: 'KD-01',
            nameKm: 'កែវ ម៉ាលី',
            gender: 'ស្រី',
            dateOfBirth: '01/01/2013',
            status: 'active',
            createdAt: 1,
            updatedAt: 1,
          },
          sem1Avg: 29.79,
          sem2Avg: 30.93,
          annualAvg: 30.36,
          rank: 1,
          grade: 'D',
          passed: false,
          failedByAbsenceOnly: true,
          attendance: {
            present: 0,
            excused: 2,
            unexcused: 35,
            total: 37,
            sickCount: 0,
            takenDaysCount: 37,
          },
          note: 'អវត្តមានលើសកំណត់',
        },
      ],
      totalStudents: 1,
      femaleStudents: 1,
      gradeCounts: {
        A: { total: 0, female: 0 },
        B: { total: 0, female: 0 },
        C: { total: 0, female: 0 },
        D: { total: 1, female: 1 },
        E: { total: 0, female: 0 },
        F: { total: 0, female: 0 },
      },
      failedCount: { total: 1, female: 1 },
    };

    const { container } = render(
      <AnnualResultsSheet
        cls={cls}
        profile={profile}
        summary={summary}
        scoreConfig={DEFAULT_SCORE_CONFIG}
        signOptions={{
          month: '2027-07',
          lunarDate: '',
          place: 'កណ្ដាល',
          gregorianDate: '2027-07-30',
        }}
        useKhmerDigits={false}
      />
    );

    const text = container.textContent ?? '';
    expect(text).toContain('តារាងលទ្ធផលពិន្ទុសិស្សថ្នាក់ទី ៨ក');
    expect(text).toContain('ប្រចាំឆមាសទី ១');
    expect(text).toContain('ប្រចាំឆមាសទី ២');
    expect(text).toContain('មធ្យម');
    expect(text).toContain('ចំណាត់ថ្នាក់');
    expect(text).toContain('និទ្ទេស');
    expect(text).toContain('លទ្ធផល');
    expect(text).toContain('ចំនួនអវត្តមាន');
    expect(text).toContain('ផ្សេងៗ');
    expect(screen.getByText('អវត្តមានលើសកំណត់')).toBeTruthy();
    expect(text).toContain('សិស្សធ្លាក់: 1 នាក់, ស្រី 1 នាក់');
  });
});
