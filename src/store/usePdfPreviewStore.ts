import { create } from 'zustand';

export interface PdfPreviewRequest {
  /** PNG data URLs of every page — the exact images the PDF will be built from. */
  pages: string[];
  fileName: string;
  orientation: 'portrait' | 'landscape';
}

interface PdfPreviewState {
  request: PdfPreviewRequest | null;
  resolve: ((download: boolean) => void) | null;
  /** Shows the preview; resolves true when the teacher presses «ទាញយក PDF», false on close. */
  open: (request: PdfPreviewRequest) => Promise<boolean>;
  close: (download: boolean) => void;
}

export const usePdfPreviewStore = create<PdfPreviewState>((set, get) => ({
  request: null,
  resolve: null,
  open: (request) =>
    new Promise<boolean>((resolve) => {
      // A preview still open (should not happen) is treated as closed without download.
      get().resolve?.(false);
      set({ request, resolve });
    }),
  close: (download) => {
    const { resolve } = get();
    set({ request: null, resolve: null });
    resolve?.(download);
  },
}));
