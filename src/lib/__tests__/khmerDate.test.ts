import { describe, it, expect } from 'vitest';
import {
  KHMER_MONTHS,
  daysAgo,
  formatKhmerMonthYear,
  getKhmerMonthName,
  parseYearMonth,
} from '../khmerDate';

describe('khmerDate helpers', () => {
  it('has 12 Khmer months', () => {
    expect(KHMER_MONTHS).toHaveLength(12);
    expect(getKhmerMonthName(1)).toBe('មករា');
    expect(getKhmerMonthName(11)).toBe('វិច្ឆិកា');
    expect(getKhmerMonthName(12)).toBe('ធ្នូ');
  });

  it('parses and formats YYYY-MM in Khmer and Arabic numerals', () => {
    expect(parseYearMonth('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(formatKhmerMonthYear('2026-11', true)).toBe('វិច្ឆិកា ២០២៦');
    expect(formatKhmerMonthYear('2026-11', false)).toBe('វិច្ឆិកា 2026');
  });

  it('computes whole days ago', () => {
    const now = 1731900000000;
    expect(daysAgo(now, now)).toBe(0);
    expect(daysAgo(now - 3 * 86400 * 1000, now)).toBe(3);
  });
});
