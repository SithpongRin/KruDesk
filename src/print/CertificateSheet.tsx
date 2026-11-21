import React from 'react';
import type { Profile, SchoolClass } from '../types/domain';
import type { ScoreGrade } from '../lib/grading';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import { getGradeWord, type MonthlyResultRow } from '../lib/monthlyResults';
import { toKhmerNumerals } from '../utils/khmerNumerals';
import { getAssetUrl } from '../utils/assets';
import { DocumentHeader, formatAcademicYearKm } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';
import {
  framePaddingMm,
  resolveDocumentBorder,
  type CertificateRank,
  type DocumentBorderImage,
} from '../utils/documentBorder';
import { FrameImage } from './FrameImage';

interface CertificateSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  items: MonthlyResultRow[];
  signOptions: DocumentSignOptions;
  gradeWords?: Partial<Record<ScoreGrade, string>>;
  /** Frame image chosen by the teacher (stretched over the whole page); the default kbach frame if absent. */
  borderImage?: DocumentBorderImage;
  /** Optional per-rank frame overrides (ranks 1–3); falls back to `borderImage` when unset. */
  borderImagesByRank?: Partial<Record<CertificateRank, DocumentBorderImage | undefined>>;
}

export const CertificateSheet: React.FC<CertificateSheetProps> = ({
  cls,
  profile,
  month,
  items,
  signOptions,
  gradeWords,
  borderImage,
  borderImagesByRank,
}) => {
  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);
  const defaultFrame = borderImage ?? resolveDocumentBorder('certificateBorder', undefined);

  return (
    <div className="bg-white text-black font-battambang">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const gradeWord = getGradeWord(item.grade, gradeWords);
        const rankKey: CertificateRank | undefined =
          item.rank === 1 || item.rank === 2 || item.rank === 3 ? item.rank : undefined;
        const frame = (rankKey ? borderImagesByRank?.[rankKey] : undefined) ?? defaultFrame;
        // Keep the text clear of each page's own frame width (frames differ per rank).
        const pad = framePaddingMm(frame?.inner, 297, 210, {
          top: 22,
          right: 30,
          bottom: 22,
          left: 30,
        });

        return (
          <div
            key={item.student.id ?? idx}
            data-print-page
            className="relative"
            style={{
              width: '297mm',
              height: '210mm',
              // Room for the Khmer «ក្បាច់» frame image around the text.
              padding: `${pad.top}mm ${pad.right}mm ${pad.bottom}mm ${pad.left}mm`,
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
            {frame && <FrameImage image={frame} pageWidthMm={297} pageHeightMm={210} />}

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
                <strong className="font-bold text-[14.5pt]">{item.student.nameKm}</strong> រៀនថ្នាក់ទី{' '}
                <strong className="font-bold">{cls.name}</strong> ដែលបានយកចិត្តទុកដាក់ ខិតខំសិក្សារៀនសូត្រ
                ទទួលបានចំណាត់ថ្នាក់លេខ{' '}
                <strong className="font-bold text-[#dc2626] text-[12.5pt]">
                  {toKhmerNumerals(item.rank ?? '')}
                </strong>{' '}
                និទ្ទេស{' '}
                <strong className="font-bold text-[#dc2626] text-[12.5pt]">{gradeWord}</strong>
              </div>

              <div
                className="text-center text-[13pt] mt-1"
                style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
              >
                ប្រចាំខែ {monthName}&nbsp;&nbsp;ឆ្នាំសិក្សា {formatAcademicYearKm(cls.academicYear)}
              </div>
            </div>

            <div className="relative z-10 mt-1">
              {/* Same block as the honor roll: approver on the left, homeroom teacher on the right. */}
              <DocumentSignature
                profile={profile}
                signOptions={signOptions}
                gapMm={13}
                fontSizePt={11}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
