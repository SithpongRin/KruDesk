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

        const rowCount = Math.max(1, studentPages[0].items.length);
        const isDense = rowCount > 36;
        const rowHeightMm = isDense ? 3.25 : 4.2;
        const fontSizePt = isDense ? 7.5 : 8.5;
        const signGapMm = isDense ? 10 : 16;

        return studentPages.map((pg, pageIdx) => {
          const isLastPageOfMonth = pageIdx === studentPages.length - 1;
          const isVeryLastPage =
            mIdx === monthsData.length - 1 && isLastPageOfMonth;

          return (
            <div
              key={`${mData.month}-${pageIdx}`}
              data-print-page
              style={{
                width: '297mm',
                height: '210mm',
                padding: '3.5mm 6mm',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: !isVeryLastPage ? 'always' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header matching reference/03_attendance.webp */}
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="text-[9.5pt] flex flex-wrap items-center gap-x-4">
                    <span>
                      <strong className="font-bold">{profile.schoolName}</strong>
                    </span>
                    <span>
                      ថ្នាក់ទី <strong>{cls.name}</strong>
                    </span>
                    <span>
                      ខែ <strong>{monthName}</strong> ឆ្នាំ <strong>{fmt(year)}</strong>
                    </span>
                  </div>

                  <div
                    style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                    className="text-[11pt] shrink-0"
                  >
                    បញ្ជីវត្តមាន
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
                  style={{ fontSize: `${fontSizePt}pt`, tableLayout: 'fixed', lineHeight: 1 }}
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
                        style={{ width: '17mm' }}
                      >
                        អត្តលេខ
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-black px-1 text-left font-bold"
                        style={{ width: '36mm' }}
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
                            fontSize: '7.5pt',
                            padding: 0,
                          }}
                        >
                          {fmt(d.day)}
                        </th>
                      ))}
                      <th
                        colSpan={3}
                        className="border border-black text-center font-bold"
                        style={{ width: '21mm', fontSize: '7.5pt', padding: '1px 0' }}
                      >
                        ចំនួនអវត្តមាន
                      </th>
                      <th
                        rowSpan={2}
                        className="border border-black text-center font-bold"
                        style={{ width: '18mm', fontSize: '7.5pt' }}
                      >
                        សេចក្ដីផ្សេងៗ
                      </th>
                    </tr>
                    <tr className="bg-slate-100" style={{ fontSize: '7.5pt' }}>
                      <th className="border border-black text-center font-bold" style={{ width: '7mm' }}>
                        ច្ប
                      </th>
                      <th className="border border-black text-center font-bold" style={{ width: '7mm' }}>
                        អច្ប
                      </th>
                      <th className="border border-black text-center font-bold" style={{ width: '7mm' }}>
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
                            style={{ padding: 0, lineHeight: 1.05, height: `${rowHeightMm}mm` }}
                          >
                            {fmt(rowOrder)}
                          </td>
                          <td
                            className="border border-black px-0.5 text-center font-mono truncate"
                            style={{ fontSize: '6.8pt', padding: '0 2px', lineHeight: 1.05 }}
                          >
                            {s.studentId}
                          </td>
                          <td
                            className="border border-black px-1 truncate font-medium"
                            style={{ padding: '0 3px', lineHeight: 1.15 }}
                          >
                            {s.nameKm}
                          </td>
                          {dayInfos.map((d) => {
                            const code =
                              d.isTaken && s.id !== undefined
                                ? mData.lookup.get(makeAttendanceCellKey(s.id, d.dateKey))
                                : undefined;
                            return (
                              <td
                                key={d.day}
                                className="border border-black text-center leading-none"
                                style={{
                                  backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                                  fontSize: '7pt',
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
                          <td className="border border-black text-center leading-none">
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
                          className="border border-black px-1.5 text-right leading-none"
                          style={{ fontSize: '7.5pt' }}
                        >
                          សរុបអវត្តមានប្រចាំថ្ងៃ
                        </td>
                        {dayInfos.map((d, di) => (
                          <td
                            key={d.day}
                            className="border border-black text-center leading-none"
                            style={{
                              backgroundColor: isShadedDay(d) ? '#e2e8f0' : undefined,
                              fontSize: '7pt',
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
                <div className="flex items-end justify-between text-[8.5pt] px-8 pt-1">
                  <div className="text-center">
                    <div>បានឃើញ និងឯកភាព</div>
                    <div className="font-bold">នាយកសាលា</div>
                    <div style={{ height: `${signGapMm}mm` }} />
                    <div className="font-bold">{profile.directorName}</div>
                  </div>

                  {studentPages.length > 1 && (
                    <div className="text-[8pt] text-slate-500">
                      ទំព័រ {fmt(pageIdx + 1)} / {fmt(studentPages.length)}
                    </div>
                  )}

                  <div className="text-center">
                    <div>ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………</div>
                    <div className="font-bold">គ្រូបន្ទុកថ្នាក់</div>
                    <div style={{ height: `${signGapMm}mm` }} />
                    <div className="font-bold">{profile.teacherName}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-[8pt] text-slate-500 pt-1">
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
