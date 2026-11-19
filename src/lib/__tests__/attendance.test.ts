import { describe, it, expect } from 'vitest';
import {
  buildAttendanceLookup,
  canTakeRollCallDate,
  computeDailyAbsenceTotals,
  computeStudentMonthlyAttendance,
  cycleAbsenceCode,
  getActiveStudentsOrdered,
  getDaysInMonth,
  getMonthDayInfos,
  isStudentActiveInMonth,
} from '../attendance';
import { toLocalDateKey } from '../khmerDate';
import type { Student } from '../../types/domain';

describe('Local date keys (UTC+7 safe)', () => {
  it('builds YYYY-MM-DD from local year/month/day, avoiding UTC shift before 7:00 AM', () => {
    // Local 00:30 AM on Nov 18, 2026 (in UTC+7 that would be Nov 17 17:30Z in toISOString)
    const earlyMorning = new Date(2026, 10, 18, 0, 30, 0);
    expect(toLocalDateKey(earlyMorning)).toBe('2026-11-18');
  });
});

describe('Attendance pure logic', () => {
  it('handles 28, 29, 30, and 31-day months including leap years', () => {
    expect(getDaysInMonth(2026, 2)).toBe(28);
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2000, 2)).toBe(29);
    expect(getDaysInMonth(1900, 2)).toBe(28);
    expect(getDaysInMonth(2026, 11)).toBe(30);
    expect(getDaysInMonth(2026, 12)).toBe(31);
  });

  it('cycles absence codes ✓ → ច្ប → អច្ប → ឈ → ✓', () => {
    expect(cycleAbsenceCode(null)).toBe('ច្ប');
    expect(cycleAbsenceCode('ច្ប')).toBe('អច្ប');
    expect(cycleAbsenceCode('អច្ប')).toBe('ឈ');
    expect(cycleAbsenceCode('ឈ')).toBeNull();
  });

  it('excludes rest days, holidays, and future days, and counts ឈ inside ច្ប totals', () => {
    // November 2026: Nov 1 = Sunday (rest day), Nov 9 = Independence Day (holiday)
    const takenDates = new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-16']);
    const dayInfos = getMonthDayInfos(2026, 11, {
      restWeekdays: [0],
      holidayDates: new Set(['2026-11-09']),
      todayKey: '2026-11-16',
      takenDates,
    });

    expect(dayInfos).toHaveLength(30);
    expect(dayInfos[0].isRestDay).toBe(true); // 2026-11-01 Sunday
    expect(dayInfos[0].isCountable).toBe(false);
    expect(dayInfos[8].isHoliday).toBe(true); // 2026-11-09 Holiday
    expect(dayInfos[8].isCountable).toBe(false);
    expect(dayInfos[5].isTaken).toBe(false); // 2026-11-06 school day NOT taken
    expect(dayInfos[5].isCountable).toBe(false);
    expect(dayInfos[14].isRestDay).toBe(true); // 2026-11-15 Sunday
    expect(dayInfos[15].dateKey).toBe('2026-11-16'); // Monday (taken)
    expect(dayInfos[15].isFuture).toBe(false);
    expect(dayInfos[15].isTaken).toBe(true);
    expect(dayInfos[15].isCountable).toBe(true);
    expect(dayInfos[16].isFuture).toBe(true); // 2026-11-17 Future
    expect(dayInfos[16].isCountable).toBe(false);

    const lookup = buildAttendanceLookup([
      // Counted days (taken):
      { classId: 1, studentRef: 10, date: '2026-11-02', status: 'ច្ប' },
      { classId: 1, studentRef: 10, date: '2026-11-03', status: 'ឈ' },
      { classId: 1, studentRef: 10, date: '2026-11-04', status: 'ឈ' },
      { classId: 1, studentRef: 10, date: '2026-11-05', status: 'អច្ប' },
      // Should NOT be counted (Sunday, Holiday, Future, and Untaken day 2026-11-06):
      { classId: 1, studentRef: 10, date: '2026-11-01', status: 'អច្ប' },
      { classId: 1, studentRef: 10, date: '2026-11-06', status: 'អច្ប' },
      { classId: 1, studentRef: 10, date: '2026-11-09', status: 'ច្ប' },
      { classId: 1, studentRef: 10, date: '2026-11-20', status: 'អច្ប' },
    ]);

    const summary = computeStudentMonthlyAttendance(10, lookup, dayInfos);
    // 5 taken days total: ច្ប = 1 (ច្ប) + 2 (ឈ) = 3; អច្ប = 1; សរុប = 4; មក = 5 - 4 = 1
    expect(summary).toEqual({
      excused: 3,
      unexcused: 1,
      total: 4,
      sickCount: 2,
      present: 1,
      takenDaysCount: 5,
    });
  });

  it('filters only active students in order and computes daily totals', () => {
    const students: Student[] = [
      {
        id: 1,
        classId: 1,
        order: 1,
        studentId: 'S1',
        nameKm: 'ក',
        gender: 'ប្រុស',
        dateOfBirth: '01/01/2013',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 2,
        classId: 1,
        order: 2,
        studentId: 'S2',
        nameKm: 'ខ',
        gender: 'ស្រី',
        dateOfBirth: '01/01/2013',
        status: 'dropped',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 3,
        classId: 1,
        order: 3,
        studentId: 'S3',
        nameKm: 'គ',
        gender: 'ស្រី',
        dateOfBirth: '01/01/2013',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const active = getActiveStudentsOrdered(students);
    expect(active.map((s) => s.id)).toEqual([1, 3]);

    const dayInfos = getMonthDayInfos(2026, 11, {
      restWeekdays: [0],
      holidayDates: new Set(),
      todayKey: '2026-11-10',
      takenDates: new Set(['2026-11-02', '2026-11-03']),
    });

    const lookup = buildAttendanceLookup([
      { classId: 1, studentRef: 1, date: '2026-11-02', status: 'ច្ប' },
      { classId: 1, studentRef: 3, date: '2026-11-02', status: 'ឈ' },
      { classId: 1, studentRef: 2, date: '2026-11-02', status: 'អច្ប' }, // dropped -> ignored
    ]);

    const daily = computeDailyAbsenceTotals(active, lookup, dayInfos);
    expect(daily[0]).toBeNull(); // Nov 1 Sunday
    expect(daily[1]).toBe(2); // Nov 2: taken, students 1 and 3
    expect(daily[2]).toBe(0); // Nov 3: taken, 0 absences
    expect(daily[3]).toBeNull(); // Nov 4: school day NOT taken -> null
    expect(daily[15]).toBeNull(); // Nov 16 future
  });

  it('keeps dropped/transferred students visible through the month they left and excludes later months', () => {
    const novChange = new Date(2026, 10, 20, 12, 0, 0).getTime(); // 2026-11-20
    const students: Student[] = [
      {
        id: 1,
        classId: 1,
        order: 1,
        studentId: 'S1',
        nameKm: 'ក',
        gender: 'ប្រុស',
        dateOfBirth: '01/01/2013',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 2,
        classId: 1,
        order: 2,
        studentId: 'S2',
        nameKm: 'ខ',
        gender: 'ស្រី',
        dateOfBirth: '01/01/2013',
        status: 'dropped',
        statusChangedAt: novChange,
        createdAt: 1,
        updatedAt: novChange,
      },
    ];

    expect(isStudentActiveInMonth(students[1], '2026-10')).toBe(true);
    expect(isStudentActiveInMonth(students[1], '2026-11')).toBe(true);
    expect(isStudentActiveInMonth(students[1], '2026-12')).toBe(false);
    expect(getActiveStudentsOrdered(students, '2026-10').map((s) => s.id)).toEqual([1, 2]);
    expect(getActiveStudentsOrdered(students, '2026-11').map((s) => s.id)).toEqual([1, 2]);
    expect(getActiveStudentsOrdered(students, '2026-12').map((s) => s.id)).toEqual([1]);
  });

  it('rejects rest days, holidays, and future dates in canTakeRollCallDate', () => {
    const opts = {
      restWeekdays: [0], // Sunday
      holidayDates: new Set(['2026-11-09']),
      todayKey: '2026-11-16',
    };
    expect(canTakeRollCallDate('2026-11-15', opts)).toEqual({ allowed: false, reason: 'rest' });
    expect(canTakeRollCallDate('2026-11-09', opts)).toEqual({ allowed: false, reason: 'holiday' });
    expect(canTakeRollCallDate('2026-11-17', opts)).toEqual({ allowed: false, reason: 'future' });
    expect(canTakeRollCallDate('2026-11-16', opts)).toEqual({ allowed: true });
    expect(canTakeRollCallDate('2026-11-02', opts)).toEqual({ allowed: true });
  });
});
