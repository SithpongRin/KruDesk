import React from 'react';
import type { Profile, SchoolClass, ScoreConfig, Subject } from '../types/domain';
import { formatAverage } from '../lib/grading';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import {
  buildStudentReportSubjectRows,
  GRADE_PRINT_COLORS,
  type MonthlyResultRow,
} from '../lib/monthlyResults';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';

export interface StudentReportEntry {
  row: MonthlyResultRow;
  scores: Record<string, number | null>;
}

interface StudentReportSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  subjects: Subject[];
  entries: StudentReportEntry[];
  totalStudents: number;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}

export const StudentReportSheet: React.FC<StudentReportSheetProps> = ({
  cls,
  profile,
  month,
  subjects,
  entries,
  totalStudents,
  scoreConfig,
  signOptions,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const fmtHdr = (val: number | string) => toKhmerNumerals(val);

  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);

  return (
    <div className="bg-white text-black font-battambang">
      {entries.map((entry, pageIdx) => {
        const { row, scores } = entry;
        const subjectRows = buildStudentReportSubjectRows(subjects, scores);
        const isLast = pageIdx === entries.length - 1;

        return (
          <div
            key={row.student.id ?? pageIdx}
            data-print-page
            style={{
              width: '210mm',
              height: '297mm',
              padding: '10mm 13mm',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              color: '#000000',
              fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
              pageBreakAfter: !isLast ? 'always' : 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <DocumentHeader profile={profile} />

              <div className="text-center mb-2.5">
                <h2
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[11.5pt] font-normal"
                >
                  លទ្ធផលនៃការសិក្សាប្រចាំខែ {monthName}
                </h2>
                <div className="text-[9.5pt] mt-0.5">
                  ឆ្នាំសិក្សា {fmtHdr(cls.academicYear)}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[9.5pt] mb-2 px-1">
                <div>
                  ឈ្មោះសិស្ស: <strong className="font-bold">{row.student.nameKm}</strong>
                </div>
                <div>
                  ថ្នាក់: <strong className="font-bold">{cls.name}</strong>
                </div>
                <div>
                  ភេទ: <strong className="font-bold">{row.student.gender}</strong>
                </div>
              </div>

              <table className="w-full border-collapse text-[9pt] mb-3">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-2 py-1 text-center w-10">ល.រ</th>
                    <th className="border border-black px-2.5 py-1 text-left">មុខវិជ្ជា</th>
                    <th className="border border-black px-2 py-1 text-center w-24">ពិន្ទុអតិបរមា</th>
                    <th className="border border-black px-2 py-1 text-center w-20">ពិន្ទុ</th>
                    <th className="border border-black px-2 py-1 text-center w-16">និទ្ទេស</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map((sr) => (
                    <tr key={sr.subjectId} style={{ height: '6mm' }}>
                      <td className="border border-black px-2 py-0.5 text-center">
                        {fmt(sr.orderNum)}
                      </td>
                      <td className="border border-black px-2.5 py-0.5">{sr.name}</td>
                      <td className="border border-black px-2 py-0.5 text-center">
                        {fmt(sr.maxScore)}
                      </td>
                      <td className="border border-black px-2 py-0.5 text-center font-semibold">
                        {sr.score !== null
                          ? fmt(Number.isInteger(sr.score) ? sr.score : sr.score.toFixed(1))
                          : ''}
                      </td>
                      <td
                        className="border border-black px-2 py-0.5 text-center font-bold"
                        style={{
                          color: sr.grade ? GRADE_PRINT_COLORS[sr.grade] : '#111827',
                        }}
                      >
                        {sr.grade ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary Grid */}
              <table className="w-full border-collapse text-[9pt] mb-2">
                <tbody>
                  <tr>
                    <td className="border border-black px-2.5 py-1 w-1/2">
                      ពិន្ទុសរុប:{' '}
                      <strong className="font-bold">
                        {row.total !== null
                          ? fmt(Number.isInteger(row.total) ? row.total : row.total.toFixed(1))
                          : '—'}
                      </strong>
                    </td>
                    <td className="border border-black px-2.5 py-1 w-1/2">
                      ក្នុងចំណោមសិស្ស <strong className="font-bold">{fmt(totalStudents)}</strong>{' '}
                      នាក់
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2.5 py-1">
                      មធ្យមភាគ:{' '}
                      <strong className="font-bold">
                        {row.average !== null
                          ? fmt(formatAverage(row.average, scoreConfig.averageDecimalMode))
                          : '—'}
                      </strong>
                    </td>
                    <td className="border border-black px-2.5 py-1">
                      អវត្តមាន៖ មានច្បាប់{' '}
                      <strong className="font-bold">{fmt(row.attendance.excused)}</strong> ដង
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2.5 py-1">
                      ចំណាត់ថ្នាក់:{' '}
                      <strong className="font-bold" style={{ color: '#dc2626' }}>
                        {row.rank !== null ? fmt(row.rank) : '—'}
                      </strong>
                    </td>
                    <td className="border border-black px-2.5 py-1">
                      អវត្តមាន៖ អត់ច្បាប់{' '}
                      <strong className="font-bold">{fmt(row.attendance.unexcused)}</strong> ដង
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2.5 py-1">
                      និទ្ទេស:{' '}
                      <strong
                        className="font-bold"
                        style={{ color: row.grade ? GRADE_PRINT_COLORS[row.grade] : '#111827' }}
                      >
                        {row.grade ?? '—'}
                      </strong>
                    </td>
                    <td className="border border-black px-2.5 py-1">
                      លទ្ធផល:{' '}
                      <strong className="font-bold">
                        {row.passed === true ? 'ជាប់' : row.passed === false ? 'ធ្លាក់' : '—'}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <DocumentSignature profile={profile} signOptions={signOptions} gapMm={12} />

              <div className="mt-3 pt-2 border-t border-dashed border-slate-400 text-[9pt]">
                <div className="font-bold mb-1.5">មតិរបស់មាតាបិតា-អាណាព្យាបាលសិស្ស</div>
                <div className="space-y-3 pt-1">
                  <div className="border-b border-dotted border-slate-600 h-3" />
                  <div className="border-b border-dotted border-slate-600 h-3" />
                  <div className="border-b border-dotted border-slate-600 h-3" />
                  <div className="border-b border-dotted border-slate-600 h-3" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
