import React from 'react';
import type { AbsenceCode, AttendanceConfig, Profile, SchoolClass, Student } from '../types/domain';
import {
  computeDailyAbsenceTotals,
  computeStudentMonthlyAttendance,
  getActiveStudentsOrdered,
  getMonthDayInfos,
  makeAttendanceCellKey,
} from '../lib/attendance';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentSignature, estimateSignatureBlockHeightMm } from './DocumentSignature';
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';
import { usePrintLayoutStore } from '../store/usePrintLayoutStore';

export interface AttendanceMonthRenderData {
  month: string; // YYYY-MM
  lookup: Map<string, AbsenceCode>;
  takenDates: Set<string>;
}

interface AttendanceSheetProps {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  monthsData: AttendanceMonthRenderData[];
  attendanceConfig: AttendanceConfig;
  holidayDates: Set<string>;
  todayKey: string;
  useKhmerDigits?: boolean;
}

const MAX_ROWS_PER_PAGE = 45;

/**
 * Layout tiers by rows on the page: above 39 rows the dense 3.2 mm rows; 26–39 rows the middle
 * tier (8pt), at most 25 the large tier (measured 2026-11-24).
 */
const DENSE_ROWS = 39;
const COMPACT_ROWS = 25;

/**
 * Signature block under the table, by rows on the page. The gap is the room left for the
 * handwritten signatures of the teacher and the director (2026-11-24): 14 mm on a full 40–45-row
 * page, 14 mm at 36–39 rows (middle tier with tighter cells), 16 mm at 26–35 rows, 20 mm otherwise.
 */
function signLayoutForRows(rows: number) {
  if (rows > DENSE_ROWS) return { gapMm: 14, fontPt: 7.8, marginTopMm: 0, ptMm: 0.8 };
  if (rows > 35) return { gapMm: 14, fontPt: 9.5, marginTopMm: 0, ptMm: 1.2 };
  if (rows > COMPACT_ROWS) return { gapMm: 16, fontPt: 9.5, marginTopMm: 0.5, ptMm: 1.2 };
  return { gapMm: 20, fontPt: 10.5, marginTopMm: 2, ptMm: undefined };
}

