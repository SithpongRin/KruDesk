import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';

export const KHMER_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
] as const;

export function getKhmerMonthName(monthIndex1Based: number): string {
  return KHMER_MONTHS[monthIndex1Based - 1] || '';
}

export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateKey(year: number, month1Based: number, day: number): string {
  const m = String(month1Based).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function formatYearMonth(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(mStr) || 1));
  return { year, month };
}

export function formatKhmerMonthYear(ym: string, useKhmerDigits = false): string {
  const { year, month } = parseYearMonth(ym);
  const monthName = getKhmerMonthName(month);
  const yearStr = useKhmerDigits ? toKhmerNumerals(year) : String(year);
  return `${monthName} ${yearStr}`;
}

export function formatDateTimeKm(timestamp: number, useKhmerDigits = false): string {
  const d = new Date(timestamp);
  const day = d.getDate();
  const monthName = getKhmerMonthName(d.getMonth() + 1);
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const raw = `ថ្ងៃទី ${day} ${monthName} ${year} ម៉ោង ${hh}:${mm}`;
  return useKhmerDigits ? toKhmerNumerals(raw) : raw;
}

export function daysAgo(timestamp: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - timestamp) / (1000 * 60 * 60 * 24)));
}

export function parseAcademicYearSpan(academicYear: string): {
  startYear: number;
  endYear: number;
} {
  const normalized = toArabicNumerals(academicYear || '');
  const match = normalized.match(/(\d{4})\s*[-–/]\s*(\d{4})/);
  if (match) {
    return { startYear: Number(match[1]), endYear: Number(match[2]) };
  }
  const single = normalized.match(/(\d{4})/);
  if (single) {
    const y = Number(single[1]);
    return { startYear: y, endYear: y + 1 };
  }
  const curr = new Date().getFullYear();
  return { startYear: curr, endYear: curr + 1 };
}

/**
 * Resolves a 1-based month number (1..12) within an academic year (e.g. "2026-2027")
 * to its calendar YYYY-MM key: months 10..12 map to startYear, months 1..9 map to endYear.
 */
export function resolveAcademicMonthKey(academicYear: string, month1Based: number): string {
  const { startYear, endYear } = parseAcademicYearSpan(academicYear);
  const year = month1Based >= 10 ? startYear : endYear;
  return `${year}-${String(month1Based).padStart(2, '0')}`;
}
