import React from 'react';
import type { Profile, SchoolClass, ScoreConfig, Subject } from '../types/domain';
import { formatAverage } from '../lib/grading';
import {
  buildStudentReportSubjectRows,
  GRADE_PRINT_COLORS,
  type SemesterResultRow,
} from '../lib/monthlyResults';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { AcademicYearLine, DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';

interface SemesterReportSheetProps {
  cls: SchoolClass;
  profile: Profile;
  semester: 1 | 2;
  subjects: Subject[];
  rows: SemesterResultRow[];
  totalStudents: number;
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
  useKhmerDigits?: boolean;
}

export const SemesterReportSheet: React.FC<SemesterReportSheetProps> = ({
  cls,
  profile,
  semester,
  subjects,
  rows,
  totalStudents,
  scoreConfig,
  signOptions,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const fmtHdr = (val: number | string) => toKhmerNumerals(val);

  return (
    <div className="bg-white text-black font-battambang">
      {rows.map((row, pageIdx) => {
        const subjectRows = buildStudentReportSubjectRows(subjects, row.examScores);
        const isLast = pageIdx === rows.length - 1;

        return (
          <div
            key={row.student.id ?? pageIdx}
            data-print-page
            style={{
              width: '210mm',
              height: '297mm',
              padding: '9mm 12mm',
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
              <DocumentHeader profile={profile} compact />

              <div className="text-center mb-2">
                <h2
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[11pt] font-normal"
                >
                  លទ្ធផលនៃការសិក្សាប្រចាំឆមាសលើកទី {fmtHdr(semester)}
                </h2>
                <AcademicYearLine academicYear={cls.academicYear} />
              </div>

              <div className="flex flex-wrap items-center justify-between text-[9pt] mb-1.5 px-1">
                <div>
                  ឈ្មោះសិស្ស: {row.student.nameKm}
                </div>
                <div>
                  ថ្នាក់៖ {cls.name}
                </div>
                <div>
                  ភេទ៖ {row.student.gender}
                </div>
              </div>

              {/* 5-column subject table */}
              {/* Column widths measured from the school's sample 05 */}
              <table className="w-full table-fixed border-collapse text-[8.5pt]">
                <colgroup>
                  <col style={{ width: '7.4%' }} />
                  <col style={{ width: '32.1%' }} />
                  <col style={{ width: '18.7%' }} />
                  <col style={{ width: '18.7%' }} />
                  <col style={{ width: '23.1%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-1 py-0.5 text-center">ល.រ</th>
                    <th className="border border-black px-2 py-0.5 text-center">មុខវិជ្ជា</th>
                    <th className="border border-black px-1 py-0.5 text-center">ពិន្ទុអតិបរមា</th>
                    <th className="border border-black px-1 py-0.5 text-center">ពិន្ទុ</th>
                    <th className="border border-black px-1 py-0.5 text-center">និទ្ទេស</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map((sr) => (
                    <tr key={sr.subjectId} style={{ height: '5.1mm' }}>
                      <td className="border border-black px-1.5 py-0.5 text-center">
                        {fmt(sr.orderNum)}
                      </td>
                      <td className="border border-black px-2 py-0.5">{sr.name}</td>
                      <td className="border border-black px-1.5 py-0.5 text-center">
                        {fmt(sr.maxScore)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-center">
                        {sr.score !== null
                          ? fmt(Number.isInteger(sr.score) ? sr.score : sr.score.toFixed(1))
                          : ''}
                      </td>
                      <td
                        className="border border-black px-1.5 py-0.5 text-center font-bold"
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

              {/* Semester Summary Grid matching sample 05 */}
              <table className="w-full table-fixed border-collapse text-[8.5pt] -mt-[1px] mb-1.5">
                {/* label | value | (2 cols) | value — lines up with the subject table above */}
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '18.7%' }} />
                  <col style={{ width: '18.7%' }} />
                  <col style={{ width: '23.1%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-0.5">សរុបពិន្ទុប្រលងឆមាស៖</td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {row.examTotal !== null
                        ? fmt(
                            Number.isInteger(row.examTotal)
                              ? row.examTotal
                              : row.examTotal.toFixed(1)
                          )
                        : '—'}
                    </td>
                    <td colSpan={2} className="border border-black px-2 py-0.5">
                      និទ្ទេស៖
                    </td>
                    <td
                      className="border border-black px-2 py-0.5 text-center font-bold"
                      style={{ color: row.grade ? GRADE_PRINT_COLORS[row.grade] : '#111827' }}
                    >
                      {row.grade ?? '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-0.5">មធ្យមភាគប្រលងឆមាស៖</td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {row.examAvg !== null
                        ? fmt(formatAverage(row.examAvg, scoreConfig.averageDecimalMode))
                        : '—'}
                    </td>
                    <td colSpan={2} className="border border-black px-2 py-0.5">
                      ក្នុងចំណោមសិស្ស៖
                    </td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {fmt(totalStudents)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-0.5">សរុបពិន្ទុខែប្រចាំឆមាស៖</td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {row.monthlySum !== null
                        ? fmt(formatAverage(row.monthlySum, scoreConfig.averageDecimalMode))
                        : '—'}
                    </td>
                    <td colSpan={2} className="border border-black px-2 py-0.5">
                      ឈប់មានច្បាប់៖
                    </td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {fmt(row.attendance.excused)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-0.5">មធ្យមភាគខែប្រចាំឆមាស៖</td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {row.monthlyAvg !== null
                        ? fmt(formatAverage(row.monthlyAvg, scoreConfig.averageDecimalMode))
                        : '—'}
                    </td>
                    <td colSpan={2} className="border border-black px-2 py-0.5">
                      ឈប់ឥតច្បាប់៖
                    </td>
                    <td className="border border-black px-2 py-0.5 text-center font-bold">
                      {fmt(row.attendance.unexcused)}
                    </td>
                  </tr>
                  <tr>
                    <td rowSpan={2} className="border border-black px-2 py-0.5 align-middle">
                      មធ្យមភាគឆមាស៖
                    </td>
                    <td
                      rowSpan={2}
                      className="border border-black px-2 py-0.5 text-center font-bold align-middle"
                    >
                      {row.semesterAvg !== null
                        ? fmt(formatAverage(row.semesterAvg, scoreConfig.averageDecimalMode))
                        : '—'}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center text-[8pt]">
                      សីលធម៌
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center text-[8pt]">
                      សុខភាព - អនាម័យ
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center text-[8pt]">
                      ពលកម្ម - បង្កបង្កើនផល
                    </td>
                  </tr>
                  <tr style={{ height: '5.5mm' }}>
                    <td className="border border-black px-1.5 py-0.5" />
                    <td className="border border-black px-1.5 py-0.5" />
                    <td className="border border-black px-1.5 py-0.5" />
                  </tr>
                  <tr>
                    <td rowSpan={2} className="border border-black px-2 py-0.5 align-middle">
                      ចំណាត់ថ្នាក់៖
                    </td>
                    <td
                      rowSpan={2}
                      className="border border-black px-2 py-0.5 text-center font-bold align-middle"
                      style={{ color: '#dc2626' }}
                    >
                      {row.rank !== null ? fmt(row.rank) : '—'}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center text-[8pt]">
                      បណ្ណសរសើរ
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center text-[8pt]">
                      លិខិតសរសើរ
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-center text-[8pt]">
                      សក្ខីបណ្ណលើកទឹកចិត្ត
                    </td>
                  </tr>
                  <tr style={{ height: '5.5mm' }}>
                    <td className="border border-black px-1.5 py-0.5 text-center font-bold">
                      {fmt(row.certificatesCount)}
                    </td>
                    <td className="border border-black px-1.5 py-0.5" />
                    <td className="border border-black px-1.5 py-0.5" />
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <DocumentSignature
                profile={profile}
                signOptions={signOptions}
                gapMm={10}
                approverStyle="simple"
              />

              <div className="mt-2.5 text-[8.5pt]">
                <div className="text-center mb-1">
                  មតិរបស់មាតាបិតា-អាណាព្យាបាលសិស្ស
                </div>
                <div className="space-y-2.5 pt-1 mx-[14mm]">
                  <div className="border-b border-dotted border-slate-700 h-3" />
                  <div className="border-b border-dotted border-slate-700 h-3" />
                  <div className="border-b border-dotted border-slate-700 h-3" />
                  <div className="border-b border-dotted border-slate-700 h-3" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
