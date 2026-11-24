import { getSetting, setSetting } from '../db/database';
import type {
  PageSealAnchor,
  PageTeacherSignAnchor,
  PdfStampResult,
  PdfTeacherSignResult,
} from '../store/usePdfPreviewStore';
import { usePrintLayoutStore } from '../store/usePrintLayoutStore';
import {
  DEFAULT_STAMP_SCALE,
  STAMP_OPACITY,
  clampStampOffsetMm,
  clampStampScale,
  computeDirectorStampBox,
  computeSignatureBox,
  isSealImage,
  type SealImage,
} from '../utils/directorSeal';
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

export function getPageDimensionsMm(
  pageSize: PaperSize = 'A4',
  orientation: PageOrientation = 'landscape'
): [number, number] {
  if (pageSize === 'A3') {
    return orientation === 'portrait' ? [297, 420] : [420, 297];
  }
  return orientation === 'portrait' ? [210, 297] : [297, 210];
}

export function getPageDimensionsPt(
  pageSize: PaperSize = 'A4',
  orientation: PageOrientation = 'landscape'
): [number, number] {
  const isA3 = pageSize === 'A3';
  return orientation === 'portrait'
    ? isA3
      ? A3_PORTRAIT_PT
      : A4_PORTRAIT_PT
    : isA3
      ? A3_LANDSCAPE_PT
      : A4_LANDSCAPE_PT;
}

export interface PageStampRectFrac {
  leftFrac: number;
  topFrac: number;
  widthFrac: number;
  heightFrac: number;
}

/**
 * Computes the stamp's rectangle as fractions [0..1] of the full page width & height.
 * Accounts for `anchor.fitScale` when a page was proportionally scaled via Fit-to-1-Page,
 * keeping 0.00 mm parity between DOM, PdfPreviewModal CSS %, and pdf-lib coordinates.
 */
export function computePageStampRectFrac(
  anchor: PageSealAnchor,
  stamp: Pick<SealImage, 'width' | 'height'>,
  params: { scale?: number; offsetXMm?: number; offsetYMm?: number }
): PageStampRectFrac {
  const aspectRatio = stamp.width > 0 && stamp.height > 0 ? stamp.width / stamp.height : 1;
  const fitScale =
    typeof anchor.fitScale === 'number' && Number.isFinite(anchor.fitScale) && anchor.fitScale > 0
      ? anchor.fitScale
      : 1;
  const box = computeDirectorStampBox({
    gapMm: anchor.gapMm,
    fontSizePt: anchor.fontSizePt,
    combined: !anchor.hasDirectorSig,
    hasBottomName: anchor.hasBottomName,
    aspectRatio,
    scale: params.scale,
    offsetXMm: params.offsetXMm,
    offsetYMm: params.offsetYMm,
  });
  const widthMm = box.widthMm * fitScale;
  const heightMm = box.heightMm * fitScale;
  const topMm = box.topMm * fitScale;
  const offsetXMm = box.offsetXMm * fitScale;

  const anchorCenterXMm = (anchor.xFrac + anchor.wFrac * 0.5) * anchor.pageWidthMm + offsetXMm;
  const stampLeftMm = anchorCenterXMm - box.anchorXFraction * widthMm;
  const stampTopMm = anchor.yFrac * anchor.pageHeightMm + topMm;
  return {
    leftFrac: stampLeftMm / anchor.pageWidthMm,
    topFrac: stampTopMm / anchor.pageHeightMm,
    widthFrac: widthMm / anchor.pageWidthMm,
    heightFrac: heightMm / anchor.pageHeightMm,
  };
}

/**
 * Computes the teacher signature's rectangle as fractions [0..1] of the full page, from the
 * same `computeSignatureBox` the DOM uses, scaled by `anchor.fitScale` on Fit-to-1-Page pages.
 */
