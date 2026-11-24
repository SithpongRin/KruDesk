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
}

interface PdfPreviewState {
  request: PdfPreviewRequest | null;
  resolve: ((outcome: PdfPreviewOutcome) => void) | null;
  /** Shows the preview; resolves with download decision and interactive stamp settings. */
  open: (request: PdfPreviewRequest) => Promise<PdfPreviewOutcome>;
  close: (download: boolean, stamp?: PdfStampResult) => void;
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
  close: (download, stamp) => {
    const { resolve } = get();
    set({ request: null, resolve: null });
    resolve?.({ download, stamp });
  },
}));
