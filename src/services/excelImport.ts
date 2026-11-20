import type { SchoolClass, Student } from '../types/domain';
import { toArabicNumerals } from '../utils/khmerNumerals';

export interface ColumnMapping {
  studentId: string;
  nameKm: string;
  nameEn: string;
  gender: string;
  dateOfBirth: string;
  placeOfBirth: string;
  class: string;
  academicYear: string;
  fatherName: string;
  fatherOccupation: string;
  motherName: string;
  motherOccupation: string;
  address: string;
  phone: string;
  cardNumber: string;
}

export interface ParsedWorksheet {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface ParsedWorkbook {
  sheets: ParsedWorksheet[];
}

export interface PreviewStudentRow {
  rowNumber: number;
  studentId: string;
  nameKm: string;
  nameEn: string;
  gender: 'ប្រុស' | 'ស្រី' | '';
  dateOfBirth: string;
  placeOfBirth: string;
  fatherName: string;
  fatherOccupation: string;
  motherName: string;
  motherOccupation: string;
  address: string;
  phone: string;
  cardNumber: string;
  excelClass: string;
  excelAcademicYear: string;
  status: 'valid' | 'duplicate' | 'error';
  errors: string[];
  record?: Omit<Student, 'id' | 'classId' | 'order' | 'createdAt' | 'updatedAt'>;
}

export interface StudentImportPreview {
  rows: PreviewStudentRow[];
  validRecords: Omit<Student, 'id' | 'classId' | 'order' | 'createdAt' | 'updatedAt'>[];
  duplicateIds: string[];
  errorCount: number;
  classMismatchCount: number;
  yearMismatchCount: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Converts any ExcelJS cell value to plain text or preserves Date for date columns.
 */
export function excelValueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return `${pad2(value.getUTCDate())}/${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText
        .map((t) => (t && typeof t === 'object' && 'text' in t ? String((t as { text?: unknown }).text || '') : ''))
        .join('')
        .trim();
    }
    if ('result' in v) return excelValueToText(v.result);
    if ('formula' in v || 'sharedFormula' in v) return '';
    if ('text' in v) return excelValueToText(v.text);
    if ('error' in v) return '';
    return '';
  }
  return String(value).trim();
}

/**
 * Normalizes a date cell (Date object, Excel serial number, Khmer digits DD/MM/YYYY,
 * or YYYY-MM-DD) into Arabic DD/MM/YYYY. Returns null if non-empty and invalid.
 */
export function normalizeBirthDate(raw: unknown): { value: string; valid: boolean } {
  if (raw === null || raw === undefined) return { value: '', valid: true };

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { value: '', valid: false };
    return {
      value: `${pad2(raw.getUTCDate())}/${pad2(raw.getUTCMonth() + 1)}/${raw.getUTCFullYear()}`,
      valid: true,
    };
  }

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1000 && raw < 100000) {
    // Excel serial date (epoch 1899-12-30 UTC)
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400 * 1000;
    const d = new Date(utcMs);
    if (!isNaN(d.getTime())) {
      return {
        value: `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
        valid: true,
      };
    }
  }

  const text = toArabicNumerals(excelValueToText(raw)).trim();
  if (!text) return { value: '', valid: true };

  // Pure numeric string Excel serial (e.g. "39553")
  if (/^\d{4,5}$/.test(text)) {
    const serial = Number(text);
    if (serial > 1000 && serial < 100000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86400 * 1000;
      const d = new Date(utcMs);
      if (!isNaN(d.getTime())) {
        return {
          value: `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
          valid: true,
        };
      }
    }
  }

  // DD/MM/YYYY or D/M/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (isValidCalendarDate(year, month, day)) {
      return { value: `${pad2(day)}/${pad2(month)}/${year}`, valid: true };
    }
    return { value: text, valid: false };
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (isValidCalendarDate(year, month, day)) {
      return { value: `${pad2(day)}/${pad2(month)}/${year}`, valid: true };
    }
    return { value: text, valid: false };
  }

  return { value: text, valid: false };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Normalizes gender values: ប្រុស / ប / M / Male -> 'ប្រុស'; ស្រី / ស / F / Female -> 'ស្រី'.
 */
export function normalizeGender(raw: string): 'ប្រុស' | 'ស្រី' | null {
  const g = raw.trim().toLowerCase();
  if (['ប្រុស', 'ប', 'm', 'male', 'boy', 'man'].includes(g)) return 'ប្រុស';
  if (['ស្រី', 'ស', 'f', 'female', 'girl', 'woman'].includes(g)) return 'ស្រី';
  return null;
}

function uniqueHeaders(headers: string[]): string[] {
  const seen: Record<string, number> = {};
  return headers.map((h, i) => {
    const base = (h || '').trim() || `Column_${i + 1}`;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base} (${seen[base]})`;
  });
}

function parseCSVText(text: string): string[][] {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const values: string[] = [];
    let match;
    while ((match = regex.exec(line))) {
      let val = match[1];
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      values.push(val.trim());
      if (regex.lastIndex >= line.length) break;
    }
    return values;
  });
}