export function computePageTeacherSignRectFrac(
  anchor: PageTeacherSignAnchor,
  signature: Pick<SealImage, 'width' | 'height'>,
  params: { scale?: number; offsetXMm?: number; offsetYMm?: number }
): PageStampRectFrac {
  const aspectRatio =
    signature.width > 0 && signature.height > 0 ? signature.width / signature.height : 2;
  const fitScale =
    typeof anchor.fitScale === 'number' && Number.isFinite(anchor.fitScale) && anchor.fitScale > 0
      ? anchor.fitScale
      : 1;
  const box = computeSignatureBox({
    gapMm: anchor.gapMm,
    aspectRatio,
    scale: params.scale,
    offsetXMm: params.offsetXMm,
    offsetYMm: params.offsetYMm,
  });
  const widthMm = box.widthMm * fitScale;
  const heightMm = box.heightMm * fitScale;
  const topMm = box.topMm * fitScale;
  const offsetXMm = box.offsetXMm * fitScale;

  const anchorCenterXMm = (anchor.xFrac + anchor.wFrac * 0.5) * anchor.pageWidthMm + offsetXMm;
  const leftMm = anchorCenterXMm - box.anchorXFraction * widthMm;
  const sigTopMm = anchor.yFrac * anchor.pageHeightMm + topMm;
  return {
    leftFrac: leftMm / anchor.pageWidthMm,
    topFrac: sigTopMm / anchor.pageHeightMm,
    widthFrac: widthMm / anchor.pageWidthMm,
    heightFrac: heightMm / anchor.pageHeightMm,
  };
}

/** Converts a top-left page-fraction rect into pdf-lib bottom-left origin points. */
export function pageStampFracToPdfBox(
  rect: PageStampRectFrac,
  pageWidthPt: number,
  pageHeightPt: number
): { x: number; y: number; width: number; height: number } {
  const width = rect.widthFrac * pageWidthPt;
  const height = rect.heightFrac * pageHeightPt;
  const x = rect.leftFrac * pageWidthPt;
  const y = pageHeightPt - (rect.topFrac + rect.heightFrac) * pageHeightPt;
  return { x, y, width, height };
}

interface CapturedSealMetadata {
  anchors: Array<PageSealAnchor | null>;
  domStamp?: SealImage;
  domHasStamp: boolean;
  domScale?: number;
  domOffsetXMm?: number;
  domOffsetYMm?: number;
  teacherAnchors: Array<PageTeacherSignAnchor | null>;
  domTeacherSignature?: SealImage;
  domHasTeacherSig: boolean;
  domTeacherScale?: number;
  domTeacherOffsetXMm?: number;
  domTeacherOffsetYMm?: number;
}

