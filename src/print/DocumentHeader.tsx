import React from 'react';
import type { Profile } from '../types/domain';
import { getAssetUrl } from '../utils/assets';
import { toKhmerNumerals } from '../utils/khmerNumerals';

export function formatMinistryProvince(province?: string): string {
  const trimmed = (province ?? '').trim();
  if (!trimmed) return 'ខេត្ត…………………';
  if (trimmed === 'ភ្នំពេញ' || trimmed === 'រាជធានីភ្នំពេញ') {
    return 'រាជធានីភ្នំពេញ';
  }
  if (trimmed.startsWith('ខេត្ត') || trimmed.startsWith('រាជធានី')) {
    return trimmed;
  }
  return `ខេត្ត${trimmed}`;
}

/** «២០២៥ - ២០២៦»: Khmer digits with a spaced dash, as on the school's documents. */
export function formatAcademicYearKm(academicYear: string): string {
  return toKhmerNumerals(academicYear.trim().replace(/\s*[-–]\s*/, ' - '));
}

/** «ឆ្នាំសិក្សា ២០២៥ - ២០២៦» line under a document title, in Moul like samples 01, 02, 05. */
export const AcademicYearLine: React.FC<{ academicYear: string; className?: string }> = ({
  academicYear,
  className = 'text-[10pt] mt-0.5',
}) => (
  <div className={className} style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}>
    ឆ្នាំសិក្សា {formatAcademicYearKm(academicYear)}
  </div>
);

interface DocumentHeaderProps {
  profile: Profile;
  compact?: boolean;
  color?: string;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  profile,
  compact = false,
  color = '#000000',
}) => {
  return (
    <div className={compact ? 'mb-1.5' : 'mb-2.5'} style={{ color }}>
      <div className="text-center leading-tight">
        <div
          style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
          className={compact ? 'text-[10pt]' : 'text-[11pt]'}
        >
          ព្រះរាជាណាចក្រកម្ពុជា
        </div>
        <div
          style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
          className={`${compact ? 'text-[9.5pt]' : 'text-[10.5pt]'} mt-0.5`}
        >
          ជាតិ សាសនា ព្រះមហាក្សត្រ
        </div>
        <div className="flex justify-center mt-0.5">
          <img
            src={getAssetUrl('images/flourishes/flourish_1_clean.png')}
            alt=""
            className="h-3 w-auto object-contain"
            // School documents use a small dark flourish; the image itself is blue.
            style={color === '#000000' ? { filter: 'grayscale(1) brightness(0.25)' } : undefined}
          />
        </div>
      </div>

      {/* Ministry + school in Moul, like the school's documents (samples 01, 02, 05). */}
      <div
        className={`text-left leading-normal ${compact ? 'text-[9.5pt] mt-0.5' : 'text-[10pt] mt-1'}`}
        style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
      >
        <div>មន្ទីរអប់រំ យុវជន និងកីឡា {formatMinistryProvince(profile.province)}</div>
        <div>{profile.schoolName}</div>
      </div>
    </div>
  );
};
