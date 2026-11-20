import React from 'react';
import type { Profile, SchoolClass, Student } from '../types/domain';
import { getActiveStudentsOrdered } from '../lib/attendance';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentSignature } from './DocumentSignature';

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

  // Allow up to 24 rows on non-last pages and up to 20 rows on the last page (with 18mm signature block)
  const pages: Array<{ items: Student[]; startIndex: number }> = [];
  let cursor = 0;
  while (cursor < sorted.length) {
    const remaining = sorted.length - cursor;
    if (remaining <= 20) {
      pages.push({ items: sorted.slice(cursor), startIndex: cursor });
      cursor = sorted.length;
    } else if (remaining <= 24) {
      const take = remaining - 4;
      pages.push({ items: sorted.slice(cursor, cursor + take), startIndex: cursor });
      cursor += take;
    } else {
      pages.push({ items: sorted.slice(cursor, cursor + 24), startIndex: cursor });
      cursor += 24;
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
              width: '297mm',
              height: '210mm',
              padding: '10mm 12mm',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              color: '#000000',
              fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
              pageBreakAfter: !isLastPage ? 'always' : 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              {/* Institutional Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="text-[11px] leading-snug">
                  <div className="font-bold">{profile.schoolName}</div>
                  <div>
                    ថ្នាក់ទី {cls.name} — ឆ្នាំសិក្សា {fmt(cls.academicYear)}
                  </div>
                </div>

                <div className="text-center">
                  <h2
                    style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                    className="text-[14px] font-normal"
                  >
                    បញ្ជីហៅឈ្មោះ
                  </h2>
                </div>

                {/* Male / Female / Total summary box */}
                <table className="border-collapse text-[10px]">
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
              <table className="w-full border-collapse text-[9.5px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-1.5 py-1 text-center w-8">ល.រ</th>
                    <th className="border border-black px-1.5 py-1 text-center w-20">អត្តលេខ</th>
                    <th className="border border-black px-2 py-1 text-left">គោត្តនាម និងនាម</th>
                    <th className="border border-black px-1.5 py-1 text-center w-11">ភេទ</th>
                    <th className="border border-black px-1.5 py-1 text-center w-22">
                      ថ្ងៃខែឆ្នាំកំណើត
                    </th>
                    <th className="border border-black px-2 py-1 text-left">ឈ្មោះឪពុក</th>
                    <th className="border border-black px-1.5 py-1 text-left">មុខរបរ (ឪពុក)</th>
                    <th className="border border-black px-2 py-1 text-left">ឈ្មោះម្ដាយ</th>
                    <th className="border border-black px-1.5 py-1 text-left">មុខរបរ (ម្ដាយ)</th>
                    <th className="border border-black px-2 py-1 text-left">
                      ទីកន្លែងរស់នៅបច្ចុប្បន្ន
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((s, idx) => (
                    <tr key={s.id ?? s.studentId}>
                      <td className="border border-black px-1.5 py-1 text-center">
                        {fmt(page.startIndex + idx + 1)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-center font-mono text-[9px]">
                        {s.studentId}
                      </td>
                      <td className="border border-black px-2 py-1 font-semibold">{s.nameKm}</td>
                      <td className="border border-black px-1.5 py-1 text-center">{s.gender}</td>
                      <td className="border border-black px-1.5 py-1 text-center">
                        {s.dateOfBirth ? fmt(s.dateOfBirth) : ''}
                      </td>
                      <td className="border border-black px-2 py-1">{s.fatherName || ''}</td>
                      <td className="border border-black px-1.5 py-1">
                        {s.fatherOccupation || ''}
                      </td>
                      <td className="border border-black px-2 py-1">{s.motherName || ''}</td>
                      <td className="border border-black px-1.5 py-1">
                        {s.motherOccupation || ''}
                      </td>
                      <td className="border border-black px-2 py-1 text-[9px]">
                        {s.address || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isLastPage ? (
              <DocumentSignature
                profile={profile}
                fontSizePt={8}
                gapMm={16}
                middle={
                  <div className="text-[9.5px] text-slate-500">
                    ទំព័រ {fmt(pageIdx + 1)} / {fmt(pages.length)}
                  </div>
                }
              />
            ) : (
              <div className="text-center text-[9.5px] text-slate-500 pt-2">
                ទំព័រ {fmt(pageIdx + 1)} / {fmt(pages.length)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
