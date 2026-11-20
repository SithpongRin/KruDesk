import type ExcelJS from 'exceljs';
import type {
  AbsenceCode,
  AttendanceConfig,
  Profile,
  SchoolClass,
  ScoreConfig,
  Student,
} from '../types/domain';
import {
  computeDailyAbsenceTotals,
  computeStudentMonthlyAttendance,
  getActiveStudentsOrdered,
  getMonthDayInfos,
  makeAttendanceCellKey,
} from '../lib/attendance';
import {
  buildSubjectColumnNumbers,
  buildSubjectHeaderSpans,
  collapseGroupedSubjects,
  computeCompetitionRanks,
  computeScoreRow,
  displayedAverageOrNull,
  formatAverage,
  isSubjectActive,
  sortSubjects,
  type SemesterStudentSummary,
} from '../lib/grading';
import type { MonthlyScoreSheetPageData } from '../print/MonthlyScoreSheet';
import {
  GRADE_ORDER,
  type AnnualResultsSummary,
  type MonthlyResultsSummary,
  type SemesterResultsSummary,
} from '../lib/monthlyResults';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import { formatMinistryProvince } from '../print/DocumentHeader';
import { formatDocumentGregorianDate, type DocumentSignOptions } from '../print/DocumentSignature';

/**
 * Sanitizes an Excel worksheet name:
 * replaces \ / * ? : [ ] with '_', trims, caps at 31 UTF-16 code units without
 * splitting surrogate pairs, and falls back if empty.
 */
