import React from 'react';
import type { Profile, SchoolClass, Student } from '../types/domain';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentSignature } from './DocumentSignature';
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';

interface StudentListSheetProps {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  useKhmerDigits?: boolean;
}

export const StudentListSheet: React.FC<StudentListSheetProps> = ({
  cls,
  students,
  profile,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  const sorted = [...students].sort((a, b) => a.order - b.order);
  const maleCount = sorted.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = sorted.filter((s) => s.gender === 'ស្រី').length;

  const pages = paginateByRowHeight<Student>({
    items: sorted,
    maxRowsPerPage: 24,
    nonLastPageBudgetMm: 164,
    // Room for the signature block with its 20 mm signing gap (was 13 mm).
    lastPageBudgetMm: 127,
    getRowHeightMm: (s) => {
      const addrLines = estimateWrappedLines(s.address, 54, 8.2, 4);
      const nameLines = estimateWrappedLines(s.nameKm, 34, 6.5, 2);
      const parentLines = Math.max(
        estimateWrappedLines(s.fatherName, 29, 6.5, 2),
        estimateWrappedLines(s.motherName, 29, 6.5, 2)
      );
      const lines = Math.max(addrLines, nameLines, parentLines);
      return lines <= 1 ? 5.6 : lines * 4.2 + 1.2;
    },
  });

  return (
    <div className="bg-white text-black font-battambang">
      {pages.map((page, pageIdx) => {
        const pageStudents = page.items;
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
                    បញ្ជីឈ្មោះសិស្ស
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

              {/* Students Table */}
              <table className="w-full table-fixed border-collapse text-[8.8pt]">
                <colgroup>
                  <col style={{ width: '9mm' }} />
                  <col style={{ width: '23mm' }} />
                  <col style={{ width: '36mm' }} />
                  <col style={{ width: '35mm' }} />
                  <col style={{ width: '11mm' }} />
                  <col style={{ width: '21mm' }} />
                  <col style={{ width: '31mm' }} />
                  <col style={{ width: '31mm' }} />
                  <col style={{ width: '23mm' }} />
                  <col style={{ width: '57mm' }} />
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
                    <th className="border border-black px-1.5 py-1 text-left">
                      ឈ្មោះឡាតាំង
                    </th>
                    <th className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      ភេទ
                    </th>
                    <th className="border border-black px-1 py-1 text-center">
                      ថ្ងៃខែឆ្នាំកំណើត
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      ឪពុកឈ្មោះ
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">
                      ម្ដាយឈ្មោះ
                    </th>
                    <th className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      លេខទូរស័ព្ទ
                    </th>
                    <th className="border border-black px-1.5 py-1 text-left">ទីលំនៅបច្ចុប្បន្ន</th>
                  </tr>
                </thead>
                <tbody>
                  {pageStudents.map((s) => (
                    <tr key={s.id ?? s.studentId}>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {fmt(s.order)}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center font-mono text-[8.2pt] whitespace-nowrap">
                        {fmt(s.studentId)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 font-semibold">
                        <FitText text={s.nameKm} basePt={8.8} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td
                        className="border border-black px-1.5 py-0.5 text-[8.2pt]"
                        style={{ fontFamily: "'Kantumruy Pro', Arial, sans-serif" }}
                      >
                        <FitText text={s.nameEn || ''} basePt={8.2} minPt={6.5} lineHeight={1.2} />
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {s.gender}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {fmt(s.dateOfBirth)}
                      </td>
                      <td className="border border-black px-1.5 py-0.5">
                        <FitText text={s.fatherName || ''} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1.5 py-0.5">
                        <FitText text={s.motherName || ''} basePt={8.5} minPt={6.5} lineHeight={1.25} />
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                        {s.phone || ''}
                      </td>
                      <td className="border border-black px-1.5 py-0.5 text-[8.2pt] leading-snug">
                        {s.address || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer: Signature block ONLY on the LAST page, right below the table */}
            {isLastPage ? (
              <div style={{ marginTop: '3mm' }}>
                <DocumentSignature
                  profile={profile}
                  fontSizePt={10}
                  gapMm={20}
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
