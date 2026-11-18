import React from 'react';
import type { Profile, SchoolClass, Student } from '../types/domain';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';

interface StudentListSheetProps {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  useKhmerDigits?: boolean;
}

const ROWS_PER_PAGE = 22;

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

  // Allow up to 24 rows on non-last pages (no signature block) and up to 20 rows on the last page (with 18mm signature block)
  const pages: Student[][] = [];
  let cursor = 0;
  while (cursor < sorted.length) {
    const remaining = sorted.length - cursor;
    if (remaining <= 20) {
      pages.push(sorted.slice(cursor));
      cursor = sorted.length;
    } else if (remaining <= 24) {
      const take = remaining - 4;
      pages.push(sorted.slice(cursor, cursor + take));
      cursor += take;
    } else {
      pages.push(sorted.slice(cursor, cursor + 24));
      cursor += 24;
    }
  }
  if (pages.length === 0) pages.push([]);

  return (
    <div className="bg-white text-black font-battambang">
      {pages.map((pageStudents, pageIdx) => {
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
                    បញ្ជីឈ្មោះសិស្ស
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

              {/* Students Table */}
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-black px-1.5 py-1 text-center w-9">ល.រ</th>
                    <th className="border border-black px-1.5 py-1 text-center w-24">អត្តលេខ</th>
                    <th className="border border-black px-2 py-1 text-left">គោត្តនាម និងនាម</th>
                    <th className="border border-black px-2 py-1 text-left">ឈ្មោះឡាតាំង</th>
                    <th className="border border-black px-1.5 py-1 text-center w-12">ភេទ</th>
                    <th className="border border-black px-1.5 py-1 text-center w-24">
                      ថ្ងៃខែឆ្នាំកំណើត
                    </th>
                    <th className="border border-black px-2 py-1 text-left">ឪពុកឈ្មោះ</th>
                    <th className="border border-black px-2 py-1 text-left">ម្តាយឈ្មោះ</th>
                    <th className="border border-black px-1.5 py-1 text-center w-24">
                      លេខទូរស័ព្ទ
                    </th>
                    <th className="border border-black px-2 py-1 text-left">ទីលំនៅបច្ចុប្បន្ន</th>
                  </tr>
                </thead>
                <tbody>
                  {pageStudents.map((s) => (
                    <tr key={s.id ?? s.studentId}>
                      <td className="border border-black px-1.5 py-1 text-center">
                        {fmt(s.order)}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-center font-mono text-[9.5px]">
                        {s.studentId}
                      </td>
                      <td className="border border-black px-2 py-1 font-semibold">{s.nameKm}</td>
                      <td className="border border-black px-2 py-1 text-[9.5px]">
                        {s.nameEn || ''}
                      </td>
                      <td className="border border-black px-1.5 py-1 text-center">{s.gender}</td>
                      <td className="border border-black px-1.5 py-1 text-center">
                        {fmt(s.dateOfBirth)}
                      </td>
                      <td className="border border-black px-2 py-1">{s.fatherName || ''}</td>
                      <td className="border border-black px-2 py-1">{s.motherName || ''}</td>
                      <td className="border border-black px-1.5 py-1 text-center">
                        {s.phone || ''}
                      </td>
                      <td className="border border-black px-2 py-1 text-[9.5px]">
                        {s.address || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer: Signature block ONLY on the LAST page with ~18mm blank sign space */}
            {isLastPage ? (
              <div className="flex items-end justify-between text-[10.5px] pt-2 px-6">
                <div className="text-center">
                  <div>បានឃើញ និងឯកភាព</div>
                  <div className="font-bold">នាយកសាលា</div>
                  <div style={{ height: '18mm' }} />
                  <div className="font-bold">{profile.directorName}</div>
                </div>

                <div className="text-[9.5px] text-slate-500">
                  ទំព័រ {fmt(pageIdx + 1)} / {fmt(pages.length)}
                </div>

                <div className="text-center">
                  <div>ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………</div>
                  <div className="font-bold">គ្រូបន្ទុកថ្នាក់</div>
                  <div style={{ height: '18mm' }} />
                  <div className="font-bold">{profile.teacherName}</div>
                </div>
              </div>
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
