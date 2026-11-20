import React from 'react';
import type { Profile, SchoolClass } from '../types/domain';
import type { ScoreGrade } from '../lib/grading';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import { getGradeWord, type MonthlyResultRow } from '../lib/monthlyResults';
import { toKhmerNumerals } from '../utils/khmerNumerals';
import { getAssetUrl } from '../utils/assets';
import { DocumentHeader, formatAcademicYearKm } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';
import type { DocumentBorderImage } from '../utils/documentBorder';

interface CertificateSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  items: MonthlyResultRow[];
  signOptions: DocumentSignOptions;
  gradeWords?: Partial<Record<ScoreGrade, string>>;
  /** Frame image chosen by the teacher (stretched over the whole page); built-in frame if absent. */
  borderImage?: DocumentBorderImage;
}

const OrnateCertificateBorder: React.FC = () => (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    viewBox="0 0 297 210"
    preserveAspectRatio="none"
  >
    {/* Thick ornate red/orange frame */}
    <rect x="6" y="6" width="285" height="198" fill="none" stroke="#dc2626" strokeWidth="3.2" />
    <rect x="9.5" y="9.5" width="278" height="191" fill="none" stroke="#f97316" strokeWidth="1.4" />
    <rect
      x="12"
      y="12"
      width="273"
      height="186"
      fill="none"
      stroke="#ea580c"
      strokeWidth="0.9"
      strokeDasharray="2.5 1.8"
    />
    <rect x="14" y="14" width="269" height="182" fill="none" stroke="#dc2626" strokeWidth="0.8" />

    {/* Corner floral rosettes */}
    {[
      [10, 10, 1, 1],
      [287, 10, -1, 1],
      [10, 200, 1, -1],
      [287, 200, -1, -1],
    ].map(([cx, cy, sx, sy], idx) => (
      <g key={idx} transform={`translate(${cx}, ${cy}) scale(${sx}, ${sy})`}>
        <path
          d="M0,0 L16,0 C11,4 4,11 0,16 Z"
          fill="#ea580c"
          opacity="0.9"
        />
        <path
          d="M2,2 C6,2 10,6 10,10 C6,10 2,6 2,2 Z"
          fill="#dc2626"
        />
        <circle cx="5" cy="5" r="1.5" fill="#fef3c7" />
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
  borderImage,
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
              // An image frame (e.g. Khmer «ក្បាច់») is wider than the built-in lines.
              padding: borderImage ? '24mm 30mm' : '17mm 20mm',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
              color: '#000000',
              fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
              pageBreakAfter: !isLast ? 'always' : 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {borderImage ? (
              <img
                src={borderImage.dataUrl}
                alt=""
                className="absolute inset-0 w-full h-full pointer-events-none select-none"
                style={{ objectFit: 'fill' }}
              />
            ) : (
              <OrnateCertificateBorder />
            )}

            <div className="relative z-10">
              <DocumentHeader profile={profile} color="#1d4ed8" />

              <div className="text-center mt-1">
                <h2
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[24pt] font-normal text-[#dc2626] leading-snug"
                >
                  បណ្ណសរសើរ
                </h2>
                <div className="flex justify-center mt-0.5">
                  <img
                    src={getAssetUrl('images/flourishes/flourish_2_clean.png')}
                    alt=""
                    className="h-3.5 w-auto object-contain"
                  />
                </div>
                <div
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[16pt] text-[#1d4ed8] mt-1"
                >
                  នាយក{profile.schoolName}
                </div>
              </div>

              <div className="text-center text-[14pt] leading-[1.9] max-w-[205mm] mx-auto mt-3">
                សរសើរចំពោះសិស្សឈ្មោះ{' '}
                <strong className="font-bold text-[14.5pt]">{item.student.nameKm}</strong>{' '}
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

              <div
                className="text-center text-[13pt] mt-1"
                style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
              >
                ប្រចាំខែ {monthName}&nbsp;&nbsp;ឆ្នាំសិក្សា {formatAcademicYearKm(cls.academicYear)}
              </div>
            </div>

            <div className="relative z-10 mt-1">
              <DocumentSignature
                profile={profile}
                signOptions={signOptions}
                showTeacher={false}
                gapMm={13}
                fontSizePt={12}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