export async function parseStudentExcelBuffer(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedWorkbook> {
  if (fileName.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    const rows = parseCSVText(text);
    if (rows.length === 0) return { sheets: [] };
    const headers = uniqueHeaders(rows[0]);
    const dataRows = rows
      .slice(1)
      .map((r) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          obj[h] = r[i] || '';
        });
        return obj;
      })
      .filter((obj) => Object.values(obj).some((v) => String(v).trim() !== ''));
    return {
      sheets: [
        {
          sheetName: 'Sheet1',
          headers,
          rows: dataRows,
          totalRows: dataRows.length,
        },
      ],
    };
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: ParsedWorksheet[] = [];

  workbook.eachSheet((worksheet) => {
    const rawHeaders: string[] = [];
    const rows: Record<string, unknown>[] = [];

    const firstRow = worksheet.getRow(1);
    firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      rawHeaders[colNumber - 1] = excelValueToText(cell.value) || `Column_${colNumber}`;
    });
    for (let i = 0; i < rawHeaders.length; i++) {
      if (!rawHeaders[i]) rawHeaders[i] = `Column_${i + 1}`;
    }
    const headers = uniqueHeaders(rawHeaders);

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData: Record<string, unknown> = {};
      let hasData = false;

      headers.forEach((header, idx) => {
        const cellVal = row.getCell(idx + 1).value;
        // Preserve Date/number for date cells so normalizeBirthDate can handle real Excel Dates
        if (cellVal instanceof Date || typeof cellVal === 'number') {
          rowData[header] = cellVal;
          hasData = true;
        } else {
          const strVal = excelValueToText(cellVal);
          rowData[header] = strVal;
          if (strVal) hasData = true;
        }
      });

      if (hasData) {
        rows.push(rowData);
      }
    });

    sheets.push({
      sheetName: worksheet.name,
      headers,
      rows,
      totalRows: rows.length,
    });
  });

  return { sheets };
}

