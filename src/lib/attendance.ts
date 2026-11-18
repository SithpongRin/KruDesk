import type { AbsenceCode, Attendance, Student } from '../types/domain';
import { formatDateKey, formatYearMonth } from './khmerDate';
import { compareKhmerNames } from './khmerSort';

export interface MonthDayInfo {
  day: number;
  dateKey: string; // YYYY-MM-DD
  weekday: number; // 0 = Sun .. 6 = Sat
  isRestDay: boolean;
  isHoliday: boolean;
  isFuture: boolean;
  isNonSchoolDay: boolean; // rest day or holiday (grey/disabled)
  isCountable: boolean; // !isNonSchoolDay && !isFuture
}

export interface AttendanceMonthOptions {
  restWeekdays: number[];
  holidayDates: Set<string>;
  todayKey: string;
}

export interface StudentAttendanceSummary {
  excused: number; // ច្ប + ឈ
  unexcused: number; // អច្ប
  total: number; // excused + unexcused
  sickCount: number; // ឈ
}

export function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

export function getMonthDayInfos(
  year: number,
  month1Based: number,
  options: AttendanceMonthOptions
): MonthDayInfo[] {
  const days = getDaysInMonth(year, month1Based);
  const restSet = new Set(options.restWeekdays);
  const result: MonthDayInfo[] = [];

  for (let day = 1; day <= days; day++) {
    const dateKey = formatDateKey(year, month1Based, day);
    const weekday = new Date(year, month1Based - 1, day).getDay();
    const isRestDay = restSet.has(weekday);
    const isHoliday = options.holidayDates.has(dateKey);
    const isFuture = dateKey > options.todayKey;
    const isNonSchoolDay = isRestDay || isHoliday;
    const isCountable = !isNonSchoolDay && !isFuture;

    result.push({
      day,
      dateKey,
      weekday,
      isRestDay,
      isHoliday,
      isFuture,
      isNonSchoolDay,
      isCountable,
    });
  }

  return result;
}

export function cycleAbsenceCode(current: AbsenceCode | null | undefined): AbsenceCode | null {
  if (!current) return 'ច្ប';
  if (current === 'ច្ប') return 'អច្ប';
  if (current === 'អច្ប') return 'ឈ';
  return null;
}

export function makeAttendanceCellKey(studentRef: number, dateKey: string): string {
  return `${studentRef}|${dateKey}`;
}

export function buildAttendanceLookup(rows: Attendance[]): Map<string, AbsenceCode> {
  const map = new Map<string, AbsenceCode>();
  for (const r of rows) {
    map.set(makeAttendanceCellKey(r.studentRef, r.date), r.status);
  }
  return map;
}

export function isStudentActiveInMonth(student: Student, yearMonth: string): boolean {
  if (student.status === 'active') return true;
  if (!student.statusChangedAt) return false;
  const changedYm = formatYearMonth(new Date(student.statusChangedAt));
  return yearMonth <= changedYm;
}

export function getActiveStudentsOrdered(students: Student[], yearMonth?: string): Student[] {
  return students
    .filter((s) => (yearMonth ? isStudentActiveInMonth(s, yearMonth) : s.status === 'active'))
    .sort(
      (a, b) =>
        a.order - b.order ||
        compareKhmerNames(a.nameKm, b.nameKm) ||
        a.studentId.localeCompare(b.studentId)
    );
}

export function computeStudentMonthlyAttendance(
  studentRef: number,
  lookup: Map<string, AbsenceCode>,
  dayInfos: MonthDayInfo[]
): StudentAttendanceSummary {
  let excusedLeave = 0;
  let sickCount = 0;
  let unexcused = 0;

  for (const d of dayInfos) {
    if (!d.isCountable) continue;
    const code = lookup.get(makeAttendanceCellKey(studentRef, d.dateKey));
    if (code === 'ច្ប') excusedLeave++;
    else if (code === 'ឈ') sickCount++;
    else if (code === 'អច្ប') unexcused++;
  }

  const excused = excusedLeave + sickCount;
  return {
    excused,
    unexcused,
    total: excused + unexcused,
    sickCount,
  };
}

export function computeDailyAbsenceTotals(
  activeStudents: Student[],
  lookup: Map<string, AbsenceCode>,
  dayInfos: MonthDayInfo[]
): (number | null)[] {
  return dayInfos.map((d) => {
    if (!d.isCountable) return null;
    let count = 0;
    for (const s of activeStudents) {
      if (s.id === undefined) continue;
      if (lookup.has(makeAttendanceCellKey(s.id, d.dateKey))) {
        count++;
      }
    }
    return count;
  });
}
