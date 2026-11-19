import { getKhmerMonthName, parseYearMonth } from './khmerDate';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';

export interface ExportFileNameOptions {
  document: string;
  className: string;
  month?: string | number;
  year?: string | number;
  suffix?: string;
  ext: 'xlsx' | 'pdf';
  useKhmerDigits?: boolean;
}

function sanitizeSegment(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

/**
 * Builds a consistent export filename across all Excel and PDF exports:
 *   <ឯកសារ>_<ថ្នាក់>_<ខែ>_<ឆ្នាំ>.<ext>
 * (omitting <ខែ> for yearly / non-monthly documents, e.g. student lists or semester summaries).
 */
export function buildExportFileName({
  document,
  className,
  month,
  year,
  suffix,
  ext,
  useKhmerDigits = false,
}: ExportFileNameOptions): string {
  const fmt = (val: string | number): string =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  let monthSegment = '';
  let resolvedYear: string | number | undefined = year;

  if (typeof month === 'string' && /^\d{4}-\d{1,2}$/.test(month.trim())) {
    const parsed = parseYearMonth(month.trim());
    monthSegment = getKhmerMonthName(parsed.month);
    if (resolvedYear === undefined || resolvedYear === '') {
      resolvedYear = parsed.year;
    }
  } else if (typeof month === 'number') {
    monthSegment = getKhmerMonthName(month) || fmt(month);
  } else if (typeof month === 'string' && month.trim() !== '') {
    monthSegment = fmt(sanitizeSegment(month));
  }

  const parts: string[] = [
    sanitizeSegment(document),
    sanitizeSegment(className),
  ];

  if (monthSegment) {
    parts.push(sanitizeSegment(monthSegment));
  }

  if (resolvedYear !== undefined && String(resolvedYear).trim() !== '') {
    parts.push(fmt(sanitizeSegment(String(resolvedYear))));
  }

  if (suffix && suffix.trim() !== '') {
    parts.push(fmt(sanitizeSegment(suffix)));
  }

  return `${parts.filter(Boolean).join('_')}.${ext}`;
}
