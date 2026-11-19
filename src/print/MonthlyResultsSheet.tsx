import React from 'react';
import type { Profile, SchoolClass, ScoreConfig } from '../types/domain';
import { formatAverage } from '../lib/grading';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import {
  GRADE_ORDER,
  GRADE_PRINT_COLORS,
  type MonthlyResultRow,
  type MonthlyResultsSummary,
} from '../lib/monthlyResults';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { AcademicYearLine, DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';

interface MonthlyResultsSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  summary: MonthlyResultsSummary;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}

export const MonthlyResultsSheet: React.FC<MonthlyResultsSheetProps> = ({
  cls,
  profile,
  month,
  summary,
  scoreConfig,
  signOptions,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const fmtHdr = (val: number | string) => toKhmerNumerals(val);

  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);

  // Up to 34 rows on non-last pages, up to 24 rows on last page (with summary + signatures)
  const pages: Array<{ items: MonthlyResultRow[]; startIndex: number }> = [];
  let cursor = 0;
  const rows = summary.rows;
  while (cursor < rows.length) {
    const remaining = rows.length - cursor;
    if (remaining <= 24) {
      pages.push({ items: rows.slice(cursor), startIndex: cursor });
      cursor = rows.length;
    } else if (remaining <= 34) {
      const take = remaining - 10;
      pages.push({ items: rows.slice(cursor, cursor + take), startIndex: cursor });
      cursor += take;
    } else {
      pages.push({ items: rows.slice(cursor, cursor + 34), startIndex: cursor });
      cursor += 34;
    }
  }
  if (pages.length === 0) pages.push({ items: [], startIndex: 0 });

  return (
    <div className="bg-white text-black font-battambang">
      {pages.map((page, pageIdx) => {
        const isLastPage = pageIdx === pages.length - 1;
        return (
          <div
            key={pageIdx}
            data-print-page
            style={{
              width: '210mm',
              height: '297mm',
              padding: '8mm 10mm',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              color: '#000000',
              fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
              pageBreakAfter: !isLastPage ? 'always' : 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div>
              {pageIdx === 0 && (
                <>
                  <DocumentHeader profile={profile} compact />

                  <div className="text-center mb-2">
                    <h2
                      style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                      className="text-[10.5pt] font-normal"
                    >
                      តារាងលទ្ធផលពិន្ទុសិស្សថ្នាក់ទី {cls.name} ប្រចាំខែ{monthName}
                    </h2>
                    <AcademicYearLine academicYear={cls.academicYear} />
                  </div>
                </>
              )}

              <table className="w-full border-collapse text-[8.2pt]">
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-7">
                      ល.រ
                    </th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 text-left">
                      គោត្តនាម-នាម
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-8">
                      ភេទ
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-12">
                      ពិន្ទុសរុប
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-12">
                      មធ្យម
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-12">
                      ចំណាត់ថ្នាក់
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-10">
                      និទ្ទេស
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-11">
                      លទ្ធផល
                    </th>
                    <th colSpan={3} className="border border-black px-1 py-0.5 text-center">
                      ចំនួនអវត្តមាន
                    </th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 text-left w-16">
                      ផ្សេងៗ
                    </th>
                  </tr>
                  <tr className="bg-slate-100 text-[7.5pt]">
                    <th className="border border-black px-1 py-0.5 text-center w-7">ច្ប</th>
                    <th className="border border-black px-1 py-0.5 text-center w-8">អ.ច្ប</th>
                    <th className="border border-black px-1 py-0.5 text-center w-8">សរុប</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r, idx) => (
                    <tr key={r.student.id ?? idx} style={{ height: '5.5mm' }}>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {fmt(page.startIndex + idx + 1)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 font-medium truncate max-w-[42mm]">
                        {r.student.nameKm}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.total !== null
                          ? fmt(Number.isInteger(r.total) ? r.total : r.total.toFixed(1))
                          : ''}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center font-semibold">
                        {r.average !== null
                          ? fmt(formatAverage(r.average, scoreConfig.averageDecimalMode))
                          : ''}
                      </td>
                      <td
                        className="border border-black px-1 py-0.5 text-center font-bold"
                        style={{ color: '#dc2626' }}
                      >
                        {r.rank !== null ? fmt(r.rank) : ''}
                      </td>
                      <td
                        className="border border-black px-1 py-0.5 text-center font-bold"
                        style={{
                          color: r.grade ? GRADE_PRINT_COLORS[r.grade] : '#111827',
                        }}
                      >
                        {r.grade ?? ''}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.passed === true ? 'ជាប់' : r.passed === false ? 'ធ្លាក់' : ''}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {fmt(r.attendance.excused)}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {fmt(r.attendance.unexcused)}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center font-medium">
                        {fmt(r.attendance.total)}
                      </td>
                      <td className="border border-black px-1 py-0.5 truncate max-w-[18mm]">
                        {r.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {isLastPage && (
                <div className="mt-2.5">
                  <div className="text-[8.5pt] leading-relaxed">
                    <div className="font-bold">
                      ចំនួនសិស្សសរុប: {fmt(summary.totalStudents)} នាក់, ស្រី:{' '}
                      {fmt(summary.femaleStudents)} នាក់
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 mt-1 max-w-[130mm]">
                      {GRADE_ORDER.map((g) => (
                        <div key={g}>
                          -និទ្ទេស {g}: {fmt(summary.gradeCounts[g].total)} នាក់, ស្រី{' '}
                          {fmt(summary.gradeCounts[g].female)} នាក់
                        </div>
                      ))}
                    </div>
                    <div className="mt-1">
                      សិស្សមិនមករៀនសោះក្នុងខែ: {fmt(summary.absentAllMonth.total)} នាក់, ស្រី{' '}
                      {fmt(summary.absentAllMonth.female)} នាក់
                    </div>
                  </div>

                  <div className="mt-2">
                    <DocumentSignature profile={profile} signOptions={signOptions} gapMm={13} />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto text-center text-[8pt] text-slate-500 pt-1">
              ទំព័រ {fmtHdr(pageIdx + 1)} / {fmtHdr(pages.length)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
