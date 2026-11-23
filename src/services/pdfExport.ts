import { triggerBlobDownload } from './excelExport';

export type PageOrientation = 'landscape' | 'portrait';
export type PaperSize = 'A4' | 'A3';

/**
 * Waits for layout/paint before capturing DOM export nodes.
 * Falls back to setTimeout when the tab is hidden so exports never hang on requestAnimationFrame.
 */
export function nextPaint(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
    return new Promise((resolve) => setTimeout(resolve, 50));
  }
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

const A4_PORTRAIT_PT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE_PT: [number, number] = [841.89, 595.28];
const A3_PORTRAIT_PT: [number, number] = [841.89, 1190.55];
const A3_LANDSCAPE_PT: [number, number] = [1190.55, 841.89];

const PRINT_PAGE_STYLE_ID = 'krudesk-dynamic-print-page-style';

/**
 * Injects a temporary `@page { size: <A4|A3> <portrait|landscape>; margin: 0; }` rule
 * matching the active print sheet, invokes `window.print()`, and removes the style on `afterprint`.
 */
export function printWithPageSetup(
  pageSize: PaperSize = 'A4',
  orientation: PageOrientation = 'landscape'
): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = PRINT_PAGE_STYLE_ID;
  style.textContent = `@media print { @page { size: ${pageSize} ${orientation}; margin: 0; } }`;
  document.head.appendChild(style);

  const cleanup = () => {
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

/**
 * Ensures all bundled Khmer fonts (Battambang, Moul, Kantumruy Pro) are loaded
 * before rasterizing any DOM print pages.
 */
export async function ensurePrintFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.allSettled([
    document.fonts.load('normal 14px "Battambang"'),
    document.fonts.load('bold 14px "Battambang"'),
    document.fonts.load('normal 16px "Moul"'),
    document.fonts.load('normal 13px "Kantumruy Pro"'),
  ]);
  await document.fonts.ready;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface PdfExportOptions {
  fileName: string;
  orientation?: PageOrientation;
  pageSize?: PaperSize;
  pixelRatio?: number;
  /** Show «មើលមុន» before downloading (default true). */
  preview?: boolean;
}

/** Rasterizes each print page once (html-to-image, white background). */
export async function renderPrintNodesToPng(
  pageElements: HTMLElement[],
  pixelRatio = 3
): Promise<string[]> {
  if (pageElements.length === 0) {
    throw new Error('គ្មានទំព័រសម្រាប់បង្កើត PDF ទេ');
  }
  await ensurePrintFontsReady();
  const { toPng } = await import('html-to-image');
  const pages: string[] = [];
  for (const el of pageElements) {
    pages.push(
      await toPng(el, {
        pixelRatio,
        backgroundColor: '#ffffff',
        skipAutoScale: true,
      })
    );
  }
  return pages;
}

/** Builds the PDF from already-rendered page PNGs: one full-bleed image per A4/A3 page. */
export async function buildPdfFromPngs(
  pages: string[],
  options: Pick<PdfExportOptions, 'orientation' | 'pageSize'>
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const isA3 = options.pageSize === 'A3';
  const [pageW, pageH] =
    options.orientation === 'portrait'
      ? isA3
        ? A3_PORTRAIT_PT
        : A4_PORTRAIT_PT
      : isA3
        ? A3_LANDSCAPE_PT
        : A4_LANDSCAPE_PT;

  for (const dataUrl of pages) {
    const embeddedPng = await pdfDoc.embedPng(dataUrlToUint8Array(dataUrl));
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embeddedPng, { x: 0, y: 0, width: pageW, height: pageH });
  }
  return pdfDoc.save();
}

/**
 * Shared PDF export pipeline for Khmer documents:
 * React print-layout DOM nodes -> fonts ready -> html-to-image (3x PNG) -> «មើលមុន» of those
 * same PNGs -> pdf-lib A4 pages from the same PNGs. Preview and PDF are therefore identical.
 * Never calls pdf-lib drawText with Khmer strings (rasterizes properly shaped Khmer DOM instead).
 *
 * Returns the PDF bytes, or null when the teacher closed the preview without downloading.
 */
export async function exportPrintNodesToPdf(
  pageElements: HTMLElement[],
  options: PdfExportOptions
): Promise<Uint8Array | null> {
  const pages = await renderPrintNodesToPng(pageElements, options.pixelRatio ?? 3);

  if (options.preview !== false) {
    const { usePdfPreviewStore } = await import('../store/usePdfPreviewStore');
    const download = await usePdfPreviewStore.getState().open({
      pages,
      fileName: options.fileName,
      orientation: options.orientation ?? 'landscape',
    });
    if (!download) return null;
  }

  const pdfBytes = await buildPdfFromPngs(pages, options);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  triggerBlobDownload(blob, options.fileName);
  return pdfBytes;
}
