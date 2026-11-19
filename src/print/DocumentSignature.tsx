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
  gapMm?: number;
}

export const DocumentSignature: React.FC<DocumentSignatureProps> = ({
  profile,
  signOptions,
  teacherTitle = 'គ្រូបន្ទុកថ្នាក់',
  showTeacher = true,
  gapMm = 14,
}) => {
  const lunarLine =
    signOptions.lunarDate.trim() ||
    'ថ្ងៃ……………… ខែ……………… ឆ្នាំ……………… ព.ស. ២៥……';
  const gregorianLine = formatDocumentGregorianDate(
    signOptions.place,
    signOptions.gregorianDate
  );

  return (
    <div
      className={`flex items-start ${showTeacher ? 'justify-between px-4' : 'justify-center'} text-[9pt] leading-snug pt-2`}
    >
      <div className="text-center min-w-[68mm]">
        <div className="font-bold">បានឃើញ និងឯកភាព</div>
        <div>{lunarLine}</div>
        <div>{gregorianLine}</div>
        <div className="font-bold mt-0.5">នាយក/នាយិកាសាលា</div>
        <div style={{ height: `${gapMm}mm` }} />
        <div className="font-bold">{profile.directorName}</div>
      </div>

      {showTeacher && (
        <div className="text-center min-w-[68mm]">
          <div>{lunarLine}</div>
          <div>{gregorianLine}</div>
          <div className="font-bold mt-0.5">{teacherTitle}</div>
          <div style={{ height: `${gapMm}mm` }} />
          <div className="font-bold">{profile.teacherName}</div>
        </div>
      )}
    </div>
  );
};
