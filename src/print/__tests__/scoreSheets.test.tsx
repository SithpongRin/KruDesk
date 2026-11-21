// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MonthlyScoreSheet } from '../MonthlyScoreSheet';
import { SemesterSheet } from '../SemesterSheet';
import { createGrade9Subjects } from '../../db/presets';
import {
  collapseGroupedSubjects,
  isSubjectActive,
  sortSubjects,
  type SemesterStudentSummary,
} from '../../lib/grading';
import { DEFAULT_SCORE_CONFIG, type Profile, type SchoolClass, type Student } from '../../types/domain';

const TEST_PROFILE: Profile = {
  teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
  schoolName: 'អនុវិទ្យាល័យ គំរូ',
  directorName: 'ជា សារ៉ា',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};

function makeClass(): SchoolClass {
  return {
    id: 1,
    name: '8A',
    gradeLevel: 8,
    academicYear: '2026-2027',
    color: '#0071e3',
    subjects: createGrade9Subjects(),
    createdAt: 1,
  };
}

function makeStudents(count: number): Student[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    classId: 1,
    order: idx + 1,
    studentId: `S-${1001 + idx}`,
    nameKm: `សិស្សគំរូ ទី${idx + 1}`,
    gender: idx % 2 === 0 ? 'ស្រី' : 'ប្រុស',
    dateOfBirth: '01/01/2013',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
  }));
}

describe('MonthlyScoreSheet & SemesterSheet active subject filtering and layout', () => {
  afterEach(() => {
    cleanup();
  });

  it('MonthlyScoreSheet renders ONLY active subjects, uses readable >=8pt table font for 39 students, and places signature right below the table', () => {
    const cls = makeClass();
    const students = makeStudents(39);
    const activeSubjects = sortSubjects(cls.subjects).filter(isSubjectActive);
    const inactiveSubjects = cls.subjects.filter((s) => !isSubjectActive(s));
    expect(inactiveSubjects.length).toBeGreaterThan(0);

    const { container } = render(
      <MonthlyScoreSheet
        cls={cls}
        students={students}
        profile={TEST_PROFILE}
        scoreConfig={DEFAULT_SCORE_CONFIG}
        sheets={[
          {
            id: '2026-11',
            title: 'បញ្ជីពិន្ទុប្រចាំខែ',
            periodLabel: 'ខែ វិច្ឆិកា ឆ្នាំ 2026',
            monthKey: '2026-11',
            scoresByStudent: new Map(),
          },
        ]}
      />
    );

    const pageEl = container.querySelector('[data-print-page]') as HTMLElement;
    expect(pageEl).toBeTruthy();
    // Signature must NOT be pushed to the bottom margin with space-between
    expect(pageEl.style.justifyContent).not.toBe('space-between');

    const text = container.textContent ?? '';
    for (const active of activeSubjects) {
      expect(text).toContain(active.name);
    }
    for (const inactive of inactiveSubjects) {
      expect(text).not.toContain(inactive.name);
    }

    // Score table should have 4 leading cols + activeSubjects.length + 4 summary cols
    const bodyRows = container.querySelectorAll('table.w-full tbody tr');
    expect(bodyRows.length).toBe(39);
    const firstRowCells = bodyRows[0].querySelectorAll('td');
    expect(firstRowCells.length).toBe(4 + activeSubjects.length + 4);

    // Readable table font size (>= 8pt for 39 rows)
    const table = container.querySelector('table.w-full') as HTMLElement;
    expect(parseFloat(table.style.fontSize)).toBeGreaterThanOrEqual(8);

    // Signature block font size >= 9.5pt
    const sigGrid = Array.from(container.querySelectorAll('div')).find((el) =>
      el.style.gridTemplateColumns.includes('1fr auto 1fr')
    ) as HTMLElement | undefined;
    expect(sigGrid).toBeTruthy();
    expect(parseFloat(sigGrid!.style.fontSize)).toBeGreaterThanOrEqual(9.5);
  });

  it('SemesterSheet renders ONLY active collapsed subjects and does not push signature to bottom edge', () => {
    const cls = makeClass();
    const students = makeStudents(12);
    const activeCollapsed = collapseGroupedSubjects(cls.subjects.filter(isSubjectActive));
    const inactiveSubjects = cls.subjects.filter((s) => !isSubjectActive(s));

    const summaries: SemesterStudentSummary[] = students.map((student) => ({
      student,
      sem1ExamScores: {},
      sem1SubjectRanks: {},
      sem1ExamTotal: null,
      sem1MonthlySum: null,
      sem1MonthlyAvg: null,
      sem1ExamAvg: null,
      sem1Total: null,
      sem1Avg: null,
      sem1Rank: null,
      sem1Grade: null,
      sem2ExamScores: {},
      sem2SubjectRanks: {},
      sem2ExamTotal: null,
      sem2MonthlySum: null,
      sem2MonthlyAvg: null,
      sem2ExamAvg: null,
      sem2Total: null,
      sem2Avg: null,
      sem2Rank: null,
      sem2Grade: null,
      annualAvg: null,
      annualRank: null,
      annualPassed: null,
      annualGrade: null,
    }));

    const { container } = render(
      <SemesterSheet
        cls={cls}
        profile={TEST_PROFILE}
        summaries={summaries}
        scoreConfig={DEFAULT_SCORE_CONFIG}
        paperSize="A4"
      />
    );

    const pages = Array.from(container.querySelectorAll('[data-print-page]')) as HTMLElement[];
    expect(pages.length).toBe(2);
    for (const page of pages) {
      expect(page.style.justifyContent).not.toBe('space-between');
    }

    const text = container.textContent ?? '';
    for (const active of activeCollapsed) {
      expect(text).toContain(active.name);
    }
    for (const inactive of inactiveSubjects) {
      expect(text).not.toContain(inactive.name);
    }

    // Page 1 row cells: 3 student cols + activeCollapsed.length * 2 + 5 sem1 summary cols
    const p1RowCells = pages[0].querySelectorAll('table.w-full tbody tr:first-child td');
    expect(p1RowCells.length).toBe(3 + activeCollapsed.length * 2 + 5);
  });

  it('MonthlyScoreSheet supports A4 portrait orientation (210mm x 297mm) with readable fonts and active subjects only', () => {
    const cls = makeClass();
    const students = makeStudents(39);
    const activeSubjects = sortSubjects(cls.subjects).filter(isSubjectActive);

    const { container } = render(
      <MonthlyScoreSheet
        cls={cls}
        students={students}
        profile={TEST_PROFILE}
        scoreConfig={DEFAULT_SCORE_CONFIG}
        orientation="portrait"
        sheets={[
          {
            id: '2026-11',
            title: 'បញ្ជីពិន្ទុប្រចាំខែ',
            periodLabel: 'ខែ វិច្ឆិកា ឆ្នាំ 2026',
            monthKey: '2026-11',
            scoresByStudent: new Map(),
          },
        ]}
      />
    );

    const pageEl = container.querySelector('[data-print-page]') as HTMLElement;
    expect(pageEl).toBeTruthy();
    expect(pageEl.style.width).toBe('210mm');
    expect(pageEl.style.height).toBe('297mm');
    expect(pageEl.style.justifyContent).not.toBe('space-between');

    const firstRowCells = container.querySelectorAll('table.w-full tbody tr:first-child td');
    expect(firstRowCells.length).toBe(4 + activeSubjects.length + 4);
  });
});