/** Height of the signature block (with its top margin) — what the last page must keep free. */
function signBlockMm(rows: number): number {
  const sign = signLayoutForRows(rows);
  return (
    sign.marginTopMm +
    estimateSignatureBlockHeightMm({ gapMm: sign.gapMm, fontSizePt: sign.fontPt, ptMm: sign.ptMm })
  );
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  cls,
  students,
  profile,
  monthsData,
  attendanceConfig,
  holidayDates,
  todayKey,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const activeStudents = getActiveStudentsOrdered(
    students,
    monthsData.length === 1 ? monthsData[0].month : undefined
  );
  const maleCount = activeStudents.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = activeStudents.filter((s) => s.gender === 'ស្រី').length;

  const hasLongStudentId = activeStudents.some((s) => (s.studentId || '').length > 8);
  const idColWidthMm = hasLongStudentId ? 21.5 : 14.5;
  const nameColWidthMm = hasLongStudentId ? 41 : 44;
  const noteColWidthMm = hasLongStudentId ? 12.5 : 16.5;

  // «បង្រួមដាក់ក្នុង ១ ទំព័រ»: every row on one page, scaled to fit by fitPageToOnePage.
  const fitOnePage = usePrintLayoutStore((s) => s.fitOnePage);
  const splitPages = paginateByRowHeight({
    items: activeStudents,
    maxRowsPerPage: MAX_ROWS_PER_PAGE,
    nonLastPageBudgetMm: 176,
    // Rows + signature area measured at 180 mm (after the daily-total row); keep the signature block free.
    lastPageBudgetMm: 178 - signBlockMm(activeStudents.length),
    getRowHeightMm: (s) => {
      const nameLines = estimateWrappedLines(s.nameKm, nameColWidthMm - 1.5, 6.0, 2);
      const idLines = estimateWrappedLines(fmt(s.studentId), idColWidthMm - 1, 6.0, 2);
      const lines = Math.max(nameLines, idLines);
      const dense = activeStudents.length > DENSE_ROWS;
      // Dense rows render 3.2 mm (line-height 1.12, no cell padding); a 2-line name about 4 mm.
      // Rendered: middle tier 3.8 mm, otherwise about 4.3 mm.
      const singleH = dense
        ? 3.25
        : activeStudents.length > 35
          ? 3.65 // tighter cells from 36 rows
          : activeStudents.length > COMPACT_ROWS
            ? 3.8
            : 4.3;
      return lines > 1 ? Math.max(singleH, lines * (dense ? 2.5 : 3.35)) : singleH;
    },
  });
  const studentPages = fitOnePage ? [{ items: activeStudents, startIndex: 0 }] : splitPages;

  return (
    <div className="bg-white text-black font-battambang">
      {monthsData.map((mData, mIdx) => {
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

        return studentPages.map((pg, pageIdx) => {
          const isLastPageOfMonth = pageIdx === studentPages.length - 1;
          const isVeryLastPage =
            mIdx === monthsData.length - 1 && isLastPageOfMonth;
          // Layout tier (fonts, row height, signing gap) follows the class size, not the rows on this
          // page: every page of a split sheet looks the same and matches the pagination estimates.
          const tierRows = activeStudents.length;

          // Adaptive sizing for A4 landscape (205mm usable height, 285mm usable width)
          // accounting for Khmer Battambang glyph height + daily total row + signature.
          const rowHeightMm = tierRows > DENSE_ROWS ? 3.2 : tierRows > COMPACT_ROWS ? 3.6 : 4.1;
          const fontSizePt = tierRows > DENSE_ROWS ? 7.0 : tierRows > COMPACT_ROWS ? 8.0 : 8.8;
          const baseIdFontPt = tierRows > DENSE_ROWS ? 7.0 : tierRows > COMPACT_ROWS ? 7.6 : 8.2;
          const idFontPt = baseIdFontPt;
          const dayFontPt = tierRows > DENSE_ROWS ? 7.0 : tierRows > COMPACT_ROWS ? 7.4 : 7.8;
          const sign = signLayoutForRows(tierRows);
          // From 36 rows: tighter line boxes so the rows still leave room for the signatures.
          const cellLineHeight = tierRows > 35 ? 1.12 : 1.25;
          const sumCellPad = tierRows > COMPACT_ROWS ? ' p-0' : '';

          return (
            <div
              // Mode in the key: switching «១ ទំព័រ» remounts the page, dropping fit styles/data-fit-scale.
              key={`${fitOnePage ? 'fit' : 'flow'}-${mData.month}-${pageIdx}`}
              data-print-page
              style={{
                width: '297mm',
                height: '210mm',
                padding: '2.5mm 6mm',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: !isVeryLastPage ? 'always' : 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
              data-can-fit-one-page={!fitOnePage && studentPages.length > 1 ? '1' : undefined}
            >
              <div data-fit-body className={fitOnePage ? 'flex flex-col' : 'flex flex-col flex-1'}>
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="text-[9.5pt] flex flex-wrap items-center gap-x-3">
                    <span>
                      <strong className="font-bold">{profile.schoolName}</strong>
                    </span>
                    <span>
                      ថ្នាក់ទី <strong>{cls.name}</strong>
                    </span>
                    <span>
                      ឆ្នាំសិក្សា <strong>{fmt(cls.academicYear)}</strong>
                    </span>
                  </div>

                  <div
                    style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                    className="text-[11.5pt] shrink-0"
                  >
                    បញ្ជីវត្តមានខែ{monthName}
                  </div>

                  <table className="border-collapse text-[8.5pt] shrink-0">
                    <thead>
                      <tr>
                        <th className="border border-black px-2 py-0.5 bg-slate-100 font-bold">
                          ប្រុស
                        </th>
                        <th className="border border-black px-2 py-0.5 bg-slate-100 font-bold">
                          ស្រី
                        </th>
                        <th className="border border-black px-2 py-0.5 bg-slate-100 font-bold">
                          សរុប
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-black px-2 py-0.5 text-center font-bold">
                          {fmt(maleCount)}
                        </td>
                        <td className="border border-black px-2 py-0.5 text-center font-bold">
                          {fmt(femaleCount)}
                        </td>
                        <td className="border border-black px-2 py-0.5 text-center font-bold">
                          {fmt(activeStudents.length)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Attendance Table */}
                <table
                  className="w-full border-collapse"
                  style={{
                    fontSize: `${fontSizePt}pt`,
                    tableLayout: 'fixed',
                    lineHeight: tierRows > DENSE_ROWS ? 1.1 : 1.15,
                  }}
                >
                  <thead>
                    <tr className="bg-slate-100">
                      <th
                        rowSpan={2}
                        className="border border-black text-center font-bold"
                        style={{ width: '6.5mm' }}
                      >
                        ល.រ
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-black text-center font-bold"
                        style={{ width: `${idColWidthMm}mm` }}
                      >
                        អត្តលេខ
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-black px-1.5 text-left font-bold"
                        style={{ width: `${nameColWidthMm}mm` }}
                      >
                        គោត្តនាម និងនាម
                      </th>
                      {dayInfos.map((d) => (
                        <th
                          key={d.day}
                          rowSpan={2}
                          className="border border-black text-center font-bold"
                          style={{
                            backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                            fontSize: `${dayFontPt}pt`,
                            padding: 0,
                          }}
                        >
                          {fmt(d.day)}
                        </th>
                      ))}
                      <th
                        colSpan={3}
                        className="border border-black text-center font-bold"
                        style={{ width: '23.5mm', fontSize: `${dayFontPt}pt`, padding: '1px 0' }}
                      >
                        ចំនួនអវត្តមាន
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-black text-center font-bold"
                        style={{ width: `${noteColWidthMm}mm`, fontSize: `${dayFontPt}pt` }}
                      >
                        សេចក្ដីផ្សេងៗ
                      </th>
                    </tr>
                    <tr className="bg-slate-100" style={{ fontSize: `${dayFontPt}pt` }}>
                      <th className="border border-black text-center font-bold" style={{ width: '7.5mm' }}>
                        ច្ប
                      </th>
                      <th className="border border-black text-center font-bold" style={{ width: '8.5mm' }}>
                        អច្ប
                      </th>
                      <th className="border border-black text-center font-bold" style={{ width: '7.5mm' }}>
                        សរុប
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pg.items.map((s, idx) => {
                      const rowOrder = pg.startIndex + idx + 1;
                      const summary =
                        s.id !== undefined
                          ? computeStudentMonthlyAttendance(s.id, mData.lookup, dayInfos)
                          : { excused: 0, unexcused: 0, total: 0, sickCount: 0 };

                      return (
                        <tr key={s.id ?? s.studentId} style={{ height: `${rowHeightMm}mm` }}>
                          <td
                            className="border border-black text-center"
                            style={{ padding: 0, lineHeight: 1.15, height: `${rowHeightMm}mm` }}
                          >
                            {fmt(rowOrder)}
                          </td>
                          <td
                            className="border border-black px-0.5 text-center font-mono"
                            style={{ fontSize: `${idFontPt}pt`, padding: '0 2px', lineHeight: cellLineHeight }}
                          >
                            <FitText text={fmt(s.studentId)} basePt={idFontPt} minPt={6.0} lineHeight={cellLineHeight} />
                          </td>
                          <td
                            className="border border-black px-1.5 font-medium"
                            style={{ padding: '0 4px', lineHeight: cellLineHeight }}
                          >
                            <FitText text={s.nameKm} basePt={fontSizePt} minPt={6.0} lineHeight={cellLineHeight} />
                          </td>
                          {dayInfos.map((d) => {
                            const code =
                              d.isTaken && s.id !== undefined
                                ? mData.lookup.get(makeAttendanceCellKey(s.id, d.dateKey))
                                : undefined;
                            const codeColor =
                              code === 'អច្ប'
                                ? '#b91c1c'
                                : code === 'ច្ប' || code === 'ឈ'
                                  ? '#1d4ed8'
                                  : undefined;
                            return (
                              <td
                                key={d.day}
                                className={`border border-black text-center ${
                                  code ? 'font-bold' : ''
                                }`}
                                style={{
                                  backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                                  color: codeColor,
                                  fontSize: '7pt',
                                  lineHeight: 1.15,
                                  padding: 0,
                                }}
                              >
                                {code || ''}
                              </td>
                            );
                          })}
                          <td className={`border border-black text-center${sumCellPad}`}>
                            {summary.excused > 0 ? fmt(summary.excused) : ''}
                          </td>
                          <td
                            className={`border border-black text-center${sumCellPad}`}
                            style={{ color: summary.unexcused > 0 ? '#b91c1c' : undefined }}
                          >
                            {summary.unexcused > 0 ? fmt(summary.unexcused) : ''}
                          </td>
                          <td className={`border border-black text-center font-bold${sumCellPad}`}>
                            {summary.total > 0 ? fmt(summary.total) : ''}
                          </td>
                          <td className={`border border-black${sumCellPad}`}></td>
                        </tr>
                      );
                    })}

                    {/* Daily absence footer row on last page of month */}
                    {isLastPageOfMonth && (
                      <tr className="bg-slate-50 font-bold" style={{ height: `${rowHeightMm}mm` }}>
                        <td
                          colSpan={3}
                          className="border border-black px-1.5 text-center"
                          style={{ fontSize: `${Math.max(7.5, fontSizePt)}pt`, lineHeight: 1.2 }}
                        >
                          សរុបអវត្តមានប្រចាំថ្ងៃ
                        </td>
                        {dayInfos.map((d, di) => (
                          <td
                            key={d.day}
                            className="border border-black text-center"
                            style={{
                              backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                              fontSize: `${dayFontPt}pt`,
                              lineHeight: 1.15,
                              padding: 0,
                            }}
                          >
                            {dailyTotals[di] !== null && dailyTotals[di]! > 0
                              ? fmt(dailyTotals[di]!)
                              : ''}
                          </td>
                        ))}
                        <td className="border border-black text-center">
                          {fmt(
                            activeStudents.reduce(
                              (acc, st) =>
                                acc +
                                (st.id !== undefined
                                  ? computeStudentMonthlyAttendance(st.id, mData.lookup, dayInfos)
                                      .excused
                                  : 0),
                              0
                            )
                          )}
                        </td>
                        <td className="border border-black text-center">
                          {fmt(
                            activeStudents.reduce(
                              (acc, st) =>
                                acc +
                                (st.id !== undefined
                                  ? computeStudentMonthlyAttendance(st.id, mData.lookup, dayInfos)
                                      .unexcused
                                  : 0),
                              0
                            )
                          )}
                        </td>
                        <td className="border border-black text-center">
                          {fmt(
                            activeStudents.reduce(
                              (acc, st) =>
                                acc +
                                (st.id !== undefined
                                  ? computeStudentMonthlyAttendance(st.id, mData.lookup, dayInfos)
                                      .total
                                  : 0),
                              0
                            )
                          )}
                        </td>
                        <td className="border border-black"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Signature block ONLY on the last page of the month */}
              {isLastPageOfMonth ? (
                <div style={{ marginTop: `${sign.marginTopMm}mm` }}>
                  <DocumentSignature
                    profile={profile}
                    fontSizePt={sign.fontPt}
                    gapMm={sign.gapMm}
                    ptMm={sign.ptMm}
                    middle={
                      studentPages.length > 1 && (
                        <div className="text-[8.5pt] text-slate-500">
                          ទំព័រ {fmt(pageIdx + 1)} / {fmt(studentPages.length)}
                        </div>
                      )
                    }
                  />
                </div>
              ) : (
                <div className="mt-auto text-center text-[8.5pt] text-slate-500 pt-1">
                  ទំព័រ {fmt(pageIdx + 1)} / {fmt(studentPages.length)}
                </div>
              )}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
};
