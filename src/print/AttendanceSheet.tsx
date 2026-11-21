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
import { DocumentSignature } from './DocumentSignature';

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

  const studentPages: Array<{ items: Student[]; startIndex: number }> = [];
  for (let i = 0; i < activeStudents.length; i += MAX_ROWS_PER_PAGE) {
    studentPages.push({
      items: activeStudents.slice(i, i + MAX_ROWS_PER_PAGE),
      startIndex: i,
    });
  }
  if (studentPages.length === 0) {
    studentPages.push({ items: [], startIndex: 0 });
  }

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
          const pageRowCount = pg.items.length;

          // Adaptive sizing for A4 landscape (205mm usable height, 285mm usable width)
          // accounting for Khmer Battambang glyph height + daily total row + signature.
          const rowHeightMm = pageRowCount > 39 ? 2.8 : pageRowCount > 30 ? 3.15 : 3.9;
          const fontSizePt = pageRowCount > 39 ? 7.4 : pageRowCount > 30 ? 8.0 : 8.8;
          const idFontPt = pageRowCount > 39 ? 7.0 : pageRowCount > 30 ? 7.5 : 8.2;
          const dayFontPt = pageRowCount > 39 ? 6.8 : pageRowCount > 30 ? 7.2 : 7.8;
          const signFontPt = pageRowCount > 39 ? 9.2 : pageRowCount > 30 ? 9.8 : 10.5;
          const signGapMm = pageRowCount > 39 ? 8 : pageRowCount > 30 ? 10 : 14;
          const signMarginTopMm = pageRowCount > 39 ? 0.5 : pageRowCount > 30 ? 1.5 : 3;

          return (
            <div
              key={`${mData.month}-${pageIdx}`}
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
            >
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
                  style={{ fontSize: `${fontSizePt}pt`, tableLayout: 'fixed', lineHeight: 0.96 }}
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
                        style={{ width: '14.5mm' }}
                      >
                        អត្តលេខ
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-black px-1.5 text-left font-bold"
                        style={{ width: '44mm' }}
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
                        style={{ width: '16.5mm', fontSize: `${dayFontPt}pt` }}
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
                            style={{ padding: 0, lineHeight: 0.96, height: `${rowHeightMm}mm` }}
                          >
                            {fmt(rowOrder)}
                          </td>
                          <td
                            className="border border-black px-0.5 text-center font-mono truncate"
                            style={{ fontSize: `${idFontPt}pt`, padding: '0 2px', lineHeight: 0.96 }}
                          >
                            {fmt(s.studentId)}
                          </td>
                          <td
                            className="border border-black px-1.5 truncate font-medium"
                            style={{ padding: '0 4px', lineHeight: 1.05 }}
                          >
                            {s.nameKm}
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
                                className={`border border-black text-center leading-none ${
                                  code ? 'font-bold' : ''
                                }`}
                                style={{
                                  backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                                  color: codeColor,
                                  fontSize: `${Math.max(6.4, dayFontPt - 0.5)}pt`,
                                  padding: 0,
                                }}
                              >
                                {code || ''}
                              </td>
                            );
                          })}
                          <td className="border border-black text-center leading-none">
                            {summary.excused > 0 ? fmt(summary.excused) : ''}
                          </td>
                          <td
                            className="border border-black text-center leading-none"
                            style={{ color: summary.unexcused > 0 ? '#b91c1c' : undefined }}
                          >
                            {summary.unexcused > 0 ? fmt(summary.unexcused) : ''}
                          </td>
                          <td className="border border-black text-center font-bold leading-none">
                            {summary.total > 0 ? fmt(summary.total) : ''}
                          </td>
                          <td className="border border-black"></td>
                        </tr>
                      );
                    })}

                    {/* Daily absence footer row on last page of month */}
                    {isLastPageOfMonth && (
                      <tr className="bg-slate-50 font-bold" style={{ height: `${rowHeightMm}mm` }}>
                        <td
                          colSpan={3}
                          className="border border-black px-1.5 text-center leading-none"
                          style={{ fontSize: `${Math.max(7.2, fontSizePt - 0.4)}pt` }}
                        >
                          សរុបអវត្តមានប្រចាំថ្ងៃ
                        </td>
                        {dayInfos.map((d, di) => (
                          <td
                            key={d.day}
                            className="border border-black text-center leading-none"
                            style={{
                              backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                              fontSize: `${dayFontPt}pt`,
                              padding: 0,
                            }}
                          >
                            {dailyTotals[di] !== null && dailyTotals[di]! > 0
                              ? fmt(dailyTotals[di]!)
                              : ''}
                          </td>
                        ))}
                        <td className="border border-black text-center leading-none">
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
                        <td className="border border-black text-center leading-none">
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
                        <td className="border border-black text-center leading-none">
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
                <div style={{ marginTop: `${signMarginTopMm}mm` }}>
                  <DocumentSignature
                    profile={profile}
                    fontSizePt={signFontPt}
                    gapMm={signGapMm}
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
          );
        });
      })}
    </div>
  );
};
