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
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';

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

  const pages = paginateByRowHeight<MonthlyResultRow>({
    items: summary.rows,
    // Page 1 fills to the bottom: measured 220 mm for rows under the title (2026-11-24).
    maxRowsPerPage: 37,
    nonLastPageBudgetMm: 260,
    // Keeps the summary and the 20 mm signing gap (was 16 mm) on the last page.
    lastPageBudgetMm: 190,
    firstPageExtraOverheadMm: 40,
    getRowHeightMm: (r) => {
      const nameLines = estimateWrappedLines(r.student.nameKm, 46, 6.0, 2);
      const noteLines = estimateWrappedLines(r.note, 30, 5.5, 2);
      const lines = Math.max(nameLines, noteLines);
      return lines > 1 ? Math.max(6.0, lines * 3.8 + 1.2) : 6.0;
    },
  });

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

              <table className="w-full table-fixed border-collapse text-[8.8pt]">
                <colgroup>
                  <col style={{ width: '8mm' }} />
                  <col style={{ width: '48mm' }} />
                  <col style={{ width: '8mm' }} />
                  <col style={{ width: '14mm' }} />
                  <col style={{ width: '13mm' }} />
                  <col style={{ width: '14mm' }} />
                  <col style={{ width: '12mm' }} />
                  <col style={{ width: '12mm' }} />
                  <col style={{ width: '9mm' }} />
                  <col style={{ width: '10mm' }} />
                  <col style={{ width: '10mm' }} />
                  <col style={{ width: '32mm' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      ល.រ
                    </th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 text-left">
                      គោត្តនាម-នាម
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      ភេទ
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      ពិន្ទុសរុប
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      មធ្យម
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      ចំណាត់ថ្នាក់
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      និទ្ទេស
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center">
                      លទ្ធផល
                    </th>
                    <th colSpan={3} className="border border-black px-1 py-0.5 text-center">
                      ចំនួនអវត្តមាន
                    </th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 text-left">
                      ផ្សេងៗ
                    </th>
                  </tr>
                  <tr className="bg-slate-100 text-[8pt]">
                    <th className="border border-black px-1 py-0.5 text-center">ច្ប</th>
                    <th className="border border-black px-1 py-0.5 text-center">អ.ច្ប</th>
                    <th className="border border-black px-1 py-0.5 text-center">សរុប</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r, idx) => (
                    <tr key={r.student.id ?? idx} style={{ height: '5.5mm' }}>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {fmt(page.startIndex + idx + 1)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 font-medium">
                        <FitText text={r.student.nameKm} basePt={8.8} minPt={6.0} lineHeight={1.25} />
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
                      <td className="border border-black px-1 py-0.5 text-[7.8pt]">
                        <FitText text={r.note} basePt={7.8} minPt={5.5} lineHeight={1.25} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {isLastPage && (
                <div className="mt-2.5">
                  <div className="text-[8.5pt] leading-relaxed">
                    <div className="font-bold">
                      បញ្ឈប់បញ្ជីចំនួនសិស្សសរុប: {fmt(summary.totalStudents)} នាក់, ស្រី:{' '}
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
                    <DocumentSignature
                      profile={profile}
                      signOptions={signOptions}
                      fontSizePt={9.5}
                      gapMm={20}
                    />
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