export async function parseStudentExcelFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  return parseStudentExcelBuffer(buffer, file.name);
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const norm = (h: string) => h.toLowerCase().replace(/\s+/g, ' ').trim();
  const claimed = new Set<string>();

  const claim = (patterns: string[]): string => {
    for (const p of patterns) {
      const exact = p.startsWith('=');
      const needle = norm(exact ? p.slice(1) : p);
      for (const h of headers) {
        if (claimed.has(h)) continue;
        const hay = norm(h).replace(/ \(\d+\)$/, '');
        if (exact ? hay === needle : hay.includes(needle)) {
          claimed.add(h);
          return h;
        }
      }
    }
    return '';
  };

  const mapping: ColumnMapping = {
    studentId: '',
    nameKm: '',
    nameEn: '',
    gender: '',
    dateOfBirth: '',
    placeOfBirth: '',
    class: '',
    academicYear: '',
    fatherName: '',
    fatherOccupation: '',
    motherName: '',
    motherOccupation: '',
    address: '',
    phone: '',
    cardNumber: '',
  };

  mapping.fatherOccupation = claim([
    'មុខរបរឪពុក',
    'father occupation',
    'father job',
    "father's job",
    "father's occupation",
  ]);
  mapping.motherOccupation = claim([
    'មុខរបរម្តាយ',
    'មុខរបរម្ដាយ',
    'mother occupation',
    'mother job',
    "mother's job",
    "mother's occupation",
  ]);
  mapping.fatherName = claim([
    'ឪពុកឈ្មោះ',
    'ឈ្មោះឪពុក',
    'ឪពុក',
    "father's name",
    'father name',
    'father',
  ]);
  mapping.motherName = claim([
    'ម្តាយឈ្មោះ',
    'ម្ដាយឈ្មោះ',
    'ឈ្មោះម្តាយ',
    'ឈ្មោះម្ដាយ',
    'ម្តាយ',
    'ម្ដាយ',
    "mother's name",
    'mother name',
    'mother',
  ]);
  mapping.placeOfBirth = claim([
    'ទីកន្លែងកំណើត',
    'កន្លែងកំណើត',
    'កន្លែងកើត',
    'place of birth',
    'birthplace',
    'pob',
  ]);
  mapping.dateOfBirth = claim([
    'ថ្ងៃខែឆ្នាំកំណើត',
    'ថ្ងៃកំណើត',
    'កំណើត',
    'date of birth',
    'dob',
    'birth',
  ]);
  mapping.academicYear = claim(['ឆ្នាំសិក្សា', 'academic year', 'school year', '=year']);
  mapping.phone = claim([
    'លេខទូរស័ព្ទ',
    'លេខទូរសព្ទ',
    'ទូរស័ព្ទ',
    'ទូរសព្ទ',
    'phone',
    'mobile',
    'tel',
  ]);
  mapping.cardNumber = claim(['លេខកាត', 'card no', 'card number', '=ល.រ', '=លរ', '=no', '=no.', '=n°']);
  mapping.studentId = claim([
    'អត្តលេខ',
    'លេខសម្គាល់',
    'student id',
    'student no',
    'student code',
    '=id',
    '=code',
    '=sid',
  ]);
  mapping.nameEn = claim(['ឡាតាំង', 'អង់គ្លេស', 'latin', 'english', 'name (en)']);
  mapping.nameKm = claim([
    'គោត្តនាម',
    'ឈ្មោះខ្មែរ',
    'ឈ្មោះសិស្ស',
    'khmer',
    'name (km)',
    'full name',
    'fullname',
    'ឈ្មោះ',
    'នាម',
    'name',
  ]);
  mapping.gender = claim(['ភេទ', 'gender', '=sex']);
  mapping.class = claim(['ថ្នាក់ទី', 'ថ្នាក់', 'class', 'grade']);
  mapping.address = claim(['ទីលំនៅបច្ចុប្បន្ន', 'ទីលំនៅ', 'អាសយដ្ឋាន', 'address']);

  const generic = (h: string) => /មុខរបរ|occupation|\bjob\b/i.test(h);
  const after = (col: string) => {
    if (!col) return '';
    const start = headers.indexOf(col);
    for (let i = start + 1; i < headers.length; i++) {
      const h = headers[i];
      if (claimed.has(h)) {
        if (h === mapping.fatherName || h === mapping.motherName) break;
        continue;
      }
      if (generic(h)) {
        claimed.add(h);
        return h;
      }
    }
    return '';
  };
  if (!mapping.fatherOccupation) mapping.fatherOccupation = after(mapping.fatherName);
  if (!mapping.motherOccupation) mapping.motherOccupation = after(mapping.motherName);

  return mapping;
}

const normalizeCompare = (val: string) =>
  toArabicNumerals(val).replace(/\s+/g, '').toLowerCase();

