import React from 'react';
import type { Profile } from '../types/domain';
import { getKhmerMonthName, toLocalDateKey } from '../lib/khmerDate';
import { toKhmerNumerals } from '../utils/khmerNumerals';

export interface DocumentSignOptions {
  month: string; // YYYY-MM
  lunarDate: string;
  place: string;
  gregorianDate: string; // YYYY-MM-DD
}

export function createDefaultSignOptions(month: string, place = ''): DocumentSignOptions {
  return {
    month,
    lunarDate: '',
    place,
    gregorianDate: toLocalDateKey(),
  };
}

export function formatDocumentGregorianDate(place: string, dateKey: string): string {
  const [yStr, mStr, dStr] = (dateKey || toLocalDateKey()).split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(mStr) || 1));
  const day = Number(dStr) || 1;
  const datePart = `ថ្ងៃទី ${toKhmerNumerals(day)} ខែ ${getKhmerMonthName(month)} ឆ្នាំ ${toKhmerNumerals(year)}`;
  const trimmedPlace = place.trim();
  return trimmedPlace ? `${trimmedPlace}, ${datePart}` : datePart;
}

interface DocumentSignatureProps {
  profile: Profile;
  signOptions: DocumentSignOptions;
  teacherTitle?: string;
  showTeacher?: boolean;
  showApprovedBy?: boolean;
  align?: 'between' | 'right';
  color?: string;
  gapMm?: number;
  /**
   * 'dated' (results tables, sample 02): the director block repeats the dates and shows the name.
   * 'simple' (student report cards, samples 01/05): only «បានឃើញឯកភាព» + «នាយក/នាយិកាសាលា»,
   * level with the teacher's block, without dates or the director's name.
   */
  approverStyle?: 'dated' | 'simple';
  /** Text size of the block (default 9pt; the certificate uses a larger size). */
  fontSizePt?: number;
}

export const DocumentSignature: React.FC<DocumentSignatureProps> = ({
  profile,
  signOptions,
  teacherTitle = 'គ្រូបន្ទុកថ្នាក់',
  showTeacher = true,
  showApprovedBy = true,
  align = 'between',
  color = '#000000',
  gapMm = 14,
  approverStyle = 'dated',
  fontSizePt = 9,
}) => {
  const lunarLine =
    signOptions.lunarDate.trim() ||
    'ថ្ងៃ…………… ខែ………… ឆ្នាំ………… ព.ស. ២៥……';
  const gregorianLine = formatDocumentGregorianDate(
    signOptions.place,
    signOptions.gregorianDate
  );

  const justifyClass =
    align === 'right'
      ? 'justify-end pr-12'
      : showTeacher
        ? 'justify-between px-4'
        : 'justify-center';

  return (
    <div
      className={`flex items-start ${justifyClass} leading-snug pt-2`}
      style={{ color, fontSize: `${fontSizePt}pt` }}
    >
      {approverStyle === 'simple' ? (
        <div className="text-center min-w-[68mm]">
          {/* invisible first line keeps «បានឃើញឯកភាព» level with the teacher's date line */}
          <div className="whitespace-nowrap invisible" aria-hidden="true">
            {lunarLine}
          </div>
          {showApprovedBy && <div>បានឃើញឯកភាព</div>}
          <div className="mt-0.5">នាយក/នាយិកាសាលា</div>
        </div>
      ) : (
        <div className="text-center min-w-[68mm]">
          {showApprovedBy && <div className="font-bold">បានឃើញ និងឯកភាព</div>}
          <div className="whitespace-nowrap">{lunarLine}</div>
          <div>{gregorianLine}</div>
          <div className="font-bold mt-0.5">នាយក/នាយិកាសាលា</div>
          <div style={{ height: `${gapMm}mm` }} />
          <div className="font-bold">{profile.directorName}</div>
        </div>
      )}

      {showTeacher && (
        <div className="text-center min-w-[68mm]">
          <div className="whitespace-nowrap">{lunarLine}</div>
          <div>{gregorianLine}</div>
          <div className={approverStyle === 'simple' ? 'mt-0.5' : 'font-bold mt-0.5'}>
            {teacherTitle}
          </div>
          <div style={{ height: `${gapMm}mm` }} />
          <div className={approverStyle === 'simple' ? '' : 'font-bold'}>
            {profile.teacherName}
          </div>
        </div>
      )}
    </div>
  );
};
