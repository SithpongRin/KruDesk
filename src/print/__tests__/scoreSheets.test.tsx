// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MonthlyScoreSheet } from '../MonthlyScoreSheet';
import { SemesterSheet } from '../SemesterSheet';
import { AttendanceSheet } from '../AttendanceSheet';
import { StudentListSheet } from '../StudentListSheet';
import { RosterSheet } from '../RosterSheet';
import { createGrade9Subjects } from '../../db/presets';
import {
  collapseGroupedSubjects,
  isSubjectActive,
  sortSubjects,
  type SemesterStudentSummary,
} from '../../lib/grading';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  DEFAULT_SCORE_CONFIG,
  type Profile,
  type SchoolClass,
  type Student,
} from '../../types/domain';

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

  it('MonthlyScoreSheet renders ONLY active subjects, centers លេខរៀងមុខវិជ្ជា, hides duplicate periodLabel in header, and keeps signature right below the table', () => {
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
            title: 'បញ្ជីពិន្ទុខែវិច្ឆិកា',
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
    expect(text).toContain('បញ្ជីពិន្ទុខែវិច្ឆិកា');
    expect(text).not.toContain('ខែ វិច្ឆិកា ឆ្នាំ 2026');
    for (const active of activeSubjects) {
      expect(text).toContain(active.name);
    }
    for (const inactive of inactiveSubjects) {
      expect(text).not.toContain(inactive.name);
    }

    // លេខរៀងមុខវិជ្ជា cell is centered
    const colNumLabel = Array.from(container.querySelectorAll('th')).find((th) =>
      th.textContent?.includes('លេខរៀងមុខវិជ្ជា')
    );
    expect(colNumLabel?.className).toContain('text-center');

    // Score table should have 4 leading cols + activeSubjects.length + 4 summary cols
    const bodyRows = container.querySelectorAll('table.w-full tbody tr');
    expect(bodyRows.length).toBe(39);
    const firstRowCells = bodyRows[0].querySelectorAll('td');
    expect(firstRowCells.length).toBe(4 + activeSubjects.length + 4);

    // Readable table font size (>= 7.5pt for 39 rows on landscape)
    const table = container.querySelector('table.w-full') as HTMLElement;
    expect(parseFloat(table.style.fontSize)).toBeGreaterThanOrEqual(7.5);

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

  it('AttendanceSheet widens name column (44mm), puts month in title, centers footer label, and places larger signature right below table', () => {
    const cls = makeClass();
    const students = makeStudents(39);

    const { container } = render(
      <AttendanceSheet
        cls={cls}
        students={students}
        profile={TEST_PROFILE}
        attendanceConfig={DEFAULT_ATTENDANCE_CONFIG}
        holidayDates={new Set()}
        todayKey="2026-11-21"
        monthsData={[
          {
            month: '2026-11',
            lookup: new Map(),
            takenDates: new Set(['2026-11-02']),
          },
        ]}
      />
    );

    const pageEl = container.querySelector('[data-print-page]') as HTMLElement;
    expect(pageEl.style.justifyContent).not.toBe('space-between');
    expect(container.textContent).toContain('បញ្ជីវត្តមានខែវិច្ឆិកា');

    const nameTh = Array.from(container.querySelectorAll('th')).find((th) =>
      th.textContent?.includes('គោត្តនាម និងនាម')
    ) as HTMLElement | undefined;
    expect(nameTh?.style.width).toBe('44mm');

    const table = container.querySelector('table.w-full') as HTMLElement;
    expect(parseFloat(table.style.fontSize)).toBeGreaterThanOrEqual(8);

    const sigGrid = Array.from(container.querySelectorAll('div')).find((el) =>
      el.style.gridTemplateColumns.includes('1fr auto 1fr')
    ) as HTMLElement | undefined;
    expect(parseFloat(sigGrid!.style.fontSize)).toBeGreaterThanOrEqual(9.5);
  });

  it('StudentListSheet and RosterSheet render readable fonts and keep signature right below the table', () => {
    const cls = makeClass();
    const students = makeStudents(10);

    const listRender = render(
      <StudentListSheet cls={cls} students={students} profile={TEST_PROFILE} />
    );
    const listPage = listRender.container.querySelector('[data-print-page]') as HTMLElement;
    expect(listPage.style.justifyContent).not.toBe('space-between');
    const listSig = Array.from(listRender.container.querySelectorAll('div')).find((el) =>
      el.style.gridTemplateColumns.includes('1fr auto 1fr')
    ) as HTMLElement | undefined;
    expect(parseFloat(listSig!.style.fontSize)).toBeGreaterThanOrEqual(10);
    cleanup();

    const rosterRender = render(
      <RosterSheet cls={cls} students={students} profile={TEST_PROFILE} />
    );
    const rosterPage = rosterRender.container.querySelector('[data-print-page]') as HTMLElement;
    expect(rosterPage.style.justifyContent).not.toBe('space-between');
    const rosterSig = Array.from(rosterRender.container.querySelectorAll('div')).find((el) =>
      el.style.gridTemplateColumns.includes('1fr auto 1fr')
    ) as HTMLElement | undefined;
    expect(parseFloat(rosterSig!.style.fontSize)).toBeGreaterThanOrEqual(10);
  });
});