export function buildStudentImportPreview(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping,
  existingClassStudentIds: Set<string>,
  targetClass: Pick<SchoolClass, 'name' | 'academicYear'>
): StudentImportPreview {
  const existingLower = new Set(
    Array.from(existingClassStudentIds).map((id) => id.trim().toLowerCase())
  );
  const seenInFileLower = new Set<string>();

  let autoCounter = 0;
  const nextAutoId = () => {
    let candidate: string;
    do {
      autoCounter++;
      candidate = `AUTO-${String(autoCounter).padStart(4, '0')}`;
    } while (
      existingLower.has(candidate.toLowerCase()) ||
      seenInFileLower.has(candidate.toLowerCase())
    );
    return candidate;
  };

  const rows: PreviewStudentRow[] = [];
  const validRecords: StudentImportPreview['validRecords'] = [];
  const duplicateIds: string[] = [];
  let errorCount = 0;
  let classMismatchCount = 0;
  let yearMismatchCount = 0;

  const targetClassNorm = normalizeCompare(targetClass.name);
  const targetYearNorm = normalizeCompare(targetClass.academicYear);

  rawRows.forEach((rawRow, idx) => {
    const rowNumber = idx + 2;
    const getText = (col: string) => (col ? excelValueToText(rawRow[col]) : '');

    const rawId = getText(mapping.studentId);
    const studentId = rawId || nextAutoId();
    const idLower = studentId.toLowerCase();

    const nameKm = getText(mapping.nameKm);
    const nameEn = getText(mapping.nameEn);
    const rawGender = getText(mapping.gender);
    const parsedGender = mapping.gender
      ? normalizeGender(rawGender)
      : ('ប្រុស' as const);

    const rawDob = mapping.dateOfBirth ? rawRow[mapping.dateOfBirth] : '';
    const parsedDob = normalizeBirthDate(rawDob);

    const placeOfBirth = getText(mapping.placeOfBirth);
    const excelClass = getText(mapping.class);
    const excelAcademicYear = getText(mapping.academicYear);
    const fatherName = getText(mapping.fatherName);
    const fatherOccupation = getText(mapping.fatherOccupation);
    const motherName = getText(mapping.motherName);
    const motherOccupation = getText(mapping.motherOccupation);
    const address = getText(mapping.address);
    const phone = getText(mapping.phone);
    const cardNumber = getText(mapping.cardNumber);

    if (excelClass && normalizeCompare(excelClass) !== targetClassNorm) {
      classMismatchCount++;
    }
    if (excelAcademicYear && normalizeCompare(excelAcademicYear) !== targetYearNorm) {
      yearMismatchCount++;
    }

    const errors: string[] = [];
    if (!nameKm) errors.push('ខ្វះ គោត្តនាម និងនាម');
    if (mapping.gender && !parsedGender) {
      errors.push(`ភេទមិនត្រឹមត្រូវ («${rawGender || 'ទទេ'}»)`);
    }
    if (!parsedDob.valid) {
      errors.push(`ថ្ងៃកំណើតមិនត្រឹមត្រូវ («${excelValueToText(rawDob)}»)`);
    }

    const isDuplicate = existingLower.has(idLower) || seenInFileLower.has(idLower);
    if (isDuplicate) {
      duplicateIds.push(studentId);
      errors.push(`អត្តលេខស្ទួន (${studentId})`);
    }

    let status: PreviewStudentRow['status'] = 'valid';
    if (errors.length > 0) {
      status = isDuplicate && errors.length === 1 ? 'duplicate' : 'error';
      if (status === 'error') errorCount++;
    }

    if (status === 'valid' && parsedGender) {
      seenInFileLower.add(idLower);
      const record: NonNullable<PreviewStudentRow['record']> = {
        studentId,
        nameKm,
        ...(nameEn ? { nameEn } : {}),
        gender: parsedGender,
        dateOfBirth: parsedDob.value,
        ...(placeOfBirth ? { placeOfBirth } : {}),
        ...(fatherName ? { fatherName } : {}),
        ...(fatherOccupation ? { fatherOccupation } : {}),
        ...(motherName ? { motherName } : {}),
        ...(motherOccupation ? { motherOccupation } : {}),
        ...(address ? { address } : {}),
        ...(phone ? { phone } : {}),
        ...(cardNumber ? { cardNumber } : {}),
        status: 'active',
      };
      validRecords.push(record);
      rows.push({
        rowNumber,
        studentId,
        nameKm,
        nameEn,
        gender: parsedGender,
        dateOfBirth: parsedDob.value,
        placeOfBirth,
        fatherName,
        fatherOccupation,
        motherName,
        motherOccupation,
        address,
        phone,
        cardNumber,
        excelClass,
        excelAcademicYear,
        status,
        errors,
        record,
      });
    } else {
      rows.push({
        rowNumber,
        studentId,
        nameKm,
        nameEn,
        gender: parsedGender ?? '',
        dateOfBirth: parsedDob.value,
        placeOfBirth,
        fatherName,
        fatherOccupation,
        motherName,
        motherOccupation,
        address,
        phone,
        cardNumber,
        excelClass,
        excelAcademicYear,
        status,
        errors,
      });
    }
  });

  return {
    rows,
    validRecords,
    duplicateIds: Array.from(new Set(duplicateIds)),
    errorCount,
    classMismatchCount,
    yearMismatchCount,
  };
}

