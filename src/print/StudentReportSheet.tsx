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
import { AcademicYearLine, DocumentHeader } from './DocumentHeader';
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

  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);

  return (
    <div className="bg-white text-black font-battambang">
      {entries.map((entry, pageIdx) => {
        const { row, scores } = entry;
        const subjectRows = buildStudentReportSubjectRows(subjects, scores);
        const isLast = pageIdx === entries.length - 1;
        const dense = subjectRows.length > 15;

        return (
          <div
            key={row.student.id ?? pageIdx}
            data-print-page
            style={{
              width: '210mm',
              height: '297mm',
              padding: dense ? '6mm 11mm' : '10mm 13mm',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              color: '#000000',
              fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
              pageBreakAfter: !isLast ? 'always' : 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div>
              <DocumentHeader profile={profile} compact={dense} />

              <div className={`text-center ${dense ? 'mb-1.5' : 'mb-2.5'}`}>
                <h2
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className={`${dense ? 'text-[10.5pt]' : 'text-[11.5pt]'} font-normal`}
                >
                  លទ្ធផលនៃការសិក្សាប្រចាំខែ {monthName}
                </h2>
                <AcademicYearLine academicYear={cls.academicYear} />
              </div>

              <div className={`flex flex-wrap items-center justify-between ${dense ? 'text-[8.8pt] mb-1' : 'text-[9.5pt] mb-2'} px-1`}>
                <div>
                  ឈ្មោះសិស្ស៖ <strong className="font-bold">{row.student.nameKm}</strong>
                </div>
                <div>
                  ថ្នាក់៖ {cls.name}
                </div>
                <div>
                  ភេទ៖ {row.student.gender}
                </div>
              </div>

              {/* Column widths measured from the school's sample 01 */}
              <table className={`w-full table-fixed border-collapse ${dense ? 'text-[8pt] leading-tight' : 'text-[9pt]'}`}>
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '42%' }} />
                  <col style={{ width: '15.5%' }} />
                  <col style={{ width: '15.5%' }} />
                  <col style={{ width: '21%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100">
                    <th className={`border border-black px-1 ${dense ? 'py-0.5' : 'py-1'} text-center`}>ល.រ</th>
                    <th className={`border border-black px-2.5 ${dense ? 'py-0.5' : 'py-1'} text-center`}>មុខវិជ្ជា</th>
                    <th className={`border border-black px-1 ${dense ? 'py-0.5' : 'py-1'} text-center`}>ពិន្ទុអតិបរមា</th>
                    <th className={`border border-black px-1 ${dense ? 'py-0.5' : 'py-1'} text-center`}>ពិន្ទុ</th>
                    <th className={`border border-black px-1 ${dense ? 'py-0.5' : 'py-1'} text-center`}>និទ្ទេស</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map((sr) => (
                    <tr key={sr.subjectId} style={{ height: dense ? '4.2mm' : '5.8mm' }}>
                      <td className={`border border-black px-2 ${dense ? 'py-0' : 'py-0.5'} text-center`}>
                        {fmt(sr.orderNum)}
                      </td>
                      <td className={`border border-black px-2.5 ${dense ? 'py-0' : 'py-0.5'}`}>{sr.name}</td>
                      <td className={`border border-black px-2 ${dense ? 'py-0' : 'py-0.5'} text-center`}>
                        {fmt(sr.maxScore)}
                      </td>
                      <td className={`border border-black px-2 ${dense ? 'py-0' : 'py-0.5'} text-center`}>
                        {sr.score !== null
                          ? fmt(Number.isInteger(sr.score) ? sr.score : sr.score.toFixed(1))
                          : ''}
                      </td>
                      <td
                        className={`border border-black px-2 ${dense ? 'py-0' : 'py-0.5'} text-center font-bold`}
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

              {/* Summary Grid (4 rows x 4 cells, flush beneath subject table) */}
              <table className={`w-full table-fixed border-collapse ${dense ? 'text-[8pt] leading-tight mb-1' : 'text-[9pt] mb-2'} -mt-[1px]`}>
                {/* lines up with the subject table: ល.រ+មុខវិជ្ជា | ពិន្ទុអតិបរមា+ពិន្ទុ | និទ្ទេស */}
                <colgroup>
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '33%' }} />
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '21%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="border border-black px-2.5 py-1">ពិន្ទុសរុប</td>
                    <td className="border border-black px-2.5 py-1 text-center font-bold">
                      {row.total !== null
                        ? fmt(Number.isInteger(row.total) ? row.total : row.total.toFixed(1))
                        : '—'}
                    </td>
                    <td className="border border-black px-2.5 py-1">ក្នុងចំណោមសិស្ស</td>
                    <td className="border border-black px-2.5 py-1 text-center font-bold">
                      {fmt(totalStudents)} នាក់
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2.5 py-1">មធ្យមភាគ</td>
                    <td className="border border-black px-2.5 py-1 text-center font-bold">
                      {row.average !== null
                        ? fmt(formatAverage(row.average, scoreConfig.averageDecimalMode))
                        : '—'}
                    </td>
                    <td className="border border-black px-2.5 py-1">អវត្តមាន ៖ មានច្បាប់</td>
                    <td className="border border-black px-2.5 py-1 text-center font-bold">
                      {fmt(row.attendance.excused)} ដង
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2.5 py-1">ចំណាត់ថ្នាក់</td>
                    <td
                      className="border border-black px-2.5 py-1 text-center font-bold"
                      style={{ color: '#dc2626' }}
                    >
                      {row.rank !== null ? fmt(row.rank) : '—'}
                    </td>
                    <td className="border border-black px-2.5 py-1">អវត្តមាន ៖ អត់ច្បាប់</td>
                    <td className="border border-black px-2.5 py-1 text-center font-bold">
                      {fmt(row.attendance.unexcused)} ដង
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2.5 py-1">និទ្ទេស</td>
                    <td
                      className="border border-black px-2.5 py-1 text-center font-bold"
                      style={{ color: row.grade ? GRADE_PRINT_COLORS[row.grade] : '#111827' }}
                    >
                      {row.grade ?? '—'}
                    </td>
                    <td className="border border-black px-2.5 py-1">លទ្ធផល</td>
                    <td className="border border-black px-2.5 py-1 text-center font-bold">
                      {row.passed === true ? 'ជាប់' : row.passed === false ? 'ធ្លាក់' : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <DocumentSignature
                profile={profile}
                signOptions={signOptions}
                fontSizePt={dense ? 8.5 : 9}
                gapMm={dense ? 14 : subjectRows.length > 14 ? 18 : 22}
              />

              <div
                className={dense ? 'text-[8.2pt]' : 'text-[9pt]'}
                style={{ marginTop: dense ? '2.5mm' : subjectRows.length > 14 ? '6mm' : '12mm' }}
              >
                <div className={`text-center ${dense ? 'mb-1' : 'mb-2'}`}>
                  មតិរបស់មាតាបិតា-អាណាព្យាបាលសិស្ស
                </div>
                <div className={`${dense ? 'space-y-2 pt-0.5' : 'space-y-3.5 pt-1'} mx-[14mm]`}>
                  <div className={`border-b border-dotted border-slate-700 ${dense ? 'h-2.5' : 'h-3'}`} />
                  <div className={`border-b border-dotted border-slate-700 ${dense ? 'h-2.5' : 'h-3'}`} />
                  <div className={`border-b border-dotted border-slate-700 ${dense ? 'h-2.5' : 'h-3'}`} />
                  <div className={`border-b border-dotted border-slate-700 ${dense ? 'h-2.5' : 'h-3'}`} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
