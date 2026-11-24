import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Profile } from '../types/domain';
import { db } from '../db/database';
import {
  STAMP_OPACITY,
  clampStampOffsetMm,
  clampStampScale,
  computeDirectorStampBox,
  computeSignatureBox,
  type SealImage,
} from '../utils/directorSeal';
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
  /** User-selected scale factor for the director's stamp (default 1, clamped 0.4–2.2). */
  stampScale?: number;
  /** Optional horizontal/vertical nudge (in mm) relative to the default stamp placement. */
  stampOffsetXMm?: number;
  stampOffsetYMm?: number;
  /** User-selected scale factor for the teacher's signature (default 1, clamped 0.4–2.2). */
  teacherSignatureScale?: number;
  /** Optional horizontal/vertical nudge (in mm) of the teacher's signature. */
  teacherSignatureOffsetXMm?: number;
  teacherSignatureOffsetYMm?: number;
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
  /** Space left for the handwritten signature, above the name (default 20mm). */
  gapMm?: number;
  /** Text size of the block (default 9pt). */
  fontSizePt?: number;
  /** Top padding of the signature block in mm (default: Tailwind pt-2 ≈ 2.1mm when omitted). */
  ptMm?: number;
  /** Shown between the two blocks (e.g. a page number). */
  middle?: React.ReactNode;
}

