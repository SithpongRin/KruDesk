import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  autoDetectColumnMapping,
  buildStudentImportPreview,
  normalizeBirthDate,
  normalizeGender,
  parseStudentExcelBuffer,
} from '../excelImport';

describe('Excel Student Import Parser', () => {
  it('parses the real template file គម្រូទិន្នន័យសិស្សក្នុងការបញ្ជូលសិស្សតាម Excel.xlsx', async () => {
    const templatePath = path.resolve(
      process.cwd(),
      'គម្រូទិន្នន័យសិស្សក្នុងការបញ្ជូលសិស្សតាម Excel.xlsx'
    );
    const fileBuffer = fs.readFileSync(templatePath);
    const arrayBuf = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );

    const parsed = await parseStudentExcelBuffer(arrayBuf, 'template.xlsx');
    expect(parsed.sheets).toHaveLength(1);
    const sheet = parsed.sheets[0];
    expect(sheet.rows).toHaveLength(2);

    const mapping = autoDetectColumnMapping(sheet.headers);
    expect(mapping.studentId).toBe('អត្តលេខ');
    expect(mapping.nameKm).toBe('គោត្តនាម និងនាម');
    expect(mapping.gender).toBe('ភេទ');
    expect(mapping.dateOfBirth).toBe('ថ្ងៃខែឆ្នាំកំណើត');

    const preview = buildStudentImportPreview(sheet.rows, mapping, new Set(), {
      name: '៧ក',
      academicYear: '២០២៦-២០២៧',
    });

    expect(preview.errorCount).toBe(0);
    expect(preview.validRecords).toHaveLength(2);
    expect(preview.validRecords[0]).toMatchObject({
      studentId: 'KDL-2024-001',
      nameKm: 'សុខ សុវណ្ណារ៉ា',
      gender: 'ប្រុស',
      dateOfBirth: '15/04/2008',
      cardNumber: '០០១',
      phone: '012 889 900',
    });
    expect(preview.validRecords[1]).toMatchObject({
      studentId: 'KDL-2024-002',
      nameKm: 'ចាន់ ស្រីនិច',
      gender: 'ស្រី',
      dateOfBirth: '20/08/2008',
      cardNumber: '០០២',
    });
    // Template has class "១០A" and year "២០២៤ - ២០២៥" which differ from target "៧ក" / "២០២៦-២០២៧"
    expect(preview.classMismatchCount).toBe(2);
    expect(preview.yearMismatchCount).toBe(2);
  }, 30000);

  it('normalizes Khmer digits, Arabic digits, Excel Date objects, and Excel serial dates to DD/MM/YYYY', () => {
    expect(normalizeBirthDate('១៥/០៤/២០០៨')).toEqual({ value: '15/04/2008', valid: true });
    expect(normalizeBirthDate('5/4/2013')).toEqual({ value: '05/04/2013', valid: true });
    expect(normalizeBirthDate('2013-04-15')).toEqual({ value: '15/04/2013', valid: true });
    expect(normalizeBirthDate(new Date(Date.UTC(2013, 3, 15)))).toEqual({
      value: '15/04/2013',
      valid: true,
    });
    expect(normalizeBirthDate(41379)).toEqual({ value: '15/04/2013', valid: true });
    expect(normalizeBirthDate('31/02/2013').valid).toBe(false);
    expect(normalizeBirthDate('not-a-date').valid).toBe(false);
  });

  it('normalizes gender variants and rejects unknown gender strings', () => {
    expect(normalizeGender('ប្រុស')).toBe('ប្រុស');
    expect(normalizeGender('ប')).toBe('ប្រុស');
    expect(normalizeGender('m')).toBe('ប្រុស');
    expect(normalizeGender('Male')).toBe('ប្រុស');
    expect(normalizeGender('ស្រី')).toBe('ស្រី');
    expect(normalizeGender('ស')).toBe('ស្រី');
    expect(normalizeGender('F')).toBe('ស្រី');
    expect(normalizeGender('female')).toBe('ស្រី');
    expect(normalizeGender('Other')).toBeNull();
  });

  it('skips duplicate studentIds (both existing and within-file) and flags per-row errors', () => {
    const headers = ['អត្តលេខ', 'គោត្តនាម និងនាម', 'ភេទ', 'ថ្ងៃខែឆ្នាំកំណើត', 'លេខកាត', 'លេខទូរស័ព្ទ'];
    const mapping = autoDetectColumnMapping(headers);

    const preview = buildStudentImportPreview(
      [
        { អត្តលេខ: 'S-01', 'គោត្តនាម និងនាម': 'មានរួច', ភេទ: 'M', ថ្ងៃខែឆ្នាំកំណើត: '០១/០១/២០១៣' },
        { អត្តលេខ: 'S-02', 'គោត្តនាម និងនាម': 'សិស្សថ្មី', ភេទ: 'ស', ថ្ងៃខែឆ្នាំកំណើត: '០២/០៣/២០១៣', លេខកាត: '០០២', លេខទូរស័ព្ទ: '០១២ ៣៤៥ ៦៧៨' },
        { អត្តលេខ: 'S-02', 'គោត្តនាម និងនាម': 'ស្ទួនក្នុងឯកសារ', ភេទ: 'Female', ថ្ងៃខែឆ្នាំកំណើត: '03/03/2013' },
        { អត្តលេខ: 'S-03', 'គោត្តនាម និងនាម': '', ភេទ: 'Invalid', ថ្ងៃខែឆ្នាំកំណើត: 'bad' },
      ],
      mapping,
      new Set(['S-01']),
      { name: '៧ក', academicYear: '២០២៦-២០២៧' }
    );

    expect(preview.validRecords).toHaveLength(1);
    expect(preview.validRecords[0].studentId).toBe('S-02');
    expect(preview.validRecords[0].gender).toBe('ស្រី');
    expect(preview.validRecords[0].dateOfBirth).toBe('02/03/2013');
    expect(preview.duplicateIds).toEqual(['S-01', 'S-02']);
    expect(preview.errorCount).toBe(1);
    expect(preview.rows[3].errors).toHaveLength(3);
  });
});