export function safeSheetName(name: string, fallback = 'Sheet'): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, '_').trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 31) return cleaned;
  let end = 31;
  const code = cleaned.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    end = 30;
  }
  const sliced = cleaned.slice(0, end).trim();
  return sliced || fallback;
}
import { buildExportFileName } from '../lib/exportFilename';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export async function exportStudentListExcel(
  cls: SchoolClass,
  students: Student[],
  profile: Profile,
  useKhmerDigits = false
): Promise<string> {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';
  const sheet = workbook.addWorksheet(safeSheetName(`សិស្ស_${cls.name}`, 'សិស្ស'), {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const sorted = [...students].sort((a, b) => a.order - b.order);
  const maleCount = sorted.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = sorted.filter((s) => s.gender === 'ស្រី').length;

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 10 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 10, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  // Title Row 1
  sheet.mergeCells('A1:L1');
  const title1 = sheet.getCell('A1');
  title1.value = `${profile.schoolName} — បញ្ជីឈ្មោះសិស្ស ថ្នាក់ទី ${cls.name}`;
  title1.font = { name: 'Khmer OS Battambang', size: 13, bold: true };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  // Title Row 2
  sheet.mergeCells('A2:L2');
  const title2 = sheet.getCell('A2');
  title2.value = `ឆ្នាំសិក្សា ${fmt(cls.academicYear)}   |   ប្រុស៖ ${fmt(maleCount)} នាក់   ស្រី៖ ${fmt(femaleCount)} នាក់   សរុប៖ ${fmt(sorted.length)} នាក់`;
  title2.font = { name: 'Khmer OS Battambang', size: 10 };
  title2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  sheet.addRow([]);

  const headers = [
    'ល.រ',
    'អត្តលេខ',
    'គោត្តនាម និងនាម',
    'ឈ្មោះឡាតាំង',
    'ភេទ',
    'ថ្ងៃខែឆ្នាំកំណើត',
    'ទីកន្លែងកំណើត',
    'ឪពុកឈ្មោះ',
    'ម្តាយឈ្មោះ',
    'លេខទូរស័ព្ទ',
    'ទីលំនៅបច្ចុប្បន្ន',
    'លេខកាត',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { ...fontBold, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163D7E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  sorted.forEach((s) => {
    const row = sheet.addRow([
      fmt(s.order),
      s.studentId,
      s.nameKm,
      s.nameEn || '',
      s.gender,
      fmt(s.dateOfBirth),
      s.placeOfBirth || '',
      s.fatherName || '',
      s.motherName || '',
      s.phone || '',
      s.address || '',
      s.cardNumber || '',
    ]);
    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = fontBase;
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: [1, 2, 5, 6, 12].includes(colNumber) ? 'center' : 'left',
        wrapText: true,
      };
    });
  });

  const widths = [6, 14, 22, 18, 8, 15, 24, 18, 18, 14, 26, 10];
  widths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });

  // Repeat title + header rows when printing
  sheet.pageSetup.printTitlesRow = '1:4';

  // Signature block
  sheet.addRow([]);
  const sigRow1 = sheet.addRow([
    '',
    'បានឃើញ និងឯកភាព',
    '',
    '',
    '',
    '',
    '',
    '',
    'ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………',
  ]);
  const sigRow2 = sheet.addRow(['', 'នាយកសាលា', '', '', '', '', '', '', 'គ្រូបន្ទុកថ្នាក់']);
  const sigRow3 = sheet.addRow([
    '',
    profile.directorName,
    '',
    '',
    '',
    '',
    '',
    '',
    profile.teacherName,
  ]);
  [sigRow1, sigRow2, sigRow3].forEach((r) => {
    r.eachCell((cell) => {
      cell.font = fontBase;
    });
  });
  sigRow2.eachCell((cell) => {
    cell.font = fontBold;
  });
  sigRow3.eachCell((cell) => {
    cell.font = fontBold;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = buildExportFileName({
    document: 'បញ្ជីឈ្មោះសិស្ស',
    className: cls.name,
    year: cls.academicYear,
    ext: 'xlsx',
    useKhmerDigits,
  });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Exports class roster («បញ្ជីហៅឈ្មោះ») with parent names/occupations for active students.
 */
export async function exportRosterExcel(
  cls: SchoolClass,
  students: Student[],
  profile: Profile,
  useKhmerDigits = false
): Promise<string> {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';
  const sheet = workbook.addWorksheet(safeSheetName(`បញ្ជីហៅឈ្មោះ_${cls.name}`, 'បញ្ជីហៅឈ្មោះ'), {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const sorted = getActiveStudentsOrdered(students);
  const maleCount = sorted.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = sorted.filter((s) => s.gender === 'ស្រី').length;

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 10 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 10, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  sheet.mergeCells('A1:J1');
  const title1 = sheet.getCell('A1');
  title1.value = `${profile.schoolName} — បញ្ជីហៅឈ្មោះ ថ្នាក់ទី ${cls.name}`;
  title1.font = { name: 'Khmer OS Battambang', size: 13, bold: true };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells('A2:J2');
  const title2 = sheet.getCell('A2');
  title2.value = `ឆ្នាំសិក្សា ${fmt(cls.academicYear)}   |   ប្រុស៖ ${fmt(maleCount)} នាក់   ស្រី៖ ${fmt(femaleCount)} នាក់   សរុប៖ ${fmt(sorted.length)} នាក់`;
  title2.font = { name: 'Khmer OS Battambang', size: 10 };
  title2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  sheet.addRow([]);

  const headers = [
    'ល.រ',
    'អត្តលេខ',
    'គោត្តនាម និងនាម',
    'ភេទ',
    'ថ្ងៃខែឆ្នាំកំណើត',
    'ឈ្មោះឪពុក',
    'មុខរបរ (ឪពុក)',
    'ឈ្មោះម្តាយ',
    'មុខរបរ (ម្តាយ)',
    'ទីកន្លែងរស់នៅបច្ចុប្បន្ន',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { ...fontBold, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163D7E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  sorted.forEach((s, idx) => {
    const row = sheet.addRow([
      fmt(idx + 1),
      s.studentId,
      s.nameKm,
      s.gender,
      s.dateOfBirth ? fmt(s.dateOfBirth) : '',
      s.fatherName || '',
      s.fatherOccupation || '',
      s.motherName || '',
      s.motherOccupation || '',
      s.address || '',
    ]);
    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = fontBase;
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: [1, 2, 4, 5].includes(colNumber) ? 'center' : 'left',
        wrapText: true,
      };
    });
  });

  const widths = [6, 14, 22, 8, 15, 18, 16, 18, 16, 28];
  widths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });

  sheet.pageSetup.printTitlesRow = '1:4';

  sheet.addRow([]);
  const sigRow1 = sheet.addRow([
    '',
    'បានឃើញ និងឯកភាព',
    '',
    '',
    '',
    '',
    '',
    'ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………',
  ]);
  const sigRow2 = sheet.addRow(['', 'នាយកសាលា', '', '', '', '', '', 'គ្រូបន្ទុកថ្នាក់']);
  const sigRow3 = sheet.addRow([
    '',
    profile.directorName,
    '',
    '',
    '',
    '',
    '',
    profile.teacherName,
  ]);
  [sigRow1, sigRow2, sigRow3].forEach((r) => {
    r.eachCell((cell) => {
      cell.font = fontBase;
    });
  });
  sigRow2.eachCell((cell) => {
    cell.font = fontBold;
  });
  sigRow3.eachCell((cell) => {
    cell.font = fontBold;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = buildExportFileName({
    document: 'បញ្ជីហៅឈ្មោះ',
    className: cls.name,
    year: cls.academicYear,
    ext: 'xlsx',
    useKhmerDigits,
  });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

export async function exportAttendanceExcel(params: {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  monthsData: Array<{ month: string; lookup: Map<string, AbsenceCode>; takenDates: Set<string> }>;
  attendanceConfig: AttendanceConfig;
  holidayDates: Set<string>;
  todayKey: string;
  useKhmerDigits?: boolean;
}): Promise<string> {
  const {
    cls,
    students,
    profile,
    monthsData,
    attendanceConfig,
    holidayDates,
    todayKey,
    useKhmerDigits = false,
  } = params;

  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';

  const activeStudents = getActiveStudentsOrdered(
    students,
    monthsData.length === 1 ? monthsData[0].month : undefined
  );
  const maleCount = activeStudents.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = activeStudents.filter((s) => s.gender === 'ស្រី').length;

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };
  const restFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  for (const mData of monthsData) {
    const { year, month } = parseYearMonth(mData.month);
    const monthName = getKhmerMonthName(month);
    const dayInfos = getMonthDayInfos(year, month, {
      restWeekdays: attendanceConfig.restWeekdays,
      holidayDates,
      todayKey,
      takenDates: mData.takenDates,
    });
    const dailyTotals = computeDailyAbsenceTotals(activeStudents, mData.lookup, dayInfos);
    const isShadedDay = (d: (typeof dayInfos)[number]) =>
      d.isNonSchoolDay || (!d.isFuture && !d.isTaken);

    const daysCount = dayInfos.length;
    const totalCols = 3 + daysCount + 4; // ល.រ, អត្តលេខ, ឈ្មោះ + days + ច្ប, អច្ប, សរុប, ផ្សេងៗ
    const sheetName = safeSheetName(`${monthName}_${fmt(year)}`, 'Month');
    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.3,
          bottom: 0.3,
          header: 0.15,
          footer: 0.15,
        },
      },
    });

    // Title Row 1
    sheet.mergeCells(1, 1, 1, totalCols - 3);
    const tCell = sheet.getCell(1, 1);
    tCell.value = `${profile.schoolName}   ថ្នាក់ទី ${cls.name}   ខែ ${monthName} ឆ្នាំ ${fmt(year)}`;
    tCell.font = { name: 'Khmer OS Battambang', size: 11, bold: true };
    tCell.alignment = { horizontal: 'left', vertical: 'middle' };

    sheet.getCell(1, totalCols - 2).value = 'ប្រុស';
    sheet.getCell(1, totalCols - 1).value = 'ស្រី';
    sheet.getCell(1, totalCols).value = 'សរុប';
    sheet.getCell(2, totalCols - 2).value = Number(fmt(maleCount)) || fmt(maleCount);
    sheet.getCell(2, totalCols - 1).value = Number(fmt(femaleCount)) || fmt(femaleCount);
    sheet.getCell(2, totalCols).value = Number(fmt(activeStudents.length)) || fmt(activeStudents.length);
    for (let c = totalCols - 2; c <= totalCols; c++) {
      sheet.getCell(1, c).font = fontBold;
      sheet.getCell(1, c).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(1, c).border = thinBorder;
      sheet.getCell(2, c).font = fontBold;
      sheet.getCell(2, c).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(2, c).border = thinBorder;
    }

    // Header rows 4 & 5
    const hdrTop = 4;
    const hdrBot = 5;
    sheet.getCell(hdrTop, 1).value = 'ល.រ';
    sheet.getCell(hdrTop, 2).value = 'អត្តលេខ';
    sheet.getCell(hdrTop, 3).value = 'គោត្តនាម និងនាម';
    sheet.mergeCells(hdrTop, 1, hdrBot, 1);
    sheet.mergeCells(hdrTop, 2, hdrBot, 2);
    sheet.mergeCells(hdrTop, 3, hdrBot, 3);

    dayInfos.forEach((d, i) => {
      const col = 4 + i;
      sheet.getCell(hdrTop, col).value = useKhmerDigits ? fmt(d.day) : d.day;
      sheet.mergeCells(hdrTop, col, hdrBot, col);
      if (isShadedDay(d)) {
        sheet.getCell(hdrTop, col).fill = restFill;
        sheet.getCell(hdrBot, col).fill = restFill;
      }
    });

    const absStartCol = 4 + daysCount;
    sheet.getCell(hdrTop, absStartCol).value = 'ចំនួនអវត្តមាន';
    sheet.mergeCells(hdrTop, absStartCol, hdrTop, absStartCol + 2);
    sheet.getCell(hdrBot, absStartCol).value = 'ច្ប';
    sheet.getCell(hdrBot, absStartCol + 1).value = 'អច្ប';
    sheet.getCell(hdrBot, absStartCol + 2).value = 'សរុប';

    const noteCol = totalCols;
    sheet.getCell(hdrTop, noteCol).value = 'សេចក្ដីផ្សេងៗ';
    sheet.mergeCells(hdrTop, noteCol, hdrBot, noteCol);

    for (let r = hdrTop; r <= hdrBot; r++) {
      sheet.getRow(r).height = 18;
      for (let c = 1; c <= totalCols; c++) {
        const cell = sheet.getCell(r, c);
        cell.font = fontBold;
        cell.border = thinBorder;
        cell.alignment = {
          horizontal: c === 3 ? 'left' : 'center',
          vertical: 'middle',
          wrapText: true,
        };
      }
    }

    // Student rows
    let totalExcusedAll = 0;
    let totalUnexcusedAll = 0;
    activeStudents.forEach((s, idx) => {
      const rowNum = hdrBot + 1 + idx;
      const row = sheet.getRow(rowNum);
      row.height = 16;

      row.getCell(1).value = useKhmerDigits ? fmt(idx + 1) : idx + 1;
      row.getCell(2).value = s.studentId;
      row.getCell(3).value = s.nameKm;

      dayInfos.forEach((d, di) => {
        const col = 4 + di;
        const cell = row.getCell(col);
        if (isShadedDay(d)) {
          cell.fill = restFill;
          cell.value = '';
        } else if (d.isTaken && s.id !== undefined) {
          const code = mData.lookup.get(makeAttendanceCellKey(s.id, d.dateKey));
          cell.value = code || '';
        } else {
          cell.value = '';
        }
      });

      const summary =
        s.id !== undefined
          ? computeStudentMonthlyAttendance(s.id, mData.lookup, dayInfos)
          : { excused: 0, unexcused: 0, total: 0, sickCount: 0 };
      totalExcusedAll += summary.excused;
      totalUnexcusedAll += summary.unexcused;

      row.getCell(absStartCol).value = summary.excused > 0 ? (useKhmerDigits ? fmt(summary.excused) : summary.excused) : '';
      row.getCell(absStartCol + 1).value = summary.unexcused > 0 ? (useKhmerDigits ? fmt(summary.unexcused) : summary.unexcused) : '';
      row.getCell(absStartCol + 2).value = summary.total > 0 ? (useKhmerDigits ? fmt(summary.total) : summary.total) : '';
      row.getCell(noteCol).value = '';

      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        cell.font = c === absStartCol + 2 ? fontBold : fontBase;
        cell.border = thinBorder;
        cell.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle' };
      }
    });

    // Daily footer row
    const footerRowNum = hdrBot + 1 + activeStudents.length;
    sheet.mergeCells(footerRowNum, 1, footerRowNum, 3);
    sheet.getCell(footerRowNum, 1).value = 'សរុបអវត្តមានប្រចាំថ្ងៃ';
    dayInfos.forEach((d, di) => {
      const col = 4 + di;
      const cell = sheet.getCell(footerRowNum, col);
      if (isShadedDay(d)) cell.fill = restFill;
      const cnt = dailyTotals[di];
      cell.value = cnt !== null && cnt > 0 ? (useKhmerDigits ? fmt(cnt) : cnt) : '';
    });
    sheet.getCell(footerRowNum, absStartCol).value = useKhmerDigits ? fmt(totalExcusedAll) : totalExcusedAll;
    sheet.getCell(footerRowNum, absStartCol + 1).value = useKhmerDigits ? fmt(totalUnexcusedAll) : totalUnexcusedAll;
    sheet.getCell(footerRowNum, absStartCol + 2).value = useKhmerDigits
      ? fmt(totalExcusedAll + totalUnexcusedAll)
      : totalExcusedAll + totalUnexcusedAll;

    for (let c = 1; c <= totalCols; c++) {
      const cell = sheet.getCell(footerRowNum, c);
      cell.font = fontBold;
      cell.border = thinBorder;
      cell.alignment = { horizontal: c <= 3 ? 'right' : 'center', vertical: 'middle' };
    }

    // Column widths
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 13;
    sheet.getColumn(3).width = 22;
    for (let di = 0; di < daysCount; di++) {
      sheet.getColumn(4 + di).width = 3.6;
    }
    sheet.getColumn(absStartCol).width = 5;
    sheet.getColumn(absStartCol + 1).width = 5;
    sheet.getColumn(absStartCol + 2).width = 5.5;
    sheet.getColumn(noteCol).width = 14;

    sheet.pageSetup.printTitlesRow = '1:5';

    // Signature block
    const sigBase = footerRowNum + 2;
    sheet.getCell(sigBase, 2).value = 'បានឃើញ និងឯកភាព';
    sheet.getCell(sigBase + 1, 2).value = 'នាយកសាលា';
    sheet.getCell(sigBase + 4, 2).value = profile.directorName;

    const rightCol = Math.max(8, totalCols - 6);
    sheet.getCell(sigBase, rightCol).value = 'ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………';
    sheet.getCell(sigBase + 1, rightCol).value = 'គ្រូបន្ទុកថ្នាក់';
    sheet.getCell(sigBase + 4, rightCol).value = profile.teacherName;

    [sigBase, sigBase + 1, sigBase + 4].forEach((r, ri) => {
      [2, rightCol].forEach((c) => {
        sheet.getCell(r, c).font = ri === 0 ? fontBase : fontBold;
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName =
    monthsData.length === 1
      ? buildExportFileName({
          document: 'បញ្ជីវត្តមាន',
          className: cls.name,
          month: monthsData[0].month,
          ext: 'xlsx',
          useKhmerDigits,
        })
      : buildExportFileName({
          document: 'បញ្ជីវត្តមាន',
          className: cls.name,
          month: `${monthsData.length}ខែ`,
          year: cls.academicYear,
          ext: 'xlsx',
          useKhmerDigits,
        });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Exports monthly score sheets (or semester exam sheets) to Excel matching
 * reference/01_monthly_scores.webp with rotated vertical subject headers (textRotation: 90).
 */
export async function exportMonthlyScoreExcel(params: {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  sheets: MonthlyScoreSheetPageData[];
  scoreConfig: ScoreConfig;
  fileNamePrefix?: string;
  useKhmerDigits?: boolean;
}): Promise<string> {
  const {
    cls,
    students,
    profile,
    sheets,
    scoreConfig,
    fileNamePrefix = 'បញ្ជីពិន្ទុប្រចាំខែ',
    useKhmerDigits = false,
  } = params;

  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';

  const sortedSubjects = sortSubjects(cls.subjects).filter(isSubjectActive);
  const headerSpans = buildSubjectHeaderSpans(sortedSubjects);
  const columnNumbers = buildSubjectColumnNumbers(headerSpans);

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };

  for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
    const shData = sheets[sIdx];
    const activeStudents = getActiveStudentsOrdered(students, shData.monthKey);
    const maleCount = activeStudents.filter((s) => s.gender === 'ប្រុស').length;
    const femaleCount = activeStudents.filter((s) => s.gender === 'ស្រី').length;

    const mode = scoreConfig.averageDecimalMode ?? 'truncate';
    const computed = activeStudents.map((st) => {
      const scoreRecord = (st.id !== undefined && shData.scoresByStudent.get(st.id)) || {};
      const row = computeScoreRow(scoreRecord, sortedSubjects, scoreConfig);
      return {
        studentRef: st.id ?? -1,
        status: st.status,
        ...row,
        average: displayedAverageOrNull(row.average, mode),
      };
    });
    const rankMap = computeCompetitionRanks(
      computed
        .filter((r) => r.status === 'active')
        .map((r) => ({ id: r.studentRef, value: r.average }))
    );
    const rankByStudent = new Map(
      computed.map((r) => [
        r.studentRef,
        {
          ...r,
          rank: r.status === 'active' ? rankMap.get(r.studentRef) ?? null : null,
        },
      ])
    );

    const totalCols = 4 + sortedSubjects.length + 4;
    const safeTabName = safeSheetName(shData.periodLabel, `Sheet_${sIdx + 1}`);
    const sheet = workbook.addWorksheet(safeTabName, {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.3,
          bottom: 0.3,
          header: 0.15,
          footer: 0.15,
        },
      },
    });

    sheet.mergeCells(1, 1, 1, Math.max(4, totalCols - 3));
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `${profile.schoolName}   ថ្នាក់ទី ${cls.name}   ${shData.title} — ${shData.periodLabel} (${fmt(cls.academicYear)})`;
    titleCell.font = { name: 'Khmer OS Battambang', size: 11, bold: true };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    sheet.getCell(1, totalCols - 2).value = 'ប្រុស';
    sheet.getCell(1, totalCols - 1).value = 'ស្រី';
    sheet.getCell(1, totalCols).value = 'សរុប';
    sheet.getCell(2, totalCols - 2).value = useKhmerDigits ? fmt(maleCount) : maleCount;
    sheet.getCell(2, totalCols - 1).value = useKhmerDigits ? fmt(femaleCount) : femaleCount;
    sheet.getCell(2, totalCols).value = useKhmerDigits ? fmt(activeStudents.length) : activeStudents.length;
    for (let c = totalCols - 2; c <= totalCols; c++) {
      sheet.getCell(1, c).font = fontBold;
      sheet.getCell(1, c).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(1, c).border = thinBorder;
      sheet.getCell(2, c).font = fontBold;
      sheet.getCell(2, c).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(2, c).border = thinBorder;
    }

    const rGrp = 4;
    const rSub = 5;
    const rNum = 6;
    sheet.getRow(rGrp).height = 20;
    sheet.getRow(rSub).height = 84;
    sheet.getRow(rNum).height = 16;

    // Fixed identity columns
    sheet.getCell(rGrp, 1).value = 'ល.រ';
    sheet.getCell(rGrp, 2).value = 'អត្តលេខ';
    sheet.getCell(rGrp, 3).value = 'គោត្តនាម និងនាម';
    sheet.getCell(rGrp, 4).value = 'ភេទ';
    for (let c = 1; c <= 4; c++) {
      sheet.mergeCells(rGrp, c, rSub, c);
      sheet.getCell(rGrp, c).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    sheet.mergeCells(rNum, 1, rNum, 4);
    sheet.getCell(rNum, 1).value = 'លេខរៀងមុខវិជ្ជា';
    sheet.getCell(rNum, 1).alignment = { horizontal: 'right', vertical: 'middle' };

    // Subject columns with rotated Khmer headers (textRotation: 90)
    let colCursor = 5;
    for (const span of headerSpans) {
      if (span.subjects.length > 1 && span.group) {
        sheet.mergeCells(rGrp, colCursor, rGrp, colCursor + span.subjects.length - 1);
        const gCell = sheet.getCell(rGrp, colCursor);
        gCell.value = span.group;
        gCell.alignment = { horizontal: 'center', vertical: 'middle' };

        span.subjects.forEach((subj, idx) => {
          const c = colCursor + idx;
          const sCell = sheet.getCell(rSub, c);
          sCell.value = subj.name;
          sCell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            textRotation: 90,
            wrapText: true,
          };
          colCursor++;
        });
      } else {
        const subj = span.subjects[0];
        sheet.mergeCells(rGrp, colCursor, rSub, colCursor);
        const sCell = sheet.getCell(rGrp, colCursor);
        sCell.value = subj.name;
        sCell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          textRotation: 90,
          wrapText: true,
        };
        colCursor++;
      }
    }

    let numColCursor = 5;
    for (const colNum of columnNumbers) {
      if (colNum.colSpan > 1) {
        sheet.mergeCells(rNum, numColCursor, rNum, numColCursor + colNum.colSpan - 1);
      }
      const nCell = sheet.getCell(rNum, numColCursor);
      nCell.value =
        colNum.columnNumber !== null
          ? useKhmerDigits
            ? fmt(colNum.columnNumber)
            : colNum.columnNumber
          : '';
      nCell.alignment = { horizontal: 'center', vertical: 'middle' };
      numColCursor += colNum.colSpan;
    }

    // Summary columns
    const sumCol = 5 + sortedSubjects.length;
    const avgCol = sumCol + 1;
    const rankCol = sumCol + 2;
    const noteCol = sumCol + 3;

    const summaryLabels = [
      { col: sumCol, label: 'ពិន្ទុសរុប' },
      { col: avgCol, label: 'មធ្យមភាគ' },
      { col: rankCol, label: 'ចំណាត់ថ្នាក់' },
    ];
    for (const sItem of summaryLabels) {
      sheet.mergeCells(rGrp, sItem.col, rSub, sItem.col);
      const cell = sheet.getCell(rGrp, sItem.col);
      cell.value = sItem.label;
      cell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true };
    }
    sheet.mergeCells(rGrp, noteCol, rSub, noteCol);
    sheet.getCell(rGrp, noteCol).value = 'សេចក្ដីផ្សេងៗ';
    sheet.getCell(rGrp, noteCol).alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(rNum, sumCol, rNum, noteCol);
    sheet.getCell(rNum, sumCol).value = `/${fmt(scoreConfig.scale)}`;
    sheet.getCell(rNum, sumCol).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let r = rGrp; r <= rNum; r++) {
      for (let c = 1; c <= totalCols; c++) {
        const cell = sheet.getCell(r, c);
        cell.font = fontBold;
        cell.border = thinBorder;
        cell.fill = headerFill;
      }
    }

    // Data rows
    const dataStartRow = 7;
    activeStudents.forEach((student, idx) => {
      const r = dataStartRow + idx;
      const row = sheet.getRow(r);
      row.height = 17;

      const scoreRecord = (student.id !== undefined && shData.scoresByStudent.get(student.id)) || {};
      const ranked = student.id !== undefined ? rankByStudent.get(student.id) : undefined;
      const note = (student.id !== undefined && shData.notesByStudent?.get(student.id)) || '';

      sheet.getCell(r, 1).value = useKhmerDigits ? fmt(idx + 1) : idx + 1;
      sheet.getCell(r, 2).value = fmt(student.studentId);
      sheet.getCell(r, 3).value = student.nameKm;
      sheet.getCell(r, 4).value = student.gender === 'ប្រុស' ? 'ប' : 'ស';

      sortedSubjects.forEach((subj, si) => {
        const val = scoreRecord[subj.id];
        if (typeof val === 'number' && !Number.isNaN(val)) {
          sheet.getCell(r, 5 + si).value = useKhmerDigits ? fmt(val) : val;
        }
      });

      if (ranked?.total !== null && ranked?.total !== undefined) {
        sheet.getCell(r, sumCol).value = useKhmerDigits
          ? fmt(Number.isInteger(ranked.total) ? ranked.total : ranked.total.toFixed(1))
          : Number(ranked.total.toFixed(1));
      }
      if (ranked?.average !== null && ranked?.average !== undefined) {
        const formattedAvg = formatAverage(ranked.average, scoreConfig.averageDecimalMode);
        sheet.getCell(r, avgCol).value = useKhmerDigits ? fmt(formattedAvg) : Number(formattedAvg);
      }
      if (ranked?.rank !== null && ranked?.rank !== undefined) {
        sheet.getCell(r, rankCol).value = useKhmerDigits ? fmt(ranked.rank) : ranked.rank;
      }
      sheet.getCell(r, noteCol).value = note;

      for (let c = 1; c <= totalCols; c++) {
        const cell = sheet.getCell(r, c);
        cell.font = c >= sumCol && c <= rankCol ? fontBold : fontBase;
        cell.border = thinBorder;
        cell.alignment = {
          horizontal: c === 3 || c === noteCol ? 'left' : 'center',
          vertical: 'middle',
        };
      }
    });

    sheet.getColumn(1).width = 4.5;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 22;
    sheet.getColumn(4).width = 4.5;
    for (let si = 0; si < sortedSubjects.length; si++) {
      sheet.getColumn(5 + si).width = sortedSubjects[si].maxScore >= 100 ? 6.5 : 5.2;
    }
    sheet.getColumn(sumCol).width = 7.5;
    sheet.getColumn(avgCol).width = 7.5;
    sheet.getColumn(rankCol).width = 6.5;
    sheet.getColumn(noteCol).width = 13;

    sheet.pageSetup.printTitlesRow = '1:6';

    const sigBase = dataStartRow + activeStudents.length + 2;
    sheet.getCell(sigBase, 2).value = 'បានឃើញ និងឯកភាព';
    sheet.getCell(sigBase + 1, 2).value = 'នាយកសាលា';
    sheet.getCell(sigBase + 4, 2).value = profile.directorName;

    const rightCol = Math.max(7, totalCols - 5);
    sheet.getCell(sigBase, rightCol).value = 'ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………';
    sheet.getCell(sigBase + 1, rightCol).value = 'គ្រូបន្ទុកថ្នាក់';
    sheet.getCell(sigBase + 4, rightCol).value = profile.teacherName;

    [sigBase, sigBase + 1, sigBase + 4].forEach((r, ri) => {
      [2, rightCol].forEach((c) => {
        sheet.getCell(r, c).font = ri === 0 ? fontBase : fontBold;
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName =
    sheets.length === 1 && sheets[0].monthKey
      ? buildExportFileName({
          document: fileNamePrefix,
          className: cls.name,
          month: sheets[0].monthKey,
          ext: 'xlsx',
          useKhmerDigits,
        })
      : sheets.length > 1
        ? buildExportFileName({
            document: fileNamePrefix,
            className: cls.name,
            month: `${sheets.length}ខែ`,
            year: cls.academicYear,
            ext: 'xlsx',
            useKhmerDigits,
          })
        : buildExportFileName({
            document: fileNamePrefix,
            className: cls.name,
            year: cls.academicYear,
            ext: 'xlsx',
            useKhmerDigits,
          });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Exports Semester 1 + Semester 2 + Annual Result summary sheet to Excel matching
 * reference/02_semester_scores.webp with rotated subject headers.
 */
export async function exportSemesterSummaryExcel(params: {
  cls: SchoolClass;
  profile: Profile;
  summaries: SemesterStudentSummary[];
  scoreConfig: ScoreConfig;
  useKhmerDigits?: boolean;
}): Promise<string> {
  const { cls, profile, summaries, scoreConfig, useKhmerDigits = false } = params;

  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';

  const summarySubjects = collapseGroupedSubjects(
    sortSubjects(cls.subjects).filter(isSubjectActive)
  );
  const subjCount = summarySubjects.length;
  const semBlockWidth = subjCount * 2 + 5;
  const totalCols = 3 + semBlockWidth * 2 + 3;

  const maleCount = summaries.filter((s) => s.student.gender === 'ប្រុស').length;
  const femaleCount = summaries.filter((s) => s.student.gender === 'ស្រី').length;

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 8.5 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 8.5, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };

  const sheet = workbook.addWorksheet(safeSheetName(`ឆមាស_${cls.name}`, 'ឆមាស'), {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.25,
        bottom: 0.25,
        header: 0.1,
        footer: 0.1,
      },
    },
  });

  sheet.mergeCells(1, 1, 1, Math.max(4, totalCols - 3));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${profile.schoolName}   ថ្នាក់ទី ${cls.name}   តារាងស្រង់ពិន្ទុប្រចាំឆមាស និងប្រចាំឆ្នាំ (${fmt(cls.academicYear)})`;
  titleCell.font = { name: 'Khmer OS Battambang', size: 11, bold: true };

  sheet.getCell(1, totalCols - 2).value = 'ប្រុស';
  sheet.getCell(1, totalCols - 1).value = 'ស្រី';
  sheet.getCell(1, totalCols).value = 'សរុប';
  sheet.getCell(2, totalCols - 2).value = useKhmerDigits ? fmt(maleCount) : maleCount;
  sheet.getCell(2, totalCols - 1).value = useKhmerDigits ? fmt(femaleCount) : femaleCount;
  sheet.getCell(2, totalCols).value = useKhmerDigits ? fmt(summaries.length) : summaries.length;
  for (let c = totalCols - 2; c <= totalCols; c++) {
    sheet.getCell(1, c).font = fontBold;
    sheet.getCell(1, c).border = thinBorder;
    sheet.getCell(1, c).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(2, c).font = fontBold;
    sheet.getCell(2, c).border = thinBorder;
    sheet.getCell(2, c).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const r1 = 4;
  const r2 = 5;
  const r3 = 6;
  sheet.getRow(r1).height = 20;
  sheet.getRow(r2).height = 78;
  sheet.getRow(r3).height = 16;

  sheet.getCell(r1, 1).value = 'ល.រ';
  sheet.getCell(r1, 2).value = 'គោត្តនាម និងនាម';
  sheet.getCell(r1, 3).value = 'ភេទ';
  sheet.mergeCells(r1, 1, r3, 1);
  sheet.mergeCells(r1, 2, r3, 2);
  sheet.mergeCells(r1, 3, r3, 3);

  const sem1Start = 4;
  const sem2Start = sem1Start + semBlockWidth;
  const annualStart = sem2Start + semBlockWidth;

  sheet.mergeCells(r1, sem1Start, r1, sem2Start - 1);
  sheet.getCell(r1, sem1Start).value = `ឆមាសទី ${fmt(1)}`;
  sheet.getCell(r1, sem1Start).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(r1, sem2Start, r1, annualStart - 1);
  sheet.getCell(r1, sem2Start).value = `ឆមាសទី ${fmt(2)}`;
  sheet.getCell(r1, sem2Start).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(r1, annualStart, r1, totalCols);
  sheet.getCell(r1, annualStart).value = 'លទ្ធផលប្រចាំឆ្នាំ';
  sheet.getCell(r1, annualStart).alignment = { horizontal: 'center', vertical: 'middle' };

  const writeSemHeader = (startCol: number) => {
    let col = startCol;
    for (const subj of summarySubjects) {
      sheet.mergeCells(r2, col, r2, col + 1);
      const cell = sheet.getCell(r2, col);
      cell.value = subj.name;
      cell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true };
      sheet.getCell(r3, col).value = 'ព';
      sheet.getCell(r3, col + 1).value = 'ច';
      col += 2;
    }
    const semSummaryHeaders = [
      'សរុបប្រឡង',
      'មធ្យមខែ',
      'មធ្យមប្រឡង',
      'មធ្យមឆមាស',
      'ចំណាត់ថ្នាក់',
    ];
    for (const hLabel of semSummaryHeaders) {
      sheet.mergeCells(r2, col, r3, col);
      const cell = sheet.getCell(r2, col);
      cell.value = hLabel;
      cell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true };
      col++;
    }
  };

  writeSemHeader(sem1Start);
  writeSemHeader(sem2Start);

  ['មធ្យមប្រចាំឆ្នាំ', 'ចំណាត់ថ្នាក់ឆ្នាំ', 'លទ្ធផល'].forEach((label, i) => {
    const col = annualStart + i;
    sheet.mergeCells(r2, col, r3, col);
    const cell = sheet.getCell(r2, col);
    cell.value = label;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      ...(i < 2 ? { textRotation: 90, wrapText: true } : {}),
    };
  });

  for (let r = r1; r <= r3; r++) {
    for (let c = 1; c <= totalCols; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = fontBold;
      cell.border = thinBorder;
      cell.fill = headerFill;
      if (!cell.alignment) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }
  }

  const dataStartRow = 7;
  summaries.forEach((row, idx) => {
    const r = dataStartRow + idx;
    sheet.getRow(r).height = 17;

    sheet.getCell(r, 1).value = useKhmerDigits ? fmt(idx + 1) : idx + 1;
    sheet.getCell(r, 2).value = row.student.nameKm;
    sheet.getCell(r, 3).value = row.student.gender === 'ប្រុស' ? 'ប' : 'ស';

    const putVal = (c: number, v: number | null | undefined, digits = 2) => {
      if (v === null || v === undefined || Number.isNaN(v)) return;
      const str =
        digits === 2 ? formatAverage(v, scoreConfig.averageDecimalMode) : v.toFixed(digits);
      sheet.getCell(r, c).value = useKhmerDigits ? fmt(str) : Number(str);
    };

    const writeSemRow = (
      startCol: number,
      scores: Record<string, number | null>,
      ranks: Record<string, number | null>,
      examTotal: number | null,
      monthlyAvg: number | null,
      examAvg: number | null,
      semAvg: number | null,
      semRank: number | null
    ) => {
      let col = startCol;
      for (const subj of summarySubjects) {
        const sc = scores[subj.id];
        if (typeof sc === 'number' && !Number.isNaN(sc)) {
          sheet.getCell(r, col).value = useKhmerDigits ? fmt(sc) : sc;
        }
        const rk = ranks[subj.id];
        if (typeof rk === 'number') {
          sheet.getCell(r, col + 1).value = useKhmerDigits ? fmt(rk) : rk;
        }
        col += 2;
      }
      putVal(col, examTotal, 1);
      putVal(col + 1, monthlyAvg, 2);
      putVal(col + 2, examAvg, 2);
      putVal(col + 3, semAvg, 2);
      if (semRank !== null) {
        sheet.getCell(r, col + 4).value = useKhmerDigits ? fmt(semRank) : semRank;
      }
    };

    writeSemRow(
      sem1Start,
      row.sem1ExamScores,
      row.sem1SubjectRanks,
      row.sem1ExamTotal,
      row.sem1MonthlyAvg,
      row.sem1ExamAvg,
      row.sem1Avg,
      row.sem1Rank
    );
    writeSemRow(
      sem2Start,
      row.sem2ExamScores,
      row.sem2SubjectRanks,
      row.sem2ExamTotal,
      row.sem2MonthlyAvg,
      row.sem2ExamAvg,
      row.sem2Avg,
      row.sem2Rank
    );

    putVal(annualStart, row.annualAvg, 2);
    if (row.annualRank !== null) {
      sheet.getCell(r, annualStart + 1).value = useKhmerDigits
        ? fmt(row.annualRank)
        : row.annualRank;
    }
    sheet.getCell(r, annualStart + 2).value =
      row.annualPassed === true ? 'ជាប់' : row.annualPassed === false ? 'ធ្លាក់' : '';

    for (let c = 1; c <= totalCols; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = c >= annualStart ? fontBold : fontBase;
      cell.border = thinBorder;
      cell.alignment = {
        horizontal: c === 2 ? 'left' : 'center',
        vertical: 'middle',
      };
    }
  });

  sheet.getColumn(1).width = 4.2;
  sheet.getColumn(2).width = 21;
  sheet.getColumn(3).width = 4;
  for (let c = 4; c <= totalCols; c++) {
    sheet.getColumn(c).width = 4.6;
  }
  sheet.getColumn(annualStart).width = 7.5;
  sheet.getColumn(annualStart + 1).width = 6.5;
  sheet.getColumn(annualStart + 2).width = 7;

  sheet.pageSetup.printTitlesRow = '1:6';

  const sigBase = dataStartRow + summaries.length + 2;
  sheet.getCell(sigBase, 2).value = 'បានឃើញ និងឯកភាព';
  sheet.getCell(sigBase + 1, 2).value = 'នាយកសាលា';
  sheet.getCell(sigBase + 4, 2).value = profile.directorName;

  const rightCol = Math.max(8, totalCols - 6);
  sheet.getCell(sigBase, rightCol).value = 'ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………';
  sheet.getCell(sigBase + 1, rightCol).value = 'គ្រូបន្ទុកថ្នាក់';
  sheet.getCell(sigBase + 4, rightCol).value = profile.teacherName;

  [sigBase, sigBase + 1, sigBase + 4].forEach((r, ri) => {
    [2, rightCol].forEach((c) => {
      sheet.getCell(r, c).font = ri === 0 ? fontBase : fontBold;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = buildExportFileName({
    document: 'តារាងស្រង់ពិន្ទុឆមាស',
    className: cls.name,
    year: cls.academicYear,
    ext: 'xlsx',
    useKhmerDigits,
  });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Exports Monthly Results («លទ្ធផលប្រចាំខែ») ranked table + grade/attendance summary.
 */
export async function exportMonthlyResultsExcel(params: {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  summary: MonthlyResultsSummary;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}): Promise<string> {
  const { cls, profile, month, summary, scoreConfig, signOptions, useKhmerDigits = false } =
    params;

  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';

  const { month: mNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(mNum);

  const sheet = workbook.addWorksheet(safeSheetName(`លទ្ធផល_${monthName}`, 'លទ្ធផល'), {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  });

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9.5 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9.5, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };

  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = `ព្រះរាជាណាចក្រកម្ពុជា — ជាតិ សាសនា ព្រះមហាក្សត្រ`;
  sheet.getCell('A1').font = { ...fontBold, size: 11 };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:L2');
  sheet.getCell('A2').value = `មន្ទីរអប់រំ យុវជន និងកីឡា ${formatMinistryProvince(profile.province)} | ${profile.schoolName}`;
  sheet.getCell('A2').font = fontBase;
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  sheet.mergeCells('A3:L3');
  sheet.getCell('A3').value = `តារាងលទ្ធផលពិន្ទុសិស្សថ្នាក់ទី ${cls.name} ប្រចាំខែ${monthName} (ឆ្នាំសិក្សា ${toKhmerNumerals(cls.academicYear)})`;
  sheet.getCell('A3').font = { ...fontBold, size: 11 };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.addRow([]);

  const rH1 = 5;
  const rH2 = 6;
  const singleHeaders: Array<{ col: number; label: string }> = [
    { col: 1, label: 'ល.រ' },
    { col: 2, label: 'គោត្តនាម-នាម' },
    { col: 3, label: 'ភេទ' },
    { col: 4, label: 'ពិន្ទុសរុប' },
    { col: 5, label: 'មធ្យម' },
    { col: 6, label: 'ចំណាត់ថ្នាក់' },
    { col: 7, label: 'និទ្ទេស' },
    { col: 8, label: 'លទ្ធផល' },
    { col: 12, label: 'ផ្សេងៗ' },
  ];
  for (const h of singleHeaders) {
    sheet.mergeCells(rH1, h.col, rH2, h.col);
    sheet.getCell(rH1, h.col).value = h.label;
  }
  sheet.mergeCells(rH1, 9, rH1, 11);
  sheet.getCell(rH1, 9).value = 'ចំនួនអវត្តមាន';
  sheet.getCell(rH2, 9).value = 'ច្ប';
  sheet.getCell(rH2, 10).value = 'អ.ច្ប';
  sheet.getCell(rH2, 11).value = 'សរុប';

  for (let r = rH1; r <= rH2; r++) {
    for (let c = 1; c <= 12; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = fontBold;
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  summary.rows.forEach((row, idx) => {
    const avgStr =
      row.average !== null ? formatAverage(row.average, scoreConfig.averageDecimalMode) : '';
    const r = sheet.addRow([
      fmt(idx + 1),
      row.student.nameKm,
      row.student.gender === 'ប្រុស' ? 'ប' : 'ស',
      row.total !== null
        ? useKhmerDigits
          ? fmt(Number.isInteger(row.total) ? row.total : row.total.toFixed(1))
          : Number(row.total.toFixed(1))
        : '',
      avgStr ? (useKhmerDigits ? fmt(avgStr) : Number(avgStr)) : '',
      row.rank !== null ? (useKhmerDigits ? fmt(row.rank) : row.rank) : '',
      row.grade ?? '',
      row.passed === true ? 'ជាប់' : row.passed === false ? 'ធ្លាក់' : '',
      row.attendance.excused > 0
        ? useKhmerDigits
          ? fmt(row.attendance.excused)
          : row.attendance.excused
        : '',
      row.attendance.unexcused > 0
        ? useKhmerDigits
          ? fmt(row.attendance.unexcused)
          : row.attendance.unexcused
        : '',
      row.attendance.total > 0
        ? useKhmerDigits
          ? fmt(row.attendance.total)
          : row.attendance.total
        : '',
      row.note,
    ]);
    r.eachCell((cell, colNum) => {
      cell.font = colNum === 6 ? { ...fontBold, color: { argb: 'FFDC2626' } } : fontBase;
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum === 2 || colNum === 12 ? 'left' : 'center',
      };
    });
  });

  sheet.addRow([]);
  sheet.addRow([
    `ចំនួនសិស្សសរុប: ${fmt(summary.totalStudents)} នាក់, ស្រី: ${fmt(summary.femaleStudents)} នាក់`,
  ]);
  for (let i = 0; i < GRADE_ORDER.length; i += 2) {
    const g1 = GRADE_ORDER[i];
    const g2 = GRADE_ORDER[i + 1];
    sheet.addRow([
      `-និទ្ទេស ${g1}: ${fmt(summary.gradeCounts[g1].total)} នាក់, ស្រី ${fmt(summary.gradeCounts[g1].female)} នាក់`,
      '',
      '',
      '',
      g2
        ? `-និទ្ទេស ${g2}: ${fmt(summary.gradeCounts[g2].total)} នាក់, ស្រី ${fmt(summary.gradeCounts[g2].female)} នាក់`
        : '',
    ]);
  }
  sheet.addRow([
    `សិស្សមិនមករៀនសោះក្នុងខែ: ${fmt(summary.absentAllMonth.total)} នាក់, ស្រី ${fmt(summary.absentAllMonth.female)} នាក់`,
  ]);

  sheet.addRow([]);
  const lunarLine = signOptions.lunarDate || 'ថ្ងៃ……………… ខែ……………… ឆ្នាំ……………… ព.ស. ២៥……';
  const gregLine = formatDocumentGregorianDate(signOptions.place, signOptions.gregorianDate);
  sheet.addRow(['', 'បានឃើញ និងឯកភាព', '', '', '', '', '', lunarLine]);
  sheet.addRow(['', lunarLine, '', '', '', '', '', gregLine]);
  sheet.addRow(['', gregLine, '', '', '', '', '', 'គ្រូបន្ទុកថ្នាក់']);
  sheet.addRow(['', 'នាយក/នាយិកាសាលា']);
  sheet.addRow([]);
  sheet.addRow(['', profile.directorName, '', '', '', '', '', profile.teacherName]);

  [5, 22, 6, 10, 10, 10, 8, 9, 6, 7, 7, 14].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = buildExportFileName({
    document: 'លទ្ធផលប្រចាំខែ',
    className: cls.name,
    month,
    ext: 'xlsx',
    useKhmerDigits,
  });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Exports Semester Results («លទ្ធផលប្រចាំឆមាស») ranked table + grade/attendance summary.
 */
export async function exportSemesterResultsExcel(params: {
  cls: SchoolClass;
  profile: Profile;
  summary: SemesterResultsSummary;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}): Promise<string> {
  const { cls, profile, summary, scoreConfig, signOptions, useKhmerDigits = false } = params;

  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';

  const sheet = workbook.addWorksheet(
    safeSheetName(`លទ្ធផលឆមាសទី_${summary.semester}_${cls.name}`, `Semester_${summary.semester}`),
    {
      pageSetup: {
        paperSize: 9,
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      },
    }
  );

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9.5 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9.5, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };

  sheet.mergeCells('A1:M1');
  sheet.getCell('A1').value = `ព្រះរាជាណាចក្រកម្ពុជា — ជាតិ សាសនា ព្រះមហាក្សត្រ`;
  sheet.getCell('A1').font = { ...fontBold, size: 11 };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:N2');
  sheet.getCell('A2').value = `មន្ទីរអប់រំ យុវជន និងកីឡា ${formatMinistryProvince(profile.province)} | ${profile.schoolName}`;
  sheet.getCell('A2').font = fontBase;
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  sheet.mergeCells('A3:N3');
  sheet.getCell('A3').value = `តារាងលទ្ធផលពិន្ទុសិស្សថ្នាក់ទី ${cls.name} ប្រចាំឆមាសទី ${toKhmerNumerals(summary.semester)} (ឆ្នាំសិក្សា ${toKhmerNumerals(cls.academicYear)})`;
  sheet.getCell('A3').font = { ...fontBold, size: 11 };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.addRow([]);

  const rH1 = 5;
  const rH2 = 6;
  const singleHeaders: Array<{ col: number; label: string }> = [
    { col: 1, label: 'ល.រ' },
    { col: 2, label: 'គោត្តនាម-នាម' },
    { col: 3, label: 'ភេទ' },
    { col: 4, label: 'ខែប្រចាំ\nឆមាស' },
    { col: 5, label: 'ប្រឡង\nឆមាស' },
    { col: 6, label: 'ពិន្ទុសរុប' },
    { col: 7, label: 'មធ្យម' },
    { col: 8, label: 'ចំណាត់ថ្នាក់' },
    { col: 9, label: 'និទ្ទេស' },
    { col: 10, label: 'លទ្ធផល' },
    { col: 14, label: 'ផ្សេងៗ' },
  ];
  for (const h of singleHeaders) {
    sheet.mergeCells(rH1, h.col, rH2, h.col);
    sheet.getCell(rH1, h.col).value = h.label;
  }
  sheet.mergeCells(rH1, 11, rH1, 13);
  sheet.getCell(rH1, 11).value = 'ចំនួនអវត្តមាន';
  sheet.getCell(rH2, 11).value = 'ច្ប';
  sheet.getCell(rH2, 12).value = 'អ.ច្ប';
  sheet.getCell(rH2, 13).value = 'សរុប';

  for (let r = rH1; r <= rH2; r++) {
    for (let c = 1; c <= 14; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = fontBold;
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  const fmtAvgCell = (v: number | null) => {
    if (v === null) return '';
    const s = formatAverage(v, scoreConfig.averageDecimalMode);
    return useKhmerDigits ? fmt(s) : Number(s);
  };

  summary.rows.forEach((row, idx) => {
    const r = sheet.addRow([
      fmt(idx + 1),
      row.student.nameKm,
      row.student.gender === 'ប្រុស' ? 'ប' : 'ស',
      fmtAvgCell(row.monthlyAvg),
      fmtAvgCell(row.examAvg),
      fmtAvgCell(row.semesterTotal),
      fmtAvgCell(row.semesterAvg),
      row.rank !== null ? (useKhmerDigits ? fmt(row.rank) : row.rank) : '',
      row.grade ?? '',
      row.passed === true ? 'ជាប់' : row.passed === false ? 'ធ្លាក់' : '',
      useKhmerDigits ? fmt(row.attendance.excused) : row.attendance.excused,
      useKhmerDigits ? fmt(row.attendance.unexcused) : row.attendance.unexcused,
      useKhmerDigits ? fmt(row.attendance.total) : row.attendance.total,
      row.note,
    ]);
    r.eachCell((cell, colNum) => {
      cell.font = colNum === 8 ? { ...fontBold, color: { argb: 'FFDC2626' } } : fontBase;
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum === 2 || colNum === 14 ? 'left' : 'center',
      };
    });
  });

  sheet.addRow([]);
  sheet.addRow([
    `បញ្ឈប់បញ្ជីចំនួនសិស្សសរុប: ${fmt(summary.totalStudents)} នាក់, ស្រី: ${fmt(summary.femaleStudents)} នាក់`,
  ]);
  for (let i = 0; i < 3; i++) {
    const g1 = GRADE_ORDER[i];
    const g2 = GRADE_ORDER[i + 3];
    sheet.addRow([
      `-និទ្ទេស ${g1}: ${fmt(summary.gradeCounts[g1].total)} នាក់, ស្រី ${fmt(summary.gradeCounts[g1].female)} នាក់`,
      '',
      '',
      '',
      g2
        ? `-និទ្ទេស ${g2}: ${fmt(summary.gradeCounts[g2].total)} នាក់, ស្រី ${fmt(summary.gradeCounts[g2].female)} នាក់`
        : '',
    ]);
  }
  sheet.addRow([
    `សិស្សមិនមករៀនសោះក្នុងឆមាស: ${fmt(summary.absentAllSemester.total)} នាក់, ស្រី ${fmt(summary.absentAllSemester.female)} នាក់`,
  ]);

  sheet.addRow([]);
  const lunarLine = signOptions.lunarDate || 'ថ្ងៃ…………… ខែ………… ឆ្នាំ………… ព.ស. ២៥……';
  const gregLine = formatDocumentGregorianDate(signOptions.place, signOptions.gregorianDate);
  sheet.addRow(['', 'បានឃើញ និងឯកភាព', '', '', '', '', '', '', lunarLine]);
  sheet.addRow(['', lunarLine, '', '', '', '', '', '', gregLine]);
  sheet.addRow(['', gregLine, '', '', '', '', '', '', 'គ្រូបន្ទុកថ្នាក់']);
  sheet.addRow(['', 'នាយក/នាយិកាសាលា']);
  sheet.addRow([]);
  sheet.addRow(['', profile.directorName, '', '', '', '', '', '', profile.teacherName]);

  [5, 22, 6, 11, 11, 10, 10, 10, 8, 9, 6, 7, 7, 14].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = buildExportFileName({
    document: `លទ្ធផលឆមាសទី_${summary.semester}`,
    className: cls.name,
    year: cls.academicYear,
    ext: 'xlsx',
    useKhmerDigits,
  });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Exports Annual Results («លទ្ធផលប្រចាំឆ្នាំ») ranked table + grade/fail summary.
 */
export async function exportAnnualResultsExcel(params: {
  cls: SchoolClass;
  profile: Profile;
  summary: AnnualResultsSummary;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}): Promise<string> {
  const { cls, profile, summary, scoreConfig, signOptions, useKhmerDigits = false } = params;

  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KruDesk';

  const sheet = workbook.addWorksheet(
    safeSheetName(`លទ្ធផលប្រចាំឆ្នាំ_${cls.name}`, 'Annual'),
    {
      pageSetup: {
        paperSize: 9,
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      },
    }
  );

  const fontBase: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9.5 };
  const fontBold: Partial<ExcelJS.Font> = { name: 'Khmer OS Battambang', size: 9.5, bold: true };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };

  sheet.mergeCells('A1:M1');
  sheet.getCell('A1').value = `ព្រះរាជាណាចក្រកម្ពុជា — ជាតិ សាសនា ព្រះមហាក្សត្រ`;
  sheet.getCell('A1').font = { ...fontBold, size: 11 };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:M2');
  sheet.getCell('A2').value = `មន្ទីរអប់រំ យុវជន និងកីឡា ${formatMinistryProvince(profile.province)} | ${profile.schoolName}`;
  sheet.getCell('A2').font = fontBase;
  sheet.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  sheet.mergeCells('A3:M3');
  sheet.getCell('A3').value = `តារាងលទ្ធផលពិន្ទុសិស្សថ្នាក់ទី ${cls.name} (ឆ្នាំសិក្សា ${toKhmerNumerals(cls.academicYear)})`;
  sheet.getCell('A3').font = { ...fontBold, size: 11 };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.addRow([]);

  const rH1 = 5;
  const rH2 = 6;
  const singleHeaders: Array<{ col: number; label: string }> = [
    { col: 1, label: 'ល.រ' },
    { col: 2, label: 'គោត្តនាម-នាម' },
    { col: 3, label: 'ភេទ' },
    { col: 4, label: 'ប្រចាំឆមាសទី ១' },
    { col: 5, label: 'ប្រចាំឆមាសទី ២' },
    { col: 6, label: 'មធ្យម' },
    { col: 7, label: 'ចំណាត់ថ្នាក់' },
    { col: 8, label: 'និទ្ទេស' },
    { col: 9, label: 'លទ្ធផល' },
    { col: 13, label: 'ផ្សេងៗ' },
  ];
  for (const h of singleHeaders) {
    sheet.mergeCells(rH1, h.col, rH2, h.col);
    sheet.getCell(rH1, h.col).value = h.label;
  }
  sheet.mergeCells(rH1, 10, rH1, 12);
  sheet.getCell(rH1, 10).value = 'ចំនួនអវត្តមាន';
  sheet.getCell(rH2, 10).value = 'ច្ប';
  sheet.getCell(rH2, 11).value = 'អ.ច្ប';
  sheet.getCell(rH2, 12).value = 'សរុប';

  for (let r = rH1; r <= rH2; r++) {
    for (let c = 1; c <= 13; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = fontBold;
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  const fmtAvgCell = (v: number | null) => {
    if (v === null) return '';
    const s = formatAverage(v, scoreConfig.averageDecimalMode);
    return useKhmerDigits ? fmt(s) : Number(s);
  };

  summary.rows.forEach((row, idx) => {
    const r = sheet.addRow([
      fmt(idx + 1),
      row.student.nameKm,
      row.student.gender === 'ប្រុស' ? 'ប' : 'ស',
      fmtAvgCell(row.sem1Avg),
      fmtAvgCell(row.sem2Avg),
      fmtAvgCell(row.annualAvg),
      row.rank !== null ? (useKhmerDigits ? fmt(row.rank) : row.rank) : '',
      row.grade ?? '',
      row.passed === true ? 'ជាប់' : row.passed === false ? 'ធ្លាក់' : '',
      useKhmerDigits ? fmt(row.attendance.excused) : row.attendance.excused,
      useKhmerDigits ? fmt(row.attendance.unexcused) : row.attendance.unexcused,
      useKhmerDigits ? fmt(row.attendance.total) : row.attendance.total,
      row.note,
    ]);
    r.eachCell((cell, colNum) => {
      cell.font = colNum === 7 ? { ...fontBold, color: { argb: 'FFDC2626' } } : fontBase;
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum === 2 || colNum === 13 ? 'left' : 'center',
      };
    });
  });

  sheet.addRow([]);
  sheet.addRow([
    `ចំនួនសិស្សសរុប: ${fmt(summary.totalStudents)} នាក់, ស្រី: ${fmt(summary.femaleStudents)} នាក់`,
  ]);
  for (let i = 0; i < GRADE_ORDER.length; i += 2) {
    const g1 = GRADE_ORDER[i];
    const g2 = GRADE_ORDER[i + 1];
    sheet.addRow([
      `-និទ្ទេស ${g1}: ${fmt(summary.gradeCounts[g1].total)} នាក់, ស្រី ${fmt(summary.gradeCounts[g1].female)} នាក់`,
      '',
      '',
      '',
      g2
        ? `-និទ្ទេស ${g2}: ${fmt(summary.gradeCounts[g2].total)} នាក់, ស្រី ${fmt(summary.gradeCounts[g2].female)} នាក់`
        : '',
    ]);
  }
  sheet.addRow([
    `សិស្សធ្លាក់: ${fmt(summary.failedCount.total)} នាក់, ស្រី ${fmt(summary.failedCount.female)} នាក់`,
  ]);

  sheet.addRow([]);
  const lunarLine = signOptions.lunarDate || 'ថ្ងៃ…………… ខែ………… ឆ្នាំ………… ព.ស. ២៥……';
  const gregLine = formatDocumentGregorianDate(signOptions.place, signOptions.gregorianDate);
  sheet.addRow(['', 'បានឃើញ និងឯកភាព', '', '', '', '', '', '', lunarLine]);
  sheet.addRow(['', lunarLine, '', '', '', '', '', '', gregLine]);
  sheet.addRow(['', gregLine, '', '', '', '', '', '', 'គ្រូបន្ទុកថ្នាក់']);
  sheet.addRow(['', 'នាយក/នាយិកាសាលា']);
  sheet.addRow([]);
  sheet.addRow(['', profile.directorName, '', '', '', '', '', '', profile.teacherName]);

  [5, 22, 6, 11, 11, 11, 10, 8, 9, 6, 7, 7, 16].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = buildExportFileName({
    document: 'លទ្ធផលប្រចាំឆ្នាំ',
    className: cls.name,
    year: cls.academicYear,
    ext: 'xlsx',
    useKhmerDigits,
  });
  triggerBlobDownload(blob, fileName);
  return fileName;
}

