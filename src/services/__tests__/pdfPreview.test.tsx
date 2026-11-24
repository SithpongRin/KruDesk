// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { db, getSetting, setSetting } from '../../db/database';
import { usePrintLayoutStore } from '../../store/usePrintLayoutStore';

// 1×1 white PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const toPngMock = vi.fn(async (_el: HTMLElement, _opts?: { filter?: (n: Node) => boolean }) => PNG);
vi.mock('html-to-image', () => ({
  toPng: (el: HTMLElement, opts?: { filter?: (n: Node) => boolean }) => toPngMock(el, opts),
}));
// JSDOM has no layout, so the real fit measures scale 1; a test can force a scale here.
const fitOverride = vi.hoisted(() => ({ scale: null as number | null }));
vi.mock('../../print/fitOnePage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../print/fitOnePage')>();
  return {
    ...actual,
    fitPageToOnePage: (el: HTMLElement) => {
      if (fitOverride.scale === null) return actual.fitPageToOnePage(el);
      el.dataset.fitScale = String(fitOverride.scale);
      return { scale: fitOverride.scale };
    },
  };
});
const downloads: string[] = [];
vi.mock('../excelExport', () => ({
  triggerBlobDownload: (_blob: Blob, name: string) => downloads.push(name),
}));

import { PDFPage } from 'pdf-lib';
import {
  buildPdfFromPngs,
  computePageStampRectFrac,
  computePageTeacherSignRectFrac,
  exportPrintNodesToPdf,
  getPageDimensionsPt,
  pageStampFracToPdfBox,
} from '../pdfExport';
import {
  usePdfPreviewStore,
  type PageSealAnchor,
  type PageTeacherSignAnchor,
} from '../../store/usePdfPreviewStore';
import { PdfPreviewModal } from '../../components/common/PdfPreviewModal';
import { computeSignatureBox } from '../../utils/directorSeal';

type Rect = { left: number; top: number; width: number; height: number };
function mockRect(el: HTMLElement, r: Rect) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: r.left,
    y: r.top,
    left: r.left,
    top: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
    width: r.width,
    height: r.height,
    toJSON: () => ({}),
  });
}

/** A page with the director's space (stamp) on the left and the teacher's space on the right. */
function makeTeacherPage(opts: { withSig: boolean }): HTMLElement {
  const page = makeAnchoredPage();
  const anchor = document.createElement('div');
  anchor.setAttribute('data-teacher-sign-anchor', '');
  anchor.dataset.gapMm = '20';
  anchor.dataset.fontPt = '9';
  anchor.dataset.hasTeacherSig = opts.withSig ? '1' : '0';
  anchor.dataset.teacherScale = '1';
  anchor.dataset.teacherOffsetX = '0';
  anchor.dataset.teacherOffsetY = '0';
  mockRect(anchor, { left: 180, top: 170, width: 90, height: 20 });
  if (opts.withSig) {
    const sigImg = document.createElement('img');
    sigImg.setAttribute('data-teacher-signature', '');
    sigImg.src = PNG;
    anchor.appendChild(sigImg);
  }
  page.appendChild(anchor);
  return page;
}

const SIG = { dataUrl: PNG, width: 200, height: 100 };

const pages = () => [document.createElement('div'), document.createElement('div')];

function makeAnchoredPage(): HTMLElement {
  const page = document.createElement('div');
  vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 297,
    bottom: 210,
    width: 297,
    height: 210,
    toJSON: () => ({}),
  });
  const anchor = document.createElement('div');
  anchor.setAttribute('data-director-seal-anchor', '');
  anchor.dataset.gapMm = '20';
  anchor.dataset.fontPt = '9';
  anchor.dataset.hasBottomName = '0';
  anchor.dataset.hasDirectorSig = '0';
  anchor.dataset.hasStamp = '1';
  anchor.dataset.stampScale = '1';
  anchor.dataset.stampOffsetX = '0';
  anchor.dataset.stampOffsetY = '0';
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    x: 30,
    y: 170,
    left: 30,
    top: 170,
    right: 120,
    bottom: 190,
    width: 90,
    height: 20,
    toJSON: () => ({}),
  });
  const sealImg = document.createElement('img');
  sealImg.setAttribute('data-director-seal', '');
  sealImg.src = PNG;
  anchor.appendChild(sealImg);
  page.appendChild(anchor);
  return page;
}

