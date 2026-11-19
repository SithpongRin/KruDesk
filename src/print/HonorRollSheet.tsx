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

const CrownSvg: React.FC = () => (
  <svg width="20" height="14" viewBox="0 0 24 16" fill="none" className="inline-block mr-1 -mt-0.5">
    <path
      d="M2 14L4 4L9 9L12 2L15 9L20 4L22 14H2Z"
      fill="#f59e0b"
      stroke="#b45309"
      strokeWidth="1.4"
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
      className="mx-auto border-2 border-[#1d4ed8] bg-slate-100 overflow-hidden shadow-sm"
      style={{ width: '27mm', height: '36mm' }}
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
    <div className="text-[10.5pt] font-bold text-[#b91c1c] mb-1">
      <CrownSvg />
      លេខ {toKhmerNumerals(item.rank ?? '')}
    </div>
    <StudentPhoto photoBlob={item.student.photoBlob} name={item.student.nameKm} />
    <div
      className="mt-1.5 px-3 py-1 rounded-full border border-[#1d4ed8] bg-[#eff6ff] text-[#1e3a8a] font-bold text-[9.5pt] max-w-[52mm] truncate shadow-sm"
      style={{
        backgroundImage: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
      }}
    >
      {item.student.nameKm}
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
        style={{
          width: '210mm',
          height: '297mm',
          padding: '7mm',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
        }}
      >
        {/* Double decorative blue border */}
        <div
          className="w-full h-full flex flex-col justify-between p-[5mm]"
          style={{
            border: '3px solid #1d4ed8',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="w-full h-full flex flex-col justify-between p-[5mm]"
            style={{
              border: '1.5px solid #2563eb',
              boxSizing: 'border-box',
            }}
          >
            <div>
              <DocumentHeader profile={profile} />

              <div className="text-center mb-4">
                <h2
                  style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                  className="text-[13pt] font-normal text-[#1e3a8a]"
                >
                  តារាងកិត្តិយសប្រចាំខែ {monthName}
                  {semester ? ` - ឆមាសទី ${toKhmerNumerals(semester)}` : ''}
                </h2>
                <div className="text-[10pt] font-bold mt-1">
                  ថ្នាក់ទី {cls.name} · ឆ្នាំសិក្សា {toKhmerNumerals(cls.academicYear)}
                </div>
              </div>

              {/* Pyramid layout */}
              <div className="space-y-4 mt-2">
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

            <DocumentSignature
              profile={profile}
              signOptions={signOptions}
              teacherTitle="គ្រូទទួលបន្ទុកថ្នាក់"
              gapMm={13}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
