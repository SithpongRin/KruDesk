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

/**
 * Shared PDF export pipeline for Khmer documents:
 * React print-layout DOM nodes -> await document.fonts.ready -> html-to-image (3x PNG) -> pdf-lib A4 pages.
 * Never calls pdf-lib drawText with Khmer strings (rasterizes properly shaped Khmer DOM instead).
 */
export async function exportPrintNodesToPdf(
  pageElements: HTMLElement[],
  options: {
    fileName: string;
    orientation?: PageOrientation;
    pageSize?: PaperSize;
    pixelRatio?: number;
  }
): Promise<Uint8Array> {
  if (pageElements.length === 0) {
    throw new Error('គ្មានទំព័រសម្រាប់បង្កើត PDF ទេ');
  }

  await ensurePrintFontsReady();

  const [{ PDFDocument }, { toPng }] = await Promise.all([
    import('pdf-lib'),
    import('html-to-image'),
  ]);

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
  const pixelRatio = options.pixelRatio ?? 3;

  for (const el of pageElements) {
    const dataUrl = await toPng(el, {
      pixelRatio,
      backgroundColor: '#ffffff',
      skipAutoScale: true,
    });
    const pngBytes = dataUrlToUint8Array(dataUrl);
    const embeddedPng = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embeddedPng, {
      x: 0,
      y: 0,
      width: pageW,
      height: pageH,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  triggerBlobDownload(blob, options.fileName);
  return pdfBytes;
}