const MockClassTableStage: React.FC = () => {
  const fitOnePage = usePrintLayoutStore((s) => s.fitOnePage);
  if (fitOnePage) {
    return (
      <div data-testid="mock-stage">
        <div data-print-page data-fit-scale="0.5">
          <div data-fit-body>All 60 rows on 1 page</div>
        </div>
      </div>
    );
  }
  return (
    <div data-testid="mock-stage">
      <div data-print-page data-can-fit-one-page="1">
        <div data-fit-body>Page 1</div>
      </div>
      <div data-print-page data-can-fit-one-page="1">
        <div data-fit-body>Page 2</div>
      </div>
    </div>
  );
};

describe('PDF preview («មើលមុន»), resizable stamp & Fit-to-1-Page (Optimize)', { timeout: 15000 }, () => {
  beforeEach(async () => {
    downloads.length = 0;
    toPngMock.mockClear();
    await db.settings.clear();
    usePrintLayoutStore.setState({ fitOnePage: false });
    usePdfPreviewStore.setState({ request: null, resolve: null });
  });
  afterEach(() => cleanup());

  it('shows the same page images the PDF is built from, then downloads on «ទាញយក PDF»', async () => {
    render(<PdfPreviewModal />);
    const done = exportPrintNodesToPdf(pages(), { fileName: 'a.pdf', orientation: 'portrait' });

    await waitFor(() => expect(screen.getByTestId('pdf-preview-pages')).toBeTruthy());
    expect(screen.queryByTestId('pdf-fit-one-page-toggle')).toBeNull();
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    expect(imgs).toHaveLength(2);
    expect(imgs.every((i) => i.src === PNG)).toBe(true);
    expect(downloads).toEqual([]);

    fireEvent.click(screen.getByText('ទាញយក PDF'));
    const bytes = await done;
    expect(bytes).not.toBeNull();
    expect(downloads).toEqual(['a.pdf']);
    expect(usePdfPreviewStore.getState().request).toBeNull();
  });

  it('closing the preview downloads nothing and returns null', async () => {
    render(<PdfPreviewModal />);
    const done = exportPrintNodesToPdf(pages(), { fileName: 'b.pdf', orientation: 'portrait' });
    await waitFor(() => expect(screen.getByText('បិទ')).toBeTruthy());

    fireEvent.click(screen.getByText('បិទ'));
    expect(await done).toBeNull();
    expect(downloads).toEqual([]);
  });

  it('preview: false downloads straight away', async () => {
    const bytes = await exportPrintNodesToPdf(pages(), { fileName: 'c.pdf', preview: false });
    expect(bytes).not.toBeNull();
    expect(downloads).toEqual(['c.pdf']);
  });

  it('computes matching overlay fractions (including fitScale) and bottom-left PDF coordinates across A4/A3', () => {
    const anchor: PageSealAnchor = {
      xFrac: 0.1,
      yFrac: 0.75,
      wFrac: 0.3,
      hFrac: 20 / 210,
      pageWidthMm: 297,
      pageHeightMm: 210,
      gapMm: 20,
      fontSizePt: 9,
      hasBottomName: false,
      hasDirectorSig: false,
    };
    const base = computePageStampRectFrac(anchor, { width: 300, height: 300 }, { scale: 1 });
    const bigger = computePageStampRectFrac(anchor, { width: 300, height: 300 }, { scale: 1.5 });
    expect(bigger.widthFrac).toBeCloseTo(base.widthFrac * 1.5, 4);
    expect(bigger.heightFrac).toBeCloseTo(base.heightFrac * 1.5, 4);
    expect(bigger.topFrac + bigger.heightFrac / 2).toBeCloseTo(base.topFrac + base.heightFrac / 2, 4);

    // fitScale shrinks the stamp box & top offset proportionally around the scaled anchor
    const fitted = computePageStampRectFrac(
      { ...anchor, fitScale: 0.65 },
      { width: 300, height: 300 },
      { scale: 1 }
    );
    expect(fitted.widthFrac).toBeCloseTo(base.widthFrac * 0.65, 4);
    expect(fitted.heightFrac).toBeCloseTo(base.heightFrac * 0.65, 4);

    // Nudging moves by exact mm fractions
    const nudged = computePageStampRectFrac(
      anchor,
      { width: 300, height: 300 },
      { scale: 1, offsetXMm: 29.7, offsetYMm: -21 }
    );
    expect(nudged.leftFrac - base.leftFrac).toBeCloseTo(0.1, 4);
    expect(nudged.topFrac - base.topFrac).toBeCloseTo(-0.1, 4);

    for (const [size, orient] of [
      ['A4', 'landscape'],
      ['A4', 'portrait'],
      ['A3', 'landscape'],
      ['A3', 'portrait'],
    ] as const) {
      const [pw, ph] = getPageDimensionsPt(size, orient);
      const pdfBox = pageStampFracToPdfBox(bigger, pw, ph);
      expect(pdfBox.x).toBeCloseTo(bigger.leftFrac * pw, 3);
      expect(pdfBox.width).toBeCloseTo(bigger.widthFrac * pw, 3);
      expect(pdfBox.height).toBeCloseTo(bigger.heightFrac * ph, 3);
      expect(pdfBox.y + pdfBox.height).toBeCloseTo((1 - bigger.topFrac) * ph, 3);
    }
  });

  it('lets the user resize and move the stamp directly on the document in preview, filters the DOM stamp, and persists scale', async () => {
    await setSetting('directorStamp', { dataUrl: PNG, width: 300, height: 300 });
    render(<PdfPreviewModal />);

    const pageEl = makeAnchoredPage();
    const done = exportPrintNodesToPdf([pageEl], { fileName: 'stamped.pdf', orientation: 'landscape' });

    await waitFor(() => expect(screen.getByTestId('pdf-stamp-box-0')).toBeTruthy());

    const filterFn = toPngMock.mock.calls[0]?.[1]?.filter;
    expect(typeof filterFn).toBe('function');
    const sealImg = pageEl.querySelector('[data-director-seal]')!;
    expect(filterFn!(sealImg)).toBe(false);
    expect(filterFn!(pageEl)).toBe(true);

    const handle = screen.getByTestId('pdf-stamp-handle-0-se');
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 160 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    const slider = screen.getByTestId('pdf-stamp-scale-slider');
    fireEvent.change(slider, { target: { value: '1.4' } });
    expect(screen.getByTestId('pdf-stamp-scale-label').textContent).toContain('140%');

    fireEvent.click(screen.getByText('ទាញយក PDF'));
    const bytes = await done;
    expect(bytes).not.toBeNull();
    expect(downloads).toEqual(['stamped.pdf']);
    expect(await getSetting<number>('directorStampScale')).toBeCloseTo(1.4, 3);
  });

  it('computes the teacher signature rect with 0.00 mm parity to the DOM box, including fitScale', () => {
    const anchor: PageTeacherSignAnchor = {
      xFrac: 0.6,
      yFrac: 0.8,
      wFrac: 0.3,
      hFrac: 20 / 210,
      pageWidthMm: 297,
      pageHeightMm: 210,
      gapMm: 20,
      fontSizePt: 9,
    };
    const params = { scale: 1.3, offsetXMm: 5, offsetYMm: -2 };
    for (const fit of [1, 0.65]) {
      const rect = computePageTeacherSignRectFrac({ ...anchor, fitScale: fit }, SIG, params);
      const box = computeSignatureBox({ gapMm: 20, aspectRatio: 2, ...params });
      const centreXMm = (anchor.xFrac + anchor.wFrac / 2) * 297 + box.offsetXMm * fit;
      expect(rect.widthFrac * 297).toBeCloseTo(box.widthMm * fit, 6);
      expect(rect.heightFrac * 210).toBeCloseTo(box.heightMm * fit, 6);
      expect(rect.leftFrac * 297).toBeCloseTo(centreXMm - (box.widthMm * fit) / 2, 6);
      expect(rect.topFrac * 210).toBeCloseTo(anchor.yFrac * 210 + box.topMm * fit, 6);
    }
  });

  it('embeds the teacher signature in pdf-lib at the preview rect, full opacity, next to the stamp', async () => {
    const drawSpy = vi.spyOn(PDFPage.prototype, 'drawImage');
    try {
      const sealAnchor: PageSealAnchor = {
        xFrac: 0.1,
        yFrac: 0.8,
        wFrac: 0.3,
        hFrac: 0.1,
        pageWidthMm: 297,
        pageHeightMm: 210,
        gapMm: 20,
        fontSizePt: 9,
        hasBottomName: false,
        hasDirectorSig: false,
        fitScale: 0.8,
      };
      const teacherAnchor: PageTeacherSignAnchor = {
        xFrac: 0.6,
        yFrac: 0.8,
        wFrac: 0.3,
        hFrac: 0.1,
        pageWidthMm: 297,
        pageHeightMm: 210,
        gapMm: 20,
        fontSizePt: 9,
        fitScale: 0.8,
      };
      const teacher = { enabled: true, signature: SIG, scale: 1.4, offsetXMm: 3, offsetYMm: 1 };
      await buildPdfFromPngs(
        [PNG],
        { orientation: 'landscape', pageSize: 'A4' },
        {
          anchors: [sealAnchor],
          stamp: { enabled: true, stamp: { dataUrl: PNG, width: 1, height: 1 }, scale: 1, offsetXMm: 0, offsetYMm: 0 },
        },
        { anchors: [teacherAnchor], signature: teacher }
      );
      // page image, stamp, teacher signature
      expect(drawSpy).toHaveBeenCalledTimes(3);
      const [pw, ph] = getPageDimensionsPt('A4', 'landscape');
      const expected = pageStampFracToPdfBox(
        computePageTeacherSignRectFrac(teacherAnchor, SIG, teacher),
        pw,
        ph
      );
      const opts = drawSpy.mock.calls[2][1]!;
      expect(opts.x).toBeCloseTo(expected.x, 6);
      expect(opts.y).toBeCloseTo(expected.y, 6);
      expect(opts.width).toBeCloseTo(expected.width, 6);
      expect(opts.height).toBeCloseTo(expected.height, 6);
      expect(opts.opacity).toBe(1);
      expect(drawSpy.mock.calls[1][1]!.opacity).toBeLessThan(1);

      // Disabled → not embedded.
      drawSpy.mockClear();
      await buildPdfFromPngs([PNG], { orientation: 'landscape' }, undefined, {
        anchors: [teacherAnchor],
        signature: { ...teacher, enabled: false },
      });
      expect(drawSpy).toHaveBeenCalledTimes(1);
    } finally {
      drawSpy.mockRestore();
    }
  });

  it('lets the user resize and move the teacher signature independently of the stamp, and persists it', async () => {
    await setSetting('directorStamp', { dataUrl: PNG, width: 300, height: 300 });
    await setSetting('teacherSignature', SIG);
    render(<PdfPreviewModal />);

    const pageEl = makeTeacherPage({ withSig: true });
    const done = exportPrintNodesToPdf([pageEl], { fileName: 'signed.pdf', orientation: 'landscape' });

    const box = await screen.findByTestId('pdf-teacher-box-0');
    expect(screen.getByTestId('pdf-stamp-box-0')).toBeTruthy();
    expect((screen.getByTestId('pdf-teacher-sign-toggle') as HTMLInputElement).checked).toBe(true);
    // overlay images are presentation-only: only the page image counts
    expect(screen.getAllByRole('img')).toHaveLength(1);

    // The DOM signature and stamp are left out of the page PNG (the overlay draws them).
    const filterFn = toPngMock.mock.calls[0]?.[1]?.filter;
    expect(filterFn!(pageEl.querySelector('[data-teacher-signature]')!)).toBe(false);
    expect(filterFn!(pageEl.querySelector('[data-director-seal]')!)).toBe(false);
    expect(filterFn!(pageEl)).toBe(true);

    // Corner resize (no layout box in JSDOM → horizontal drag fallback).
    const handle = screen.getByTestId('pdf-teacher-handle-0-se');
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 136, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(screen.getByTestId('pdf-teacher-scale-label').textContent).toContain('130%');
    expect(screen.getByTestId('pdf-stamp-scale-label').textContent).toContain('100%');

    fireEvent.click(screen.getByLabelText('ពង្រីកហត្ថលេខាគ្រូ'));
    expect(screen.getByTestId('pdf-teacher-scale-label').textContent).toContain('140%');
    fireEvent.change(screen.getByTestId('pdf-teacher-scale-slider'), { target: { value: '1.6' } });
    expect(screen.getByTestId('pdf-teacher-scale-label').textContent).toContain('160%');

    // Move: the modal page is 800 px wide in JSDOM fallback → 80 px = 29.7 mm.
    const beforeLeft = parseFloat(box.style.left);
    fireEvent.pointerDown(box, { pointerId: 3, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(box, { pointerId: 3, clientX: 90, clientY: 10 });
    fireEvent.pointerUp(box, { pointerId: 3 });
    expect(parseFloat(screen.getByTestId('pdf-teacher-box-0').style.left)).toBeCloseTo(
      beforeLeft + 10,
      4
    );

    fireEvent.click(screen.getByText('ទាញយក PDF'));
    expect(await done).not.toBeNull();
    expect(downloads).toEqual(['signed.pdf']);
    expect(await getSetting<number>('teacherSignatureScale')).toBeCloseTo(1.6, 3);
    expect(await getSetting<number>('teacherSignatureOffsetXMm')).toBeCloseTo(29.7, 2);
    expect(await getSetting<number>('teacherSignatureOffsetYMm')).toBeCloseTo(0, 3);
    expect(await getSetting<number>('directorStampScale')).toBeCloseTo(1, 3);
  });

  it('reset puts the teacher signature back, and without a stored signature offers an upload', async () => {
    await setSetting('teacherSignature', SIG);
    await setSetting('teacherSignatureScale', 1.8);
    render(<PdfPreviewModal />);
    const first = exportPrintNodesToPdf([makeTeacherPage({ withSig: true })], {
      fileName: 'reset.pdf',
      orientation: 'landscape',
    });
    await screen.findByTestId('pdf-teacher-box-0');
    expect(screen.getByTestId('pdf-teacher-scale-label').textContent).toContain('180%');
    fireEvent.click(screen.getByTestId('pdf-teacher-reset'));
    expect(screen.getByTestId('pdf-teacher-scale-label').textContent).toContain('100%');
    // Unticking removes the overlay; nothing is saved for a disabled signature.
    fireEvent.click(screen.getByTestId('pdf-teacher-sign-toggle'));
    expect(screen.queryByTestId('pdf-teacher-box-0')).toBeNull();
    fireEvent.click(screen.getByText('បិទ'));
    expect(await first).toBeNull();

    await db.settings.clear();
    const second = exportPrintNodesToPdf([makeTeacherPage({ withSig: false })], {
      fileName: 'nosig.pdf',
      orientation: 'landscape',
    });
    expect(await screen.findByText('បញ្ចូលហត្ថលេខាគ្រូ')).toBeTruthy();
    expect(screen.queryByTestId('pdf-teacher-box-0')).toBeNull();
    expect(screen.queryByTestId('pdf-teacher-sign-toggle')).toBeNull();
    fireEvent.click(screen.getByText('បិទ'));
    expect(await second).toBeNull();
  });

  it('keeps the teacher signature toggle and size across the Optimize toggle, drawn at fitScale', async () => {
    await setSetting('teacherSignature', SIG);
    // JSDOM has no layout: give every page / teacher space a size.
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const r = this.hasAttribute('data-teacher-sign-anchor')
          ? { left: 180, top: 170, width: 90, height: 20 }
          : { left: 0, top: 0, width: 297, height: 210 };
        return {
          x: r.left,
          y: r.top,
          ...r,
          right: r.left + r.width,
          bottom: r.top + r.height,
          toJSON: () => ({}),
        } as DOMRect;
      });
    const teacherSpace = (
      <div data-teacher-sign-anchor="" data-gap-mm="20" data-font-pt="9" data-has-teacher-sig="1">
        <img data-teacher-signature="" src={PNG} alt="" />
      </div>
    );
    const Stage: React.FC = () => {
      const fit = usePrintLayoutStore((s) => s.fitOnePage);
      return fit ? (
        <div>
          <div data-print-page data-fit-scale="0.5">
            <div data-fit-body>all rows</div>
            {teacherSpace}
          </div>
        </div>
      ) : (
        <div>
          <div data-print-page data-can-fit-one-page="1">
            <div data-fit-body>p1</div>
          </div>
          <div data-print-page data-can-fit-one-page="1">
            <div data-fit-body>p2</div>
            {teacherSpace}
          </div>
        </div>
      );
    };
    fitOverride.scale = 0.5;
    try {
      const { container } = render(
        <>
          <Stage />
          <PdfPreviewModal />
        </>
      );
      const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-print-page]'));
      const done = exportPrintNodesToPdf(nodes, { fileName: 'fit.pdf', orientation: 'portrait' });

      await screen.findByTestId('pdf-teacher-box-1');
      fireEvent.change(screen.getByTestId('pdf-teacher-scale-slider'), { target: { value: '1.2' } });
      const fullWidth = parseFloat(screen.getByTestId('pdf-teacher-box-1').style.width);

      fireEvent.click(screen.getByTestId('pdf-fit-one-page-toggle'));
      const fitted = await screen.findByTestId('pdf-teacher-box-0');
      expect(screen.getByTestId('pdf-teacher-scale-label').textContent).toContain('120%');
      expect((screen.getByTestId('pdf-teacher-sign-toggle') as HTMLInputElement).checked).toBe(true);
      // the fitted page draws the signature at fitScale 0.5
      expect(parseFloat(fitted.style.width)).toBeCloseTo(fullWidth * 0.5, 4);

      fireEvent.click(screen.getByText('ទាញយក PDF'));
      expect(await done).not.toBeNull();
      expect(await getSetting<number>('teacherSignatureScale')).toBeCloseTo(1.2, 3);
    } finally {
      fitOverride.scale = null;
      rectSpy.mockRestore();
    }
  });

  it('toggles «បង្រួមដាក់ក្នុង ១ ទំព័រ (Optimize)» live from 2 pages down to 1 page and resets store on close', async () => {
    const { container } = render(
      <>
        <MockClassTableStage />
        <PdfPreviewModal />
      </>
    );
    const initialNodes = Array.from(container.querySelectorAll<HTMLElement>('[data-print-page]'));
    expect(initialNodes).toHaveLength(2);

    const done = exportPrintNodesToPdf(initialNodes, {
      fileName: 'optimized.pdf',
      orientation: 'portrait',
    });

    const toggle = (await screen.findByTestId('pdf-fit-one-page-toggle')) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getAllByRole('img')).toHaveLength(2);

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1));
    expect(usePrintLayoutStore.getState().fitOnePage).toBe(true);
    expect(screen.getByTestId('pdf-fit-scale-badge')).toBeTruthy();

    fireEvent.click(screen.getByText('ទាញយក PDF'));
    const bytes = await done;
    expect(bytes).not.toBeNull();
    expect(downloads).toEqual(['optimized.pdf']);
    expect(usePrintLayoutStore.getState().fitOnePage).toBe(false);
  });
});