function readFitScale(pageEl: HTMLElement): number {
  const raw = Number(pageEl.dataset.fitScale);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function captureSealMetadataFromDom(
  pageElements: HTMLElement[],
  pageWidthMm: number,
  pageHeightMm: number
): CapturedSealMetadata {
  let domStamp: SealImage | undefined;
  let domHasStamp = false;
  let domScale: number | undefined;
  let domOffsetXMm: number | undefined;
  let domOffsetYMm: number | undefined;

  const anchors = pageElements.map((pageEl): PageSealAnchor | null => {
    const anchorEl = pageEl.querySelector<HTMLElement>('[data-director-seal-anchor]');
    if (!anchorEl) return null;

    if (anchorEl.dataset.hasStamp === '1') {
      domHasStamp = true;
    }
    const parsedScale = Number(anchorEl.dataset.stampScale);
    if (Number.isFinite(parsedScale) && domScale === undefined) {
      domScale = parsedScale;
    }
    const parsedOx = Number(anchorEl.dataset.stampOffsetX);
    if (Number.isFinite(parsedOx) && domOffsetXMm === undefined) {
      domOffsetXMm = parsedOx;
    }
    const parsedOy = Number(anchorEl.dataset.stampOffsetY);
    if (Number.isFinite(parsedOy) && domOffsetYMm === undefined) {
      domOffsetYMm = parsedOy;
    }

    const sealImg = anchorEl.querySelector<HTMLImageElement>('[data-director-seal]');
    if (sealImg && !domStamp && sealImg.src.startsWith('data:image/')) {
      domStamp = {
        dataUrl: sealImg.src,
        width: sealImg.naturalWidth || parseFloat(sealImg.style.width) || 300,
        height: sealImg.naturalHeight || parseFloat(sealImg.style.height) || 300,
      };
    }

    const pr = pageEl.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    if (pr.width <= 0 || pr.height <= 0) {
      return null;
    }

    const fitScale = readFitScale(pageEl);

    return {
      xFrac: (ar.left - pr.left) / pr.width,
      yFrac: (ar.top - pr.top) / pr.height,
      wFrac: ar.width / pr.width,
      hFrac: ar.height / pr.height,
      pageWidthMm,
      pageHeightMm,
      gapMm: Number(anchorEl.dataset.gapMm) || 20,
      fontSizePt: Number(anchorEl.dataset.fontPt) || 9,
      hasBottomName: anchorEl.dataset.hasBottomName === '1',
      hasDirectorSig: anchorEl.dataset.hasDirectorSig === '1',
      fitScale,
    };
  });

  let domTeacherSignature: SealImage | undefined;
  let domHasTeacherSig = false;
  let domTeacherScale: number | undefined;
  let domTeacherOffsetXMm: number | undefined;
  let domTeacherOffsetYMm: number | undefined;

  const teacherAnchors = pageElements.map((pageEl): PageTeacherSignAnchor | null => {
    const anchorEl = pageEl.querySelector<HTMLElement>('[data-teacher-sign-anchor]');
    if (!anchorEl) return null;

    if (anchorEl.dataset.hasTeacherSig === '1') {
      domHasTeacherSig = true;
    }
    const parsedScale = Number(anchorEl.dataset.teacherScale);
    if (Number.isFinite(parsedScale) && domTeacherScale === undefined) {
      domTeacherScale = parsedScale;
    }
    const parsedOx = Number(anchorEl.dataset.teacherOffsetX);
    if (Number.isFinite(parsedOx) && domTeacherOffsetXMm === undefined) {
      domTeacherOffsetXMm = parsedOx;
    }
    const parsedOy = Number(anchorEl.dataset.teacherOffsetY);
    if (Number.isFinite(parsedOy) && domTeacherOffsetYMm === undefined) {
      domTeacherOffsetYMm = parsedOy;
    }

    const sigImg = anchorEl.querySelector<HTMLImageElement>('[data-teacher-signature]');
    if (sigImg && !domTeacherSignature && sigImg.src.startsWith('data:image/')) {
      domTeacherSignature = {
        dataUrl: sigImg.src,
        width: sigImg.naturalWidth || parseFloat(sigImg.style.width) || 400,
        height: sigImg.naturalHeight || parseFloat(sigImg.style.height) || 200,
      };
    }

    const pr = pageEl.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    if (pr.width <= 0 || pr.height <= 0) {
      return null;
    }

    return {
      xFrac: (ar.left - pr.left) / pr.width,
      yFrac: (ar.top - pr.top) / pr.height,
      wFrac: ar.width / pr.width,
      hFrac: ar.height / pr.height,
      pageWidthMm,
      pageHeightMm,
      gapMm: Number(anchorEl.dataset.gapMm) || 20,
      fontSizePt: Number(anchorEl.dataset.fontPt) || 9,
      fitScale: readFitScale(pageEl),
    };
  });

  return {
    anchors,
    domStamp,
    domHasStamp,
    domScale,
    domOffsetXMm,
    domOffsetYMm,
    teacherAnchors,
    domTeacherSignature,
    domHasTeacherSig,
    domTeacherScale,
    domTeacherOffsetXMm,
    domTeacherOffsetYMm,
  };
}

/**
 * Finds the mounted container element holding the current sheet's `[data-print-page]` nodes,
 * so toggling `usePrintLayoutStore.fitOnePage` can re-query the re-rendered page nodes cleanly.
 */
function findPrintStageContainer(pageElements: HTMLElement[]): HTMLElement | null {
  let cur: HTMLElement | null = pageElements[0]?.parentElement ?? null;
  if (!cur) return null;
  while (
    cur.parentElement &&
    cur.parentElement !== document.body &&
    cur.parentElement.querySelectorAll('[data-print-page]').length === pageElements.length
  ) {
    cur = cur.parentElement;
  }
  return cur;
}

function detectCanFitOnePage(pageElements: HTMLElement[], stageRoot: HTMLElement | null): boolean {
  if (!stageRoot || pageElements.length === 0) return false;
  if (pageElements.some((el) => el.dataset.canFitOnePage === '1')) {
    return true;
  }
  const hasExplicitFlag = pageElements.some((el) => el.dataset.canFitOnePage !== undefined);
  if (hasExplicitFlag) return false;
  return pageElements.length > 1 && pageElements.some((el) => el.querySelector('[data-fit-body]') !== null);
}

function measureMinPrintedFontPt(pageElements: HTMLElement[]): number | undefined {
  let minPt = Infinity;
  for (const pageEl of pageElements) {
    const rawScale = Number(pageEl.dataset.fitScale);
    const fitScale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
    const cells = pageEl.querySelectorAll<HTMLElement>('td, th');
    for (const cell of Array.from(cells)) {
      if (!(cell.textContent || '').trim()) continue;
      const target = cell.querySelector<HTMLElement>('span') ?? cell;
      const px = parseFloat(getComputedStyle(target).fontSize);
      if (Number.isFinite(px) && px > 0) {
        const pt = px * 0.75 * fitScale;
        if (pt < minPt) minPt = pt;
      }
    }
  }
  return Number.isFinite(minPt) ? Math.round(minPt * 10) / 10 : undefined;
}

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
  pixelRatio = 3,
  omitDirectorSeal = false,
  omitTeacherSignature = false
): Promise<string[]> {
  if (pageElements.length === 0) {
    throw new Error('គ្មានទំព័រសម្រាប់បង្កើត PDF ទេ');
  }
  await ensurePrintFontsReady();
  const { toPng } = await import('html-to-image');
  // The interactive preview draws these on top of the page instead (and pdf-lib embeds them).
  const filter =
    omitDirectorSeal || omitTeacherSignature
      ? (node: HTMLElement | Node) =>
          !(
            node instanceof HTMLElement &&
            ((omitDirectorSeal && node.hasAttribute('data-director-seal')) ||
              (omitTeacherSignature && node.hasAttribute('data-teacher-signature')))
          )
      : undefined;
  const pages: string[] = [];
  for (const el of pageElements) {
    pages.push(
      await toPng(el, {
        pixelRatio,
        backgroundColor: '#ffffff',
        skipAutoScale: true,
        ...(filter ? { filter } : {}),
      })
    );
  }
  return pages;
}

