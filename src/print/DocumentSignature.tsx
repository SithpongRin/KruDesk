import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Profile } from '../types/domain';
import { db } from '../db/database';
import type { SealImage } from '../utils/directorSeal';
import { getKhmerMonthName, toLocalDateKey } from '../lib/khmerDate';
import { toKhmerNumerals } from '../utils/khmerNumerals';

export interface DocumentSignOptions {
  month: string; // YYYY-MM
  lunarDate: string;
  place: string;
  /** YYYY-MM-DD, or '' to leave day and month blank for handwriting (the teacher's default). */
  gregorianDate: string;
  /**
   * Director's stamp / signature images (from Settings) to print on the approver block —
   * set only when the teacher ticks «ដាក់ត្រា និងហត្ថលេខានាយក».
   */
  directorStamp?: SealImage;
  directorSignature?: SealImage;
  /** Teacher's signature image (Settings), set only when «ដាក់ហត្ថលេខាគ្រូ» is ticked. */
  teacherSignature?: SealImage;
}

/** Titles under every document (teacher's sample, 2026-11-20). */
export const APPROVER_LINE = 'បានឃើញ និង ឯកភាព';
export const DIRECTOR_TITLE = 'នាយកសាលា';
export const TEACHER_TITLE = 'គ្រូទទួលបន្ទុកថ្នាក់';
export const BLANK_LUNAR_LINE = 'ថ្ងៃ.............ខែ...............ឆ្នាំ................ ព.ស. ២៥.....';

export function createDefaultSignOptions(
  month: string,
  place = '',
  lunarDate = ''
): DocumentSignOptions {
  return { month, lunarDate, place, gregorianDate: '' };
}

/** Lunar line as typed by the teacher, or dotted blanks for handwriting. */
export function formatDocumentLunarLine(lunarDate: string): string {
  return lunarDate.trim() || BLANK_LUNAR_LINE;
}

/**
 * «ដំណាក់ព្រីង ថ្ងៃទី ២០ ខែ វិច្ឆិកា ឆ្នាំ ២០២៦», or with an empty date key
 * «ដំណាក់ព្រីង ថ្ងៃទី...........ខែ.........ឆ្នាំ ២០២៦» (day and month written by hand).
 */
export function formatDocumentGregorianDate(place: string, dateKey: string): string {
  const trimmedPlace = place.trim();
  const prefix = trimmedPlace ? `${trimmedPlace} ` : '';
  if (!dateKey) {
    const year = Number(toLocalDateKey().slice(0, 4));
    return `${prefix}ថ្ងៃទី...........ខែ.........ឆ្នាំ ${toKhmerNumerals(year)}`;
  }
  const [yStr, mStr, dStr] = dateKey.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(mStr) || 1));
  const day = Number(dStr) || 1;
  return `${prefix}ថ្ងៃទី ${toKhmerNumerals(day)} ខែ ${getKhmerMonthName(month)} ឆ្នាំ ${toKhmerNumerals(year)}`;
}

/** Lines for documents exported without the sign dialog (Excel, lists): last saved lunar line and place. */
export async function loadSavedSignLines(): Promise<{ lunarLine: string; gregorianLine: string }> {
  const [lunar, place] = await Promise.all([
    db.settings.get('documentLunarDate').catch(() => undefined),
    db.settings.get('documentPlace').catch(() => undefined),
  ]);
  return {
    lunarLine: formatDocumentLunarLine((lunar?.value as string | undefined) ?? ''),
    gregorianLine: formatDocumentGregorianDate((place?.value as string | undefined) ?? '', ''),
  };
}

const MOUL = "'Moul', 'Khmer OS Muol Light', serif";

interface DocumentSignatureProps {
  profile: Profile;
  /** Dates chosen in the sign dialog; without it the last saved lunar line and place are used. */
  signOptions?: DocumentSignOptions;
  teacherTitle?: string;
  /** false → only the director signs (certificate): dates, «នាយកសាលា» and name on the right. */
  showTeacher?: boolean;
  color?: string;
  /** Space left for the handwritten signature, above the name. */
  gapMm?: number;
  /** Text size of the block (default 9pt). */
  fontSizePt?: number;
  /** Shown between the two blocks (e.g. a page number). */
  middle?: React.ReactNode;
}

/**
 * The signing space under «នាយកសាលា»: the director's signature in the middle, and the round
 * stamp centred over it, reaching up onto the title.
 */
