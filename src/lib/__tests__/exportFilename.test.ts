import { describe, it, expect } from 'vitest';
import { buildExportFileName } from '../exportFilename';

describe('buildExportFileName', () => {
  it('formats monthly exports identically for Excel and PDF using <document>_<class>_<month>_<year>.<ext>', () => {
    const xlsx = buildExportFileName({
      document: 'បញ្ជីពិន្ទុប្រចាំខែ',
      className: '៧ក',
      month: '2026-11',
      ext: 'xlsx',
    });
    const pdf = buildExportFileName({
      document: 'បញ្ជីពិន្ទុប្រចាំខែ',
      className: '៧ក',
      month: '2026-11',
      ext: 'pdf',
    });

    expect(xlsx).toBe('បញ្ជីពិន្ទុប្រចាំខែ_៧ក_វិច្ឆិកា_2026.xlsx');
    expect(pdf).toBe('បញ្ជីពិន្ទុប្រចាំខែ_៧ក_វិច្ឆិកា_2026.pdf');
  });

  it('respects Khmer numerals when requested and handles yearly documents without month', () => {
    expect(
      buildExportFileName({
        document: 'បញ្ជីឈ្មោះសិស្ស',
        className: '៧ក',
        year: '2026-2027',
        ext: 'pdf',
        useKhmerDigits: true,
      })
    ).toBe('បញ្ជីឈ្មោះសិស្ស_៧ក_២០២៦-២០២៧.pdf');

    expect(
      buildExportFileName({
        document: 'បញ្ជីវត្តមាន',
        className: '៧ក',
        month: '3ខែ',
        year: '2026-2027',
        ext: 'xlsx',
        useKhmerDigits: false,
      })
    ).toBe('បញ្ជីវត្តមាន_៧ក_3ខែ_2026-2027.xlsx');

    expect(
      buildExportFileName({
        document: 'បញ្ជីហៅឈ្មោះ',
        className: '៧ក',
        year: '2026-2027',
        ext: 'pdf',
      })
    ).toBe('បញ្ជីហៅឈ្មោះ_៧ក_2026-2027.pdf');
  });
});
