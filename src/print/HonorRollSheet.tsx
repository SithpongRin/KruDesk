import React, { useEffect, useState } from 'react';
import type { Profile, SchoolClass } from '../types/domain';
import { getKhmerMonthName, parseYearMonth } from '../lib/khmerDate';
import type { MonthlyResultRow } from '../lib/monthlyResults';
import { toKhmerNumerals } from '../utils/khmerNumerals';
import { AcademicYearLine, DocumentHeader } from './DocumentHeader';
import { DocumentSignature, type DocumentSignOptions } from './DocumentSignature';
import type { DocumentBorderImage } from '../utils/documentBorder';

interface HonorRollSheetProps {
  cls: SchoolClass;
  profile: Profile;
  month: string;
  items: MonthlyResultRow[];
  signOptions: DocumentSignOptions;
  /** Plaque image for the students' names (transparent PNG); built-in scroll if absent. */
  nameBanner?: DocumentBorderImage;
}

/** Built-in frame after the school's sample 03: a thick indigo band between two thin black lines. */
const HonorRollBorderSvg: React.FC = () => (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    viewBox="0 0 210 297"
    preserveAspectRatio="none"
  >
    <rect x="8" y="8" width="194" height="281" fill="none" stroke="#111827" strokeWidth="0.55" />
    <rect
      x="10.4"
      y="10.4"
      width="189.2"
      height="276.2"
      fill="none"
      stroke="#3b2aa0"
      strokeWidth="3.6"
    />
    <rect
      x="12.9"
      y="12.9"
      width="184.2"
      height="271.2"
      fill="none"
      stroke="#111827"
      strokeWidth="0.4"
    />
    {/* Corner brackets */}
    {[
      [4.5, 4.5],
      [197.5, 4.5],
      [4.5, 284.5],
      [197.5, 284.5],
    ].map(([x, y], i) => (
      <g key={i}>
        <rect x={x} y={y} width="8" height="8" fill="#ffffff" stroke="#111827" strokeWidth="0.6" />
        <rect x={x + 1.6} y={y + 1.6} width="4.8" height="4.8" fill="#3b2aa0" />
      </g>
    ))}
  </svg>
);

/** Gilded scroll banner with curled ends, laid over the bottom of the photo (sample 03). */
const NameBannerSvg: React.FC = () => {
  // Body with scroll-curl ends (top and bottom edges curl outward), like sample 03.
  const d =
    'M40 10 L180 10 C192 10 196 4 204 4 C212 4 216 10 212 15 C209 19 203 17 204 13 C198 15 196 20 206 23 C196 26 198 31 204 33 C203 29 209 27 212 31 C216 36 212 42 204 42 C196 42 192 36 180 36 L40 36 C28 36 24 42 16 42 C8 42 4 36 8 31 C11 27 17 29 16 33 C22 31 24 26 14 23 C24 20 22 15 16 13 C17 17 11 19 8 15 C4 10 8 4 16 4 C24 4 28 10 40 10 Z';
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 220 47"
      preserveAspectRatio="none"
    >
      <path d={d} fill="#ffffff" stroke="#b7791f" strokeWidth="4.5" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#f6d365" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
};

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
      style={{ width: '28.5mm', height: '38mm' }}
    >
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <SilhouetteSvg />
      )}
    </div>
  );
};

const PyramidCard: React.FC<{
  item: MonthlyResultRow;
  nameBanner?: DocumentBorderImage;
}> = ({ item, nameBanner }) => {
  // A teacher's plaque image keeps its own proportions; its open middle is about half its width.
  const bannerWidthMm = nameBanner ? 54 : 50;
  const bannerHeightMm = nameBanner
    ? Math.min(22, Math.max(10, (bannerWidthMm * nameBanner.height) / nameBanner.width))
    : 11;
  return (
    <div className="flex flex-col items-center text-center w-[56mm]">
      <div
        className="text-[11pt] text-[#dc2626] leading-tight mb-1"
        style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
      >
        លេខ {toKhmerNumerals(item.rank ?? '')}
      </div>
      <StudentPhoto photoBlob={item.student.photoBlob} name={item.student.nameKm} />
      {/* Name banner overlaps the bottom of the photo like the school's sample. */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: `${bannerWidthMm}mm`,
          height: `${bannerHeightMm}mm`,
          marginTop: nameBanner ? '-6mm' : '-4mm',
        }}
      >
        {nameBanner ? (
          <>
            {/* White behind the plaque's open middle so the photo never shows through the name. */}
            <div
              className="absolute bg-white"
              style={{ left: '20%', right: '20%', top: '16%', bottom: '16%' }}
            />
            <img
              src={nameBanner.dataUrl}
              alt=""
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              style={{ objectFit: 'fill' }}
            />
          </>
        ) : (
          <NameBannerSvg />
        )}
        <span
          className="relative z-10 text-[11pt] text-[#1d4ed8] block truncate leading-none"
          style={{
            maxWidth: nameBanner ? `${bannerWidthMm * 0.54}mm` : '34mm',
          }}
        >
          {item.student.nameKm}
        </span>
      </div>
    </div>
  );
};

export const HonorRollSheet: React.FC<HonorRollSheetProps> = ({
  cls,
  profile,
  month,
  items,
  signOptions,
  nameBanner,
}) => {
  const { month: monthNum } = parseYearMonth(month);
  const monthName = getKhmerMonthName(monthNum);

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
          padding: '15mm 17mm 14mm',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#1e3a8a',
          fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >
        <HonorRollBorderSvg />

        <div className="relative z-10">
          <DocumentHeader profile={profile} color="#1e3a8a" />

          <div className="text-center mb-2">
            <h2
              style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
              className="text-[15pt] font-normal text-[#dc2626] leading-snug"
            >
              {/* Monthly honor roll: the month only (a semester honor roll would get its own title). */}
              តារាងកិត្តិយសប្រចាំខែ {monthName}
            </h2>
            <div
              className="text-[12pt] text-[#1e3a8a] mt-0.5"
              style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
            >
              ថ្នាក់ទី {cls.name}
            </div>
            <AcademicYearLine
              academicYear={cls.academicYear}
              className="text-[12pt] text-[#1e3a8a]"
            />
          </div>

          <div className="mt-1">
            {row1.length > 0 && (
              <div className="flex justify-center">
                <PyramidCard item={row1[0]} nameBanner={nameBanner} />
              </div>
            )}
            {row2.length > 0 && (
              <div className="flex justify-between px-[4mm]" style={{ marginTop: '-22mm' }}>
                {row2.map((it) => (
                  <PyramidCard
                    key={it.student.id ?? it.student.studentId}
                    item={it}
                    nameBanner={nameBanner}
                  />
                ))}
              </div>
            )}
            {row3.length > 0 && (
              <div className="flex justify-between px-[4mm]" style={{ marginTop: '6mm' }}>
                {row3.map((it) => (
                  <PyramidCard
                    key={it.student.id ?? it.student.studentId}
                    item={it}
                    nameBanner={nameBanner}
                  />
                ))}
              </div>
            )}
            {row4.length > 0 && (
              <div className="flex justify-center" style={{ marginTop: '-22mm' }}>
                <PyramidCard item={row4[0]} nameBanner={nameBanner} />
              </div>
            )}
          </div>
        </div>

        {/* Signatures right under the photos, like sample 03, so names never reach the frame. */}
        <div className="relative z-10" style={{ marginTop: '7mm' }}>
          <DocumentSignature
            profile={profile}
            signOptions={signOptions}
            color="#1e3a8a"
            gapMm={17}
            fontSizePt={9.5}
          />
        </div>
      </div>
    </div>
  );
};