/** Estimates total vertical height (mm) of a rendered DocumentSignature block for pagination budgets. */
export function estimateSignatureBlockHeightMm(params: {
  gapMm: number;
  fontSizePt: number;
  ptMm?: number;
}): number {
  const lineMm = params.fontSizePt * 0.3528 * 1.375;
  const topMm = params.ptMm ?? 2.12;
  return topMm + 4 * lineMm + 0.5 + params.gapMm;
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
  stampScale?: number;
  stampOffsetXMm?: number;
  stampOffsetYMm?: number;
  isDirector?: boolean;
  hasBottomName?: boolean;
  /** Teacher's signing space: the signature is resizable / movable in the PDF preview. */
  isTeacher?: boolean;
  signatureScale?: number;
  signatureOffsetXMm?: number;
  signatureOffsetYMm?: number;
}> = ({
  gapMm,
  fontSizePt,
  stamp,
  signature,
  stampScale,
  stampOffsetXMm,
  stampOffsetYMm,
  isDirector = false,
  hasBottomName = false,
  isTeacher = false,
  signatureScale,
  signatureOffsetXMm,
  signatureOffsetYMm,
}) => {
  const signatureHeightMm = Math.max(8, gapMm * 0.9);
  const combined = Boolean(stamp && !signature);
  const aspectRatio = stamp && stamp.width > 0 && stamp.height > 0 ? stamp.width / stamp.height : 1;
  const box = computeDirectorStampBox({
    gapMm,
    fontSizePt,
    combined,
    hasBottomName,
    aspectRatio,
    scale: stampScale,
    offsetXMm: stampOffsetXMm,
    offsetYMm: stampOffsetYMm,
  });
  const sigAspect =
    signature && signature.width > 0 && signature.height > 0 ? signature.width / signature.height : 2;
  const sigBox = computeSignatureBox({
    gapMm,
    aspectRatio: sigAspect,
    scale: signatureScale,
    offsetXMm: signatureOffsetXMm,
    offsetYMm: signatureOffsetYMm,
  });

  return (
    <div
      className="relative"
      style={{ height: `${gapMm}mm` }}
      {...(isDirector
        ? {
            'data-director-seal-anchor': '',
            'data-gap-mm': String(gapMm),
            'data-font-pt': String(fontSizePt),
            'data-has-bottom-name': hasBottomName ? '1' : '0',
            'data-has-director-sig': signature ? '1' : '0',
            'data-has-stamp': stamp ? '1' : '0',
            'data-stamp-scale': String(clampStampScale(stampScale)),
            'data-stamp-offset-x': String(clampStampOffsetMm(stampOffsetXMm)),
            'data-stamp-offset-y': String(clampStampOffsetMm(stampOffsetYMm)),
          }
        : {})}
      {...(isTeacher
        ? {
            'data-teacher-sign-anchor': '',
            'data-gap-mm': String(gapMm),
            'data-font-pt': String(fontSizePt),
            'data-has-teacher-sig': signature ? '1' : '0',
            'data-teacher-scale': String(clampStampScale(signatureScale)),
            'data-teacher-offset-x': String(clampStampOffsetMm(signatureOffsetXMm)),
            'data-teacher-offset-y': String(clampStampOffsetMm(signatureOffsetYMm)),
          }
        : {})}
    >
      {stamp && (
        <img
          src={stamp.dataUrl}
          alt=""
          data-director-seal=""
          className="absolute max-w-none pointer-events-none"
          style={{
            height: `${box.heightMm}mm`,
            width: `${box.widthMm}mm`,
            objectFit: 'contain',
            left: box.offsetXMm !== 0 ? `calc(50% + ${box.offsetXMm}mm)` : '50%',
            transform: combined ? 'translateX(-40%)' : 'translateX(-50%)',
            top: `${box.topMm}mm`,
            opacity: STAMP_OPACITY,
          }}
        />
      )}
      {signature && isTeacher && (
        <img
          src={signature.dataUrl}
          alt=""
          data-teacher-signature=""
          className="absolute max-w-none pointer-events-none"
          style={{
            height: `${sigBox.heightMm}mm`,
            width: `${sigBox.widthMm}mm`,
            objectFit: 'contain',
            left: sigBox.offsetXMm !== 0 ? `calc(50% + ${sigBox.offsetXMm}mm)` : '50%',
            transform: 'translateX(-50%)',
            top: `${sigBox.topMm}mm`,
            opacity: 1,
          }}
        />
      )}
      {signature && !isTeacher && (
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
 * The approver block has no dates and no name; its first title is level with the teacher's title,
 * and `<SealSpace>` is always rendered under «នាយកសាលា» so the director has full signing clearance.
 */
export const DocumentSignature: React.FC<DocumentSignatureProps> = ({
  profile,
  signOptions,
  teacherTitle = TEACHER_TITLE,
  showTeacher = true,
  color = '#000000',
  gapMm = 20,
  fontSizePt = 9,
  ptMm,
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
  const stampScale = signOptions?.stampScale;
  const stampOffsetXMm = signOptions?.stampOffsetXMm;
  const stampOffsetYMm = signOptions?.stampOffsetYMm;
  const teacherSignatureScale = signOptions?.teacherSignatureScale;
  const teacherSignatureOffsetXMm = signOptions?.teacherSignatureOffsetXMm;
  const teacherSignatureOffsetYMm = signOptions?.teacherSignatureOffsetYMm;

  const lunarLine = formatDocumentLunarLine(
    signOptions?.lunarDate ?? (savedLunar?.value as string | undefined) ?? ''
  );
  const gregorianLine = formatDocumentGregorianDate(
    signOptions?.place ?? (savedPlace?.value as string | undefined) ?? '',
    signOptions?.gregorianDate ?? ''
  );

  const dateLines = (
    <>
      <div>{lunarLine}</div>
      <div>{gregorianLine}</div>
    </>
  );

  const topPadClass = ptMm === undefined ? 'pt-2' : '';
  const topPadStyle = ptMm === undefined ? {} : { paddingTop: `${ptMm}mm` };

  if (!showTeacher) {
    return (
      <div
        className={`flex justify-end pr-12 leading-snug ${topPadClass}`}
        style={{ color, fontSize: `${fontSizePt}pt`, ...topPadStyle }}
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
            stampScale={stampScale}
            stampOffsetXMm={stampOffsetXMm}
            stampOffsetYMm={stampOffsetYMm}
            isDirector
            hasBottomName
          />
          <div style={{ fontFamily: MOUL }}>{profile.directorName}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid items-start leading-snug ${topPadClass}`}
      style={{
        color,
        fontSize: `${fontSizePt}pt`,
        gridTemplateColumns: '1fr auto 1fr',
        ...topPadStyle,
      }}
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
        <SealSpace
          gapMm={gapMm}
          fontSizePt={fontSizePt}
          stamp={stamp}
          signature={directorSignature}
          stampScale={stampScale}
          stampOffsetXMm={stampOffsetXMm}
          stampOffsetYMm={stampOffsetYMm}
          isDirector
          hasBottomName={false}
        />
      </div>

      <div className="self-end text-center px-2">{middle}</div>

      <div className="text-center">
        {dateLines}
        <div className="mt-0.5" style={{ fontFamily: MOUL }}>
          {teacherTitle}
        </div>
        <SealSpace
          gapMm={gapMm}
          fontSizePt={fontSizePt}
          signature={teacherSignature}
          isTeacher
          signatureScale={teacherSignatureScale}
          signatureOffsetXMm={teacherSignatureOffsetXMm}
          signatureOffsetYMm={teacherSignatureOffsetYMm}
        />
        <div style={{ fontFamily: MOUL }}>{profile.teacherName}</div>
      </div>
    </div>
  );
};