async function embedSealImage(
  pdfDoc: import('pdf-lib').PDFDocument,
  image: SealImage
): Promise<import('pdf-lib').PDFImage> {
  return /^data:image\/jpe?g/i.test(image.dataUrl)
    ? pdfDoc.embedJpg(dataUrlToUint8Array(image.dataUrl))
    : pdfDoc.embedPng(dataUrlToUint8Array(image.dataUrl));
}

/**
 * Builds the PDF from already-rendered page PNGs, optionally embedding the interactive director
 * stamp and the teacher's signature.
 */
export async function buildPdfFromPngs(
  pages: string[],
  options: Pick<PdfExportOptions, 'orientation' | 'pageSize'>,
  stampOverlay?: {
    anchors: Array<PageSealAnchor | null>;
    stamp: PdfStampResult;
  },
  teacherOverlay?: {
    anchors: Array<PageTeacherSignAnchor | null>;
    signature: PdfTeacherSignResult;
  }
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const [pageW, pageH] = getPageDimensionsPt(options.pageSize ?? 'A4', options.orientation ?? 'landscape');

  const activeStamp =
    stampOverlay && stampOverlay.stamp.enabled && stampOverlay.stamp.stamp
      ? stampOverlay.stamp
      : null;
  const embeddedStamp =
    activeStamp && activeStamp.stamp ? await embedSealImage(pdfDoc, activeStamp.stamp) : null;
  const activeTeacher =
    teacherOverlay && teacherOverlay.signature.enabled && teacherOverlay.signature.signature
      ? teacherOverlay.signature
      : null;
  const embeddedTeacher =
    activeTeacher && activeTeacher.signature
      ? await embedSealImage(pdfDoc, activeTeacher.signature)
      : null;

  for (let idx = 0; idx < pages.length; idx++) {
    const embeddedPng = await pdfDoc.embedPng(dataUrlToUint8Array(pages[idx]));
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embeddedPng, { x: 0, y: 0, width: pageW, height: pageH });

    const anchor = stampOverlay?.anchors[idx] ?? null;
    if (embeddedStamp && activeStamp?.stamp && anchor) {
      const frac = computePageStampRectFrac(anchor, activeStamp.stamp, {
        scale: activeStamp.scale,
        offsetXMm: activeStamp.offsetXMm,
        offsetYMm: activeStamp.offsetYMm,
      });
      const box = pageStampFracToPdfBox(frac, pageW, pageH);
      page.drawImage(embeddedStamp, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        opacity: STAMP_OPACITY,
      });
    }

    const teacherAnchor = teacherOverlay?.anchors[idx] ?? null;
    if (embeddedTeacher && activeTeacher?.signature && teacherAnchor) {
      const frac = computePageTeacherSignRectFrac(teacherAnchor, activeTeacher.signature, {
        scale: activeTeacher.scale,
        offsetXMm: activeTeacher.offsetXMm,
        offsetYMm: activeTeacher.offsetYMm,
      });
      const box = pageStampFracToPdfBox(frac, pageW, pageH);
      // Crisp pen ink at full opacity (only the stamp uses STAMP_OPACITY).
      page.drawImage(embeddedTeacher, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        opacity: 1,
      });
    }
  }
  return pdfDoc.save();
}