const SealSpace: React.FC<{
  gapMm: number;
  fontSizePt: number;
  stamp?: SealImage;
  signature?: SealImage;
}> = ({ gapMm, fontSizePt, stamp, signature }) => {
  // Height of one text line of the block (leading-snug), to reach up over the two titles.
  const lineMm = fontSizePt * 0.3528 * 1.375;
  const signatureHeightMm = Math.max(8, gapMm * 0.9);
  // As on the school's documents, the round stamp is large and covers «បានឃើញ និង ឯកភាព» and
  // «នាយកសាលា». Some schools have stamp + signature (+ name) in one image: uploaded as
  // «ត្រាសាលា» with no separate signature, it is drawn taller so the signature lands in the gap.
  const combined = Boolean(stamp && !signature);
  const stampHeightMm = combined
    ? Math.min(44, gapMm + 2 * lineMm + 12)
    : Math.min(36, gapMm + 2 * lineMm + 6);
  const stampMaxWidthMm = combined ? 85 : stampHeightMm * 1.15;
  const stampTopMm = -(2 * lineMm) - 1;
  return (
    <div className="relative" style={{ height: `${gapMm}mm` }}>
      {stamp && (
        <img
          src={stamp.dataUrl}
          alt=""
          className="absolute max-w-none pointer-events-none"
          style={{
            height: `${stampHeightMm}mm`,
            width: 'auto',
            maxWidth: `${stampMaxWidthMm}mm`,
            objectFit: 'contain',
            // centred on the block (teacher, 2026-11-20)
            left: '50%',
            // In a stamp+signature image the round stamp sits on the left and the signature runs
            // to the right, so centre the stamp part (about 40% across) rather than the picture.
            transform: combined ? 'translateX(-40%)' : 'translateX(-50%)',
            top: `${stampTopMm}mm`,
            opacity: 0.92,
          }}
        />
      )}
      {signature && (
        <img
          src={signature.dataUrl}
          alt=""
          className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
          style={{
            height: `${signatureHeightMm}mm`,
            width: 'auto',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
};

/**
 * Signature block at the bottom of every document, after the teacher's sample:
 *
 *                                       ថ្ងៃ.....ខែ.....ឆ្នាំ មមែ អដ្ឋស័ក ព.ស. ២៥៧០
 *                                       ដំណាក់ព្រីង ថ្ងៃទី.....ខែ.....ឆ្នាំ ២០២៦
 *        បានឃើញ និង ឯកភាព                      គ្រូទទួលបន្ទុកថ្នាក់
 *             នាយកសាលា
 *
 *                                                (teacher's name)
 *
 * The approver block has no dates and no name; its first title is level with the teacher's title.
 */
export const DocumentSignature: React.FC<DocumentSignatureProps> = ({
  profile,
  signOptions,
  teacherTitle = TEACHER_TITLE,
  showTeacher = true,
  color = '#000000',
  gapMm = 14,
  fontSizePt = 9,
  middle,
}) => {
  // Documents printed without the sign dialog reuse what the teacher typed there last time.
  const savedLunar = useLiveQuery(
    () => (signOptions ? undefined : db.settings.get('documentLunarDate')),
    [signOptions]
  );
  const savedPlace = useLiveQuery(
    () => (signOptions ? undefined : db.settings.get('documentPlace')),
    [signOptions]
  );
  const stamp = signOptions?.directorStamp;
  const directorSignature = signOptions?.directorSignature;
  const teacherSignature = signOptions?.teacherSignature;

  const lunarLine = formatDocumentLunarLine(
    signOptions?.lunarDate ?? (savedLunar?.value as string | undefined) ?? ''
  );
  const gregorianLine = formatDocumentGregorianDate(
    signOptions?.place ?? (savedPlace?.value as string | undefined) ?? '',
    signOptions?.gregorianDate ?? ''
  );

  const dateLines = (
    <>
      <div className="whitespace-nowrap">{lunarLine}</div>
      <div className="whitespace-nowrap">{gregorianLine}</div>
    </>
  );

  if (!showTeacher) {
    return (
      <div
        className="flex justify-end pr-12 leading-snug pt-2"
        style={{ color, fontSize: `${fontSizePt}pt` }}
      >
        <div className="text-center">
          {dateLines}
          <div className="mt-0.5" style={{ fontFamily: MOUL }}>
            {DIRECTOR_TITLE}
          </div>
          <SealSpace
            gapMm={gapMm}
            fontSizePt={fontSizePt}
            stamp={stamp}
            signature={directorSignature}
          />
          <div style={{ fontFamily: MOUL }}>{profile.directorName}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid items-start leading-snug pt-2"
      style={{ color, fontSize: `${fontSizePt}pt`, gridTemplateColumns: '1fr auto 1fr' }}
    >
      <div className="text-center">
        {/* Invisible date lines keep «បានឃើញ និង ឯកភាព» level with the teacher's title. */}
        <div className="invisible" aria-hidden="true">
          {dateLines}
        </div>
        <div className="mt-0.5" style={{ fontFamily: MOUL }}>
          {APPROVER_LINE}
        </div>
        <div style={{ fontFamily: MOUL }}>{DIRECTOR_TITLE}</div>
        {(stamp || directorSignature) && (
          <SealSpace
            gapMm={gapMm}
            fontSizePt={fontSizePt}
            stamp={stamp}
            signature={directorSignature}
          />
        )}
      </div>

      <div className="self-end text-center px-2">{middle}</div>

      <div className="text-center">
        {dateLines}
        <div className="mt-0.5" style={{ fontFamily: MOUL }}>
          {teacherTitle}
        </div>
        <SealSpace gapMm={gapMm} fontSizePt={fontSizePt} signature={teacherSignature} />
        <div style={{ fontFamily: MOUL }}>{profile.teacherName}</div>
      </div>
    </div>
  );
};
