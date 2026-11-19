import React from 'react';
import type { Profile, SchoolClass } from '../types/domain';
import type { ScoreGrade } from '../lib/grading';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import { getGradeWord, type MonthlyResultRow } from '../lib/monthlyResults';
import { toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';

interface CertificateSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  items: MonthlyResultRow[];
  signOptions: DocumentSignOptions;
  gradeWords?: Partial<Record<ScoreGrade, string>>;
}

const OrnateCertificateBorder: React.FC = () => (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    viewBox="0 0 297 210"
    preserveAspectRatio="none"
  >
    {/* Outer red frame */}
    <rect x="6" y="6" width="285" height="198" fill="none" stroke="#c2410c" strokeWidth="2.2" />
    {/* Middle orange frame */}
    <rect x="9.5" y="9.5" width="278" height="191" fill="none" stroke="#ea580c" strokeWidth="0.9" />
    {/* Inner dashed accent */}
    <rect
      x="12"
      y="12"
      width="273"
      height="186"
      fill="none"
      stroke="#dc2626"
      strokeWidth="0.7"
      strokeDasharray="3 2"
    />
    {/* Corner ornaments */}
    {[
      [10, 10, 1, 1],
      [287, 10, -1, 1],
      [10, 200, 1, -1],
      [287, 200, -1, -1],
    ].map(([cx, cy, sx, sy], idx) => (
      <g key={idx} transform={`translate(${cx}, ${cy}) scale(${sx}, ${sy})`}>
        <path
          d="M0,0 L14,0 C9,3 3,9 0,14 Z"
          fill="#ea580c"
          opacity="0.85"
        />
        <circle cx="5" cy="5" r="1.4" fill="#fef3c7" />
      </g>
    ))}
  </svg>
);

export const CertificateSheet: React.FC<CertificateSheetProps> = ({
  cls,
  profile,
  month,
  items,
  signOptions,
  gradeWords,
}) => {
  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);

  return (
    <div className="bg-white text-black font-battambang">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const gradeWord = getGradeWord(item.grade, gradeWords);

        return (
          <div
            key={item.student.id ?? idx}
            data-print-page
            className="relative"
            style={{
              width: '297mm',
              height: '210mm',
              padding: '15mm 18mm',
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
            <OrnateCertificateBorder />

            <div className="relative z-10">
              <DocumentHeader profile={profile} />

              <div className="text-center mt-1">
                <h2
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[19pt] font-normal text-[#dc2626]"
                >
                  បណ្ណសរសើរ
                </h2>
                <div className="flex justify-center mt-1">
                  <img
                    src="/images/flourishes/flourish_2_clean.png"
                    alt=""
                    className="h-4 w-auto object-contain"
                  />
                </div>
                <div
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[11.5pt] text-[#1d4ed8] mt-2"
                >
                  នាយក{profile.schoolName}
                </div>
              </div>

              <div className="text-center text-[11.5pt] leading-[2.1] max-w-[235mm] mx-auto mt-3">
                សរសើរចំពោះសិស្សឈ្មោះ{' '}
                <strong className="font-bold text-[12.5pt]">{item.student.nameKm}</strong>{' '}
                រៀនថ្នាក់ទី <strong className="font-bold">{cls.name}</strong>{' '}
                ដែលបានយកចិត្តទុកដាក់ ខិតខំសិក្សារៀនសូត្រ ទទួលបានចំណាត់ថ្នាក់លេខ{' '}
                <strong className="font-bold text-[#dc2626] text-[12.5pt]">
                  {toKhmerNumerals(item.rank ?? '')}
                </strong>{' '}
                និទ្ទេស{' '}
                <strong className="font-bold text-[#dc2626] text-[12.5pt]">
                  {gradeWord}
                </strong>
              </div>

              <div className="text-center text-[10.5pt] font-bold mt-2">
                ប្រចាំខែ {monthName}&nbsp;&nbsp;&nbsp;&nbsp;ឆ្នាំសិក្សា{' '}
                {toKhmerNumerals(cls.academicYear)}
              </div>
            </div>

            <div className="relative z-10">
              <DocumentSignature
                profile={profile}
                signOptions={signOptions}
                showTeacher={false}
                gapMm={14}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
