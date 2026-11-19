import React from 'react';
import type { Profile } from '../types/domain';

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
            src="/images/flourishes/flourish_1_clean.png"
            alt=""
            className="h-3.5 w-auto object-contain"
          />
        </div>
      </div>

      <div className="text-left text-[9.5pt] leading-snug -mt-3">
        <div>មន្ទីរអប់រំ យុវជន និងកីឡា {formatMinistryProvince(profile.province)}</div>
        <div className="font-bold">{profile.schoolName}</div>
      </div>
    </div>
  );
};
