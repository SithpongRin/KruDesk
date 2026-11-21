import React from 'react';
import type { Profile, SchoolClass, ScoreConfig } from '../types/domain';
import { formatAverage } from '../lib/grading';
import {
  GRADE_ORDER,
  GRADE_PRINT_COLORS,
  type SemesterResultRow,
  type SemesterResultsSummary,
} from '../lib/monthlyResults';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { AcademicYearLine, DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';

interface SemesterResultsSheetProps {
  cls: SchoolClass;
  profile: Profile;
  summary: SemesterResultsSummary;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}

export const SemesterResultsSheet: React.FC<SemesterResultsSheetProps> = ({
  cls,
  profile,
  summary,
  scoreConfig,
  signOptions,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const fmtHdr = (val: number | string) => toKhmerNumerals(val);

  const pages: Array<{ items: SemesterResultRow[]; startIndex: number }> = [];
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
                      តារាងលទ្ធផលពិន្ទុសិស្សថ្នាក់ទី {cls.name} ប្រចាំឆមាសទី{' '}
                      {fmtHdr(summary.semester)}
                    </h2>
                    <AcademicYearLine academicYear={cls.academicYear} />
                  </div>
                </>
              )}

              <table className="w-full border-collapse text-[8.4pt]">
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-6">
                      ល.រ
                    </th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 text-left">
                      គោត្តនាម-នាម
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-7">
                      ភេទ
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-12 leading-tight">
                      ខែប្រចាំ
                      <br />
                      ឆមាស
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-12 leading-tight">
                      ប្រឡង
                      <br />
                      ឆមាស
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-11">
                      ពិន្ទុសរុប
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-11">
                      មធ្យម
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-11">
                      ចំណាត់ថ្នាក់
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-9">
                      និទ្ទេស
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-center w-9">
                      លទ្ធផល
                    </th>
                    <th colSpan={3} className="border border-black px-1 py-0.5 text-center">
                      ចំនួនអវត្តមាន
                    </th>
                    <th rowSpan={2} className="border border-black px-1 py-1 text-left w-13">
                      ផ្សេងៗ
                    </th>
                  </tr>
                  <tr className="bg-slate-100 text-[7.3pt]">
                    <th className="border border-black px-1 py-0.5 text-center w-6">ច្ប</th>
                    <th className="border border-black px-1 py-0.5 text-center w-7">អ.ច្ប</th>
                    <th className="border border-black px-1 py-0.5 text-center w-7">សរុប</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r, idx) => (
                    <tr key={r.student.id ?? idx} style={{ height: '5.5mm' }}>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {fmt(page.startIndex + idx + 1)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 font-medium truncate max-w-[38mm]">
                        {r.student.nameKm}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.monthlyAvg !== null
                          ? fmt(formatAverage(r.monthlyAvg, scoreConfig.averageDecimalMode))
                          : ''}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.examAvg !== null
                          ? fmt(formatAverage(r.examAvg, scoreConfig.averageDecimalMode))
                          : ''}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {r.semesterTotal !== null
                          ? fmt(formatAverage(r.semesterTotal, scoreConfig.averageDecimalMode))
                          : ''}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center font-semibold">
                        {r.semesterAvg !== null
                          ? fmt(formatAverage(r.semesterAvg, scoreConfig.averageDecimalMode))
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
                        style={{ color: r.grade ? GRADE_PRINT_COLORS[r.grade] : '#111827' }}
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
                      <td className="border border-black px-1 py-0.5 truncate max-w-[14mm]">
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
                      បញ្ឈប់បញ្ជីចំនួនសិស្សសរុប: {fmt(summary.totalStudents)} នាក់, ស្រី:{' '}
                      {fmt(summary.femaleStudents)} នាក់
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 mt-1 max-w-[130mm]">
                      <div className="space-y-0.5">
                        {GRADE_ORDER.slice(0, 3).map((g) => (
                          <div key={g}>
                            -និទ្ទេស {g}: {fmt(summary.gradeCounts[g].total)} នាក់, ស្រី{' '}
                            {fmt(summary.gradeCounts[g].female)} នាក់
                          </div>
                        ))}
                      </div>
                      <div className="space-y-0.5">
                        {GRADE_ORDER.slice(3, 6).map((g) => (
                          <div key={g}>
                            -និទ្ទេស {g}: {fmt(summary.gradeCounts[g].total)} នាក់, ស្រី{' '}
                            {fmt(summary.gradeCounts[g].female)} នាក់
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-1">
                      សិស្សមិនមករៀនសោះក្នុងឆមាស: {fmt(summary.absentAllSemester.total)} នាក់, ស្រី{' '}
                      {fmt(summary.absentAllSemester.female)} នាក់
                    </div>
                  </div>

                  <div className="mt-2">
                    <DocumentSignature
                      profile={profile}
                      signOptions={signOptions}
                      fontSizePt={9.5}
                      gapMm={16}
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
