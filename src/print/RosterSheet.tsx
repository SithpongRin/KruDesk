import React from 'react';
import type { Profile, SchoolClass, Student } from '../types/domain';
import { getActiveStudentsOrdered } from '../lib/attendance';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentSignature } from './DocumentSignature';
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';

interface RosterSheetProps {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  useKhmerDigits?: boolean;
}

export const RosterSheet: React.FC<RosterSheetProps> = ({
  cls,
  students,
  profile,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const sorted = getActiveStudentsOrdered(students);
  const maleCount = sorted.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = sorted.filter((s) => s.gender === 'ស្រី').length;

  const pages = paginateByRowHeight<Student>({
    items: sorted,
    maxRowsPerPage: 24,
    nonLastPageBudgetMm: 164,
    lastPageBudgetMm: 134,
    getRowHeightMm: (s) => {
      const addrLines = estimateWrappedLines(s.address, 50, 8.0, 4);
      const nameLines = estimateWrappedLines(s.nameKm, 35, 6.5, 2);
      const otherLines = Math.max(
        estimateWrappedLines(s.fatherName, 30, 6.5, 2),
        estimateWrappedLines(s.fatherOccupation, 23, 6.5, 2),
        estimateWrappedLines(s.motherName, 30, 6.5, 2),
        estimateWrappedLines(s.motherOccupation, 23, 6.5, 2)
      );
      const lines = Math.max(addrLines, nameLines, otherLines);
      return lines <= 1 ? 5.6 : lines * 4.2 + 1.2;
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
              width: '297mm',
              height: '210mm',
              padding: '7mm 10mm',
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
              {/* Institutional Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="text-[9.5pt] leading-snug">
                  <div className="font-bold">{profile.schoolName}</div>
                  <div>
                    ថ្នាក់ទី <strong>{cls.name}</strong> — ឆ្នាំសិក្សា <strong>{fmt(cls.academicYear)}</strong>
                  </div>
                </div>

                <div className="text-center">
                  <h2
                    style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                    className="text-[12pt] font-normal"
                  >
                    បញ្ជីហៅឈ្មោះ
                  </h2>
                </div>

                {/* Male / Female / Total summary box */}
                <table className="border-collapse text-[8.5pt]">
                  <thead>
                    <tr>
                      <th className="border border-black px-2.5 py-0.5 font-bold bg-slate-100">
                        ប្រុស
                      </th>
                      <th className="border border-black px-2.5 py-0.5 font-bold bg-slate-100">
                        ស្រី
                      </th>
                      <th className="border border-black px-2.5 py-0.5 font-bold bg-slate-100">
                        សរុប
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-black px-2.5 py-0.5 text-center font-bold">
                        {fmt(maleCount)}
                      </td>
                      <td className="border border-black px-2.5 py-0.5 text-center font-bold">
                        {fmt(femaleCount)}
                      </td>
                      <td className="border border-black px-2.5 py-0.5 text-center font-bold">
                        {fmt(sorted.length)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Roster Table */}
              <table className="w-full table-fixed border-collapse text-[8.5pt]">
                <colgroup>
                  <col style={{ width: '9mm' }} />
                  <col style={{ width: '23mm' }} />
                  <col style={{ width: '37mm' }} />
                  <col style={{ width: '11mm' }} />
                  <col style={{ width: '22mm' }} />
                  <col style={{ width: '32mm' }} />
                  <col style={{ width: '25mm' }} />
                  <col style={{ width: '32mm' }} />
                  <col style={{ width: '25mm' }} />
                  <col style={{ width: '61mm' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      ល.រ
                    </th>
                    <th className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      អត្តលេខ
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      គោត្តនាម និងនាម
                    </th>
                    <th className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      ភេទ
                    </th>
                    <th className="border border-black px-1 py-1 text-center">
                      ថ្ងៃខែឆ្នាំកំណើត
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      ឈ្មោះឪពុក
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      មុខរបរ (ឪពុក)
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      ឈ្មោះម្ដាយ
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      មុខរបរ (ម្ដាយ)
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      ទីកន្លែងរស់នៅបច្ចុប្បន្ន
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((s, idx) => (
                    <tr key={s.id ?? s.studentId}>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {fmt(page.startIndex + idx + 1)}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center font-mono text-[8pt] whitespace-nowrap">
                        {fmt(s.studentId)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 font-semibold">
                        <FitText text={s.nameKm} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {s.gender}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {s.dateOfBirth ? fmt(s.dateOfBirth) : ''}
                      </td>
                      <td className="border border-black px-1.5 py-0.5">
                        <FitText text={s.fatherName || ''} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1.5 py-0.5">
                        <FitText text={s.fatherOccupation || ''} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1.5 py-0.5">
                        <FitText text={s.motherName || ''} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1.5 py-0.5">
                        <FitText text={s.motherOccupation || ''} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-[8pt] leading-snug">
                        {s.address || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isLastPage ? (
              <div style={{ marginTop: '3mm' }}>
                <DocumentSignature
                  profile={profile}
                  fontSizePt={10}
                  gapMm={13}
                  middle={
                    <div className="text-[8.5pt] text-slate-500">
                      ទំព័រ {fmt(pageIdx + 1)} / {fmt(pages.length)}
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="mt-auto text-center text-[8.5pt] text-slate-500 pt-2">
                ទំព័រ {fmt(pageIdx + 1)} / {fmt(pages.length)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
