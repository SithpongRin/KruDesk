import React, { useEffect, useState } from 'react';
import type { Profile, SchoolClass, ScoreConfig } from '../types/domain';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import {
  resolveSemesterForMonth,
  type MonthlyResultRow,
} from '../lib/monthlyResults';
import { toKhmerNumerals } from '../utils/khmerNumerals';
import { DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';

interface HonorRollSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  items: MonthlyResultRow[];
  scoreConfig: ScoreConfig;
  signOptions: DocumentSignOptions;
}

const HonorRollBorderSvg: React.FC = () => (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    viewBox="0 0 210 297"
    preserveAspectRatio="none"
  >
    <rect x="6" y="6" width="198" height="285" fill="none" stroke="#1e3a8a" strokeWidth="1.6" />
    <rect x="8.5" y="8.5" width="193" height="280" fill="none" stroke="#1d4ed8" strokeWidth="0.9" />
    {/* Corner squares */}
    {[
      [6, 6],
      [196, 6],
      [6, 283],
      [196, 283],
    ].map(([x, y], i) => (
      <g key={i}>
        <rect x={x} y={y} width="8" height="8" fill="#ffffff" stroke="#1e3a8a" strokeWidth="1.1" />
        <rect x={x + 2} y={y + 2} width="4" height="4" fill="#1e3a8a" />
      </g>
    ))}
  </svg>
);

const CrownSvg: React.FC = () => (
  <svg width="24" height="14" viewBox="0 0 28 16" fill="none" className="mx-auto mb-0.5">
    <path
      d="M2 14L5 4L10 9L14 1.5L18 9L23 4L26 14H2Z"
      fill="#f59e0b"
      stroke="#b45309"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

const SilhouetteSvg: React.FC = () => (
  <svg viewBox="0 0 64 80" className="w-full h-full bg-slate-200 text-slate-400">
    <circle cx="32" cy="27" r="13" fill="currentColor" />
    <path d="M10 74C10 56 20 47 32 47C44 47 54 56 54 74Z" fill="currentColor" />
  </svg>
);

const StudentPhoto: React.FC<{ photoBlob?: Blob; name: string }> = ({ photoBlob, name }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoBlob) {
      setUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(photoBlob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [photoBlob]);

  return (
    <div
      className="mx-auto border border-[#1d4ed8] bg-slate-100 overflow-hidden shadow-sm"
      style={{ width: '25mm', height: '33mm' }}
    >
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <SilhouetteSvg />
      )}
    </div>
  );
};

const PyramidCard: React.FC<{ item: MonthlyResultRow }> = ({ item }) => (
  <div className="flex flex-col items-center text-center w-[48mm]">
    <CrownSvg />
    <div className="text-[10pt] font-bold text-[#dc2626] leading-tight mb-0.5">
      លេខ {toKhmerNumerals(item.rank ?? '')}
    </div>
    <StudentPhoto photoBlob={item.student.photoBlob} name={item.student.nameKm} />
    {/* Ornate scroll banner */}
    <div className="relative mt-1.5 px-4 py-1 min-w-[40mm] max-w-[50mm]">
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 160 28"
        preserveAspectRatio="none"
      >
        <path
          d="M8,3 L152,3 C156,3 158,8 154,14 C158,20 156,25 152,25 L8,25 C4,25 2,20 6,14 C2,8 4,3 8,3 Z"
          fill="#fefce8"
          stroke="#d97706"
          strokeWidth="1.6"
        />
      </svg>
      <span className="relative z-10 font-bold text-[9pt] text-[#1e3a8a] block truncate">
        {item.student.nameKm}
      </span>
    </div>
  </div>
);

export const HonorRollSheet: React.FC<HonorRollSheetProps> = ({
  cls,
  profile,
  month,
  items,
  scoreConfig,
  signOptions,
}) => {
  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);
  const semester = resolveSemesterForMonth(month, scoreConfig);

  const row1 = items.slice(0, 1);
  const row2 = items.slice(1, 3);
  const row3 = items.slice(3, 5);
  const row4 = items.slice(5, 6);

  return (
    <div className="bg-white text-black font-battambang">
      <div
        data-print-page
        className="relative"
        style={{
          width: '210mm',
          height: '297mm',
          padding: '13mm 14mm',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#1e3a8a',
          fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <HonorRollBorderSvg />

        <div className="relative z-10">
          <DocumentHeader profile={profile} color="#1e3a8a" />

          <div className="text-center mb-3">
            <h2
              style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
              className="text-[12.5pt] font-normal text-[#dc2626]"
            >
              តារាងកិត្តិយសប្រចាំខែ {monthName}
              {semester ? ` - ឆមាសទី ${toKhmerNumerals(semester)}` : ''}
            </h2>
            <div className="text-[10pt] font-bold text-[#1e3a8a] mt-0.5">
              ថ្នាក់ទី {cls.name}
            </div>
            <div className="text-[9.5pt] font-bold text-[#1e3a8a]">
              ឆ្នាំសិក្សា {toKhmerNumerals(cls.academicYear)}
            </div>
          </div>

          <div className="space-y-3 mt-1">
            {row1.length > 0 && (
              <div className="flex justify-center">
                <PyramidCard item={row1[0]} />
              </div>
            )}
            {row2.length > 0 && (
              <div className="flex justify-around px-6">
                {row2.map((it) => (
                  <PyramidCard key={it.student.id ?? it.student.studentId} item={it} />
                ))}
              </div>
            )}
            {row3.length > 0 && (
              <div className="flex justify-around px-2">
                {row3.map((it) => (
                  <PyramidCard key={it.student.id ?? it.student.studentId} item={it} />
                ))}
              </div>
            )}
            {row4.length > 0 && (
              <div className="flex justify-center">
                <PyramidCard item={row4[0]} />
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10">
          <DocumentSignature
            profile={profile}
            signOptions={signOptions}
            teacherTitle="គ្រូទទួលបន្ទុកថ្នាក់"
            color="#1e3a8a"
            gapMm={12}
          />
        </div>
      </div>
    </div>
  );
};
