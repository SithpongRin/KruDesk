import { create } from 'zustand';
import type { SealImage } from '../utils/directorSeal';

export interface PageSealAnchor {
  /** Anchor (SealSpace) box as fractions [0..1] of [data-print-page] width and height. */
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
  pageWidthMm: number;
  pageHeightMm: number;
  gapMm: number;
  fontSizePt: number;
  hasBottomName: boolean;
  hasDirectorSig: boolean;
  /** Proportional fit-to-1-page scale applied to [data-fit-body] on this page (default 1). */
  fitScale?: number;
}

/** Teacher's signing space (`[data-teacher-sign-anchor]`) on one page. */
export interface PageTeacherSignAnchor {
  /** Anchor (SealSpace) box as fractions [0..1] of [data-print-page] width and height. */
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
  pageWidthMm: number;
  pageHeightMm: number;
  gapMm: number;
  fontSizePt: number;
  /** Proportional fit-to-1-page scale applied to [data-fit-body] on this page (default 1). */
  fitScale?: number;
}

export interface PdfTeacherSignResult {
  enabled: boolean;
  signature?: SealImage;
  scale: number;
  offsetXMm: number;
  offsetYMm: number;
}

export interface PdfStampResult {
  enabled: boolean;
  stamp?: SealImage;
  scale: number;
  offsetXMm: number;
  offsetYMm: number;
}

export interface PdfPreviewOutcome {
  download: boolean;
  stamp?: PdfStampResult;
  teacherSignature?: PdfTeacherSignResult;
}

export interface PdfPreviewRequest {
  /** PNG data URLs of every page — the base images the PDF will be built from. */
  pages: string[];
  fileName: string;
  orientation: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'A3';
  /** Per-page director seal anchor (null on pages without a signature block). */
  sealAnchors?: Array<PageSealAnchor | null>;
  /** Initial stamp image from signOptions or Settings, if available. */
  initialStamp?: SealImage;
  /** True when the document already requested the director stamp (e.g. ticked in DocumentSignDialog). */
  initialStampEnabled?: boolean;
  initialStampScale?: number;
  initialStampOffsetXMm?: number;
  initialStampOffsetYMm?: number;
  /** Per-page teacher signature anchor (null on pages without a teacher signing space). */
  teacherAnchors?: Array<PageTeacherSignAnchor | null>;
  /** Initial teacher signature image from signOptions or Settings, if available. */
  initialTeacherSignature?: SealImage;
  /** True when the document already printed the teacher's signature (ticked in the sign dialog). */
  initialTeacherSignatureEnabled?: boolean;
  initialTeacherSignatureScale?: number;
  initialTeacherSignatureOffsetXMm?: number;
  initialTeacherSignatureOffsetYMm?: number;
  /** True when this class table spilled onto >1 page and can be optimized onto 1 page per sheet. */
  canFitOnePage?: boolean;
  /** Whether Fit-to-1-Page (Optimize) is currently active. */
  fitOnePage?: boolean;
  /** Smallest fit scale across the rendered pages when `fitOnePage` is active (1 = unscaled). */
  minFitScale?: number;
  /** Smallest effective printed font size (pt × fitScale) across the fitted page(s). */
  minPrintedFontPt?: number;
  /** Live toggle handler invoked from PdfPreviewModal to switch between normal and 1-page mode. */
  onToggleFitOnePage?: (nextFitOnePage: boolean) => Promise<void>;
}

interface PdfPreviewState {
  request: PdfPreviewRequest | null;
  resolve: ((outcome: PdfPreviewOutcome) => void) | null;
  /** Shows the preview; resolves with download decision and interactive stamp settings. */
  open: (request: PdfPreviewRequest) => Promise<PdfPreviewOutcome>;
  /** Updates the open preview request in place (e.g. after toggling Fit-to-1-Page). */
  updateRequest: (patch: Partial<PdfPreviewRequest>) => void;
  close: (
    download: boolean,
    stamp?: PdfStampResult,
    teacherSignature?: PdfTeacherSignResult
  ) => void;
}

export const usePdfPreviewStore = create<PdfPreviewState>((set, get) => ({
  request: null,
  resolve: null,
  open: (request) =>
    new Promise<PdfPreviewOutcome>((resolve) => {
      // A preview still open (should not happen) is treated as closed without download.
      get().resolve?.({ download: false });
      set({ request, resolve });
    }),
  updateRequest: (patch) => {
    const current = get().request;
    if (!current) return;
    set({ request: { ...current, ...patch } });
  },
  close: (download, stamp, teacherSignature) => {
    const { resolve } = get();
    set({ request: null, resolve: null });
    resolve?.({ download, stamp, teacherSignature });
  },
}));