export async function downloadStudentImportTemplate(
  className = '៧ក',
  academicYear = '2026-2027'
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';
  const sheet = workbook.addWorksheet('បញ្ជីឈ្មោះសិស្ស');

  sheet.columns = [
    { header: 'អត្តលេខ', key: 'studentId', width: 16 },
    { header: 'គោត្តនាម និងនាម', key: 'nameKm', width: 22 },
    { header: 'ឈ្មោះឡាតាំង', key: 'nameEn', width: 20 },
    { header: 'ភេទ', key: 'gender', width: 10 },
    { header: 'ថ្ងៃខែឆ្នាំកំណើត', key: 'dateOfBirth', width: 18 },
    { header: 'ទីកន្លែងកំណើត', key: 'placeOfBirth', width: 30 },
    { header: 'ថ្នាក់ទី', key: 'class', width: 12 },
    { header: 'ឆ្នាំសិក្សា', key: 'academicYear', width: 16 },
    { header: 'ឪពុកឈ្មោះ', key: 'fatherName', width: 20 },
    { header: 'មុខរបរឪពុក', key: 'fatherOccupation', width: 16 },
    { header: 'ម្ដាយឈ្មោះ', key: 'motherName', width: 20 },
    { header: 'មុខរបរម្ដាយ', key: 'motherOccupation', width: 16 },
    { header: 'ទីលំនៅបច្ចុប្បន្ន', key: 'address', width: 30 },
    { header: 'លេខទូរស័ព្ទ', key: 'phone', width: 16 },
    { header: 'លេខកាត', key: 'cardNumber', width: 12 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = {
    name: 'Khmer OS Battambang',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF163D7E' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  sheet.addRow({
    studentId: 'KDL-2026-001',
    nameKm: 'សុខ សុវណ្ណារ៉ា',
    nameEn: 'SOKH SOVANNARA',
    gender: 'ប្រុស',
    dateOfBirth: '១៥/០៤/២០១៣',
    placeOfBirth: 'ឃុំព្រែកតាពៅ ស្រុកកៀនស្វាយ ខេត្តកណ្ដាល',
    class: className,
    academicYear,
    fatherName: 'សុខ ចាន់ថន',
    fatherOccupation: 'កសិករ',
    motherName: 'មាស សុខា',
    motherOccupation: 'មេផ្ទះ',
    address: 'ភូមិស្វាយ ឃុំកៀនស្វាយ ខេត្តកណ្ដាល',
    phone: '012 889 900',
    cardNumber: '០០១',
  });

  sheet.addRow({
    studentId: 'KDL-2026-002',
    nameKm: 'ចាន់ ស្រីនិច',
    nameEn: 'CHAN SREYNICH',
    gender: 'ស្រី',
    dateOfBirth: '20/08/2013',
    placeOfBirth: 'សង្កាត់តាខ្មៅ ក្រុងតាខ្មៅ ខេត្តកណ្ដាល',
    class: className,
    academicYear,
    fatherName: 'ចាន់ វិបុល',
    fatherOccupation: 'គ្រូបង្រៀន',
    motherName: 'កែវ សុគន្ធា',
    motherOccupation: 'អាជីវករ',
    address: 'សង្កាត់តាខ្មៅ ក្រុងតាខ្មៅ ខេត្តកណ្ដាល',
    phone: '098 776 655',
    cardNumber: '០០២',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'គំរូទិន្នន័យសិស្ស_KruDesk.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