/**
 * Shared PDF export pipeline for Khmer documents:
 * React print-layout DOM nodes -> fonts ready -> html-to-image (3x PNG) -> «មើលមុន» (with live
 * Fit-to-1-Page Optimize toggle & resizable/draggable director stamp) -> pdf-lib pages.
 *
 * Returns the PDF bytes, or null when the teacher closed the preview without downloading.
 */
export async function exportPrintNodesToPdf(
  pageElements: HTMLElement[],
  options: PdfExportOptions
): Promise<Uint8Array | null> {
  const orientation = options.orientation ?? 'landscape';
  const pageSize = options.pageSize ?? 'A4';
  const basePixelRatio = options.pixelRatio ?? 3;
  const usePreview = options.preview !== false;
  const [pageWidthMm, pageHeightMm] = getPageDimensionsMm(pageSize, orientation);

  // Always start in normal multi-page mode unless explicitly set otherwise.
  usePrintLayoutStore.getState().setFitOnePage(false);

  try {
    await ensurePrintFontsReady();
    const stageRoot = usePreview ? findPrintStageContainer(pageElements) : null;
    const canFitOnePage = usePreview && detectCanFitOnePage(pageElements, stageRoot);

    let activeCaptured = usePreview
      ? captureSealMetadataFromDom(pageElements, pageWidthMm, pageHeightMm)
      : null;
    const hasInteractiveAnchors = (cap: CapturedSealMetadata | null) =>
      Boolean(cap && cap.anchors.some((a) => a !== null));

    const hasTeacherAnchors = (cap: CapturedSealMetadata | null) =>
      Boolean(cap && cap.teacherAnchors.some((a) => a !== null));

    let activePages = await renderPrintNodesToPng(
      pageElements,
      basePixelRatio,
      usePreview && hasInteractiveAnchors(activeCaptured),
      usePreview && hasTeacherAnchors(activeCaptured)
    );

    let stampOutcome: PdfStampResult | undefined;
    let teacherOutcome: PdfTeacherSignResult | undefined;

    if (usePreview) {
      const [
        savedStampRaw,
        savedScale,
        savedOffsetX,
        savedOffsetY,
        savedTeacherRaw,
        savedTeacherScale,
        savedTeacherOffsetX,
        savedTeacherOffsetY,
      ] = await Promise.all([
        getSetting<unknown>('directorStamp').catch(() => undefined),
        getSetting<number>('directorStampScale').catch(() => undefined),
        getSetting<number>('directorStampOffsetXMm').catch(() => undefined),
        getSetting<number>('directorStampOffsetYMm').catch(() => undefined),
        getSetting<unknown>('teacherSignature').catch(() => undefined),
        getSetting<number>('teacherSignatureScale').catch(() => undefined),
        getSetting<number>('teacherSignatureOffsetXMm').catch(() => undefined),
        getSetting<number>('teacherSignatureOffsetYMm').catch(() => undefined),
      ]);
      const savedStamp = isSealImage(savedStampRaw) ? savedStampRaw : undefined;
      const initialStamp = savedStamp ?? activeCaptured?.domStamp;
      const initialScale = clampStampScale(savedScale ?? activeCaptured?.domScale ?? DEFAULT_STAMP_SCALE);
      const initialOffsetXMm = clampStampOffsetMm(savedOffsetX ?? activeCaptured?.domOffsetXMm ?? 0);
      const initialOffsetYMm = clampStampOffsetMm(savedOffsetY ?? activeCaptured?.domOffsetYMm ?? 0);
      const savedTeacher = isSealImage(savedTeacherRaw) ? savedTeacherRaw : undefined;
      const initialTeacher = savedTeacher ?? activeCaptured?.domTeacherSignature;
      const initialTeacherScale = clampStampScale(
        savedTeacherScale ?? activeCaptured?.domTeacherScale ?? DEFAULT_STAMP_SCALE
      );
      const initialTeacherOffsetXMm = clampStampOffsetMm(
        savedTeacherOffsetX ?? activeCaptured?.domTeacherOffsetXMm ?? 0
      );
      const initialTeacherOffsetYMm = clampStampOffsetMm(
        savedTeacherOffsetY ?? activeCaptured?.domTeacherOffsetYMm ?? 0
      );

      const { usePdfPreviewStore } = await import('../store/usePdfPreviewStore');

      const handleToggleFitOnePage = canFitOnePage
        ? async (nextFit: boolean) => {
            const { fitPageToOnePage, resetPageFit } = await import('../print/fitOnePage');
            if (!nextFit && stageRoot) {
              for (const existing of Array.from(
                stageRoot.querySelectorAll<HTMLElement>('[data-print-page]')
              )) {
                resetPageFit(existing);
              }
            }

            usePrintLayoutStore.getState().setFitOnePage(nextFit);
            await new Promise((r) => setTimeout(r, 40));
            await nextPaint();
            await nextPaint();
            await ensurePrintFontsReady();

            const nextNodes = stageRoot
              ? Array.from(stageRoot.querySelectorAll<HTMLElement>('[data-print-page]'))
              : pageElements;
            if (nextNodes.length === 0) return;

            let minFitScale = 1;
            if (nextFit) {
              for (const node of nextNodes) {
                const { scale } = fitPageToOnePage(node);
                if (scale < minFitScale) minFitScale = scale;
              }
            } else {
              for (const node of nextNodes) {
                resetPageFit(node);
              }
            }

            const minPrintedFontPt = nextFit ? measureMinPrintedFontPt(nextNodes) : undefined;
            const nextCaptured = captureSealMetadataFromDom(nextNodes, pageWidthMm, pageHeightMm);
            // Boost raster DPI slightly when scaled down so small Khmer subscripts stay crisp.
            const effectiveRatio =
              nextFit && minFitScale < 0.85
                ? Math.min(4, Math.round((basePixelRatio / Math.max(0.65, minFitScale)) * 10) / 10)
                : basePixelRatio;
            const nextPages = await renderPrintNodesToPng(
              nextNodes,
              effectiveRatio,
              hasInteractiveAnchors(nextCaptured),
              hasTeacherAnchors(nextCaptured)
            );

            activeCaptured = nextCaptured;
            activePages = nextPages;
            usePdfPreviewStore.getState().updateRequest({
              pages: nextPages,
              sealAnchors: nextCaptured.anchors,
              teacherAnchors: nextCaptured.teacherAnchors,
              fitOnePage: nextFit,
              minFitScale,
              minPrintedFontPt,
            });
          }
        : undefined;

      const outcome = await usePdfPreviewStore.getState().open({
        pages: activePages,
        fileName: options.fileName,
        orientation,
        pageSize,
        sealAnchors: activeCaptured?.anchors,
        initialStamp,
        initialStampEnabled: Boolean(activeCaptured?.domHasStamp && initialStamp),
        initialStampScale: initialScale,
        initialStampOffsetXMm: initialOffsetXMm,
        initialStampOffsetYMm: initialOffsetYMm,
        teacherAnchors: activeCaptured?.teacherAnchors,
        initialTeacherSignature: initialTeacher,
        initialTeacherSignatureEnabled: Boolean(activeCaptured?.domHasTeacherSig && initialTeacher),
        initialTeacherSignatureScale: initialTeacherScale,
        initialTeacherSignatureOffsetXMm: initialTeacherOffsetXMm,
        initialTeacherSignatureOffsetYMm: initialTeacherOffsetYMm,
        canFitOnePage,
        fitOnePage: false,
        minFitScale: 1,
        onToggleFitOnePage: handleToggleFitOnePage,
      });
      if (!outcome.download) return null;
      stampOutcome = outcome.stamp;
      teacherOutcome = outcome.teacherSignature;

      if (stampOutcome?.enabled) {
        await Promise.all([
          setSetting('directorStampScale', clampStampScale(stampOutcome.scale)).catch(() => {}),
          setSetting('directorStampOffsetXMm', clampStampOffsetMm(stampOutcome.offsetXMm)).catch(
            () => {}
          ),
          setSetting('directorStampOffsetYMm', clampStampOffsetMm(stampOutcome.offsetYMm)).catch(
            () => {}
          ),
        ]);
      }
      if (teacherOutcome?.enabled) {
        await Promise.all([
          setSetting('teacherSignatureScale', clampStampScale(teacherOutcome.scale)).catch(() => {}),
          setSetting('teacherSignatureOffsetXMm', clampStampOffsetMm(teacherOutcome.offsetXMm)).catch(
            () => {}
          ),
          setSetting('teacherSignatureOffsetYMm', clampStampOffsetMm(teacherOutcome.offsetYMm)).catch(
            () => {}
          ),
        ]);
      }
    }

    const pdfBytes = await buildPdfFromPngs(
      activePages,
      options,
      activeCaptured && stampOutcome
        ? { anchors: activeCaptured.anchors, stamp: stampOutcome }
        : undefined,
      activeCaptured && teacherOutcome
        ? { anchors: activeCaptured.teacherAnchors, signature: teacherOutcome }
        : undefined
    );
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    triggerBlobDownload(blob, options.fileName);
    return pdfBytes;
  } finally {
    if (usePreview) {
      const stageRoot = findPrintStageContainer(pageElements);
      if (stageRoot) {
        const { resetPageFit } = await import('../print/fitOnePage');
        for (const node of Array.from(stageRoot.querySelectorAll<HTMLElement>('[data-print-page]'))) {
          resetPageFit(node);
        }
      }
    }
    usePrintLayoutStore.getState().setFitOnePage(false);
  }
}
