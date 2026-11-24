// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { db, getSetting, setSetting } from '../../db/database';

// 1×1 white PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const toPngMock = vi.fn(async (_el: HTMLElement, _opts?: { filter?: (n: Node) => boolean }) => PNG);
vi.mock('html-to-image', () => ({
  toPng: (el: HTMLElement, opts?: { filter?: (n: Node) => boolean }) => toPngMock(el, opts),
}));
const downloads: string[] = [];
vi.mock('../excelExport', () => ({
  triggerBlobDownload: (_blob: Blob, name: string) => downloads.push(name),
}));

import {
  computePageStampRectFrac,
  exportPrintNodesToPdf,
  getPageDimensionsPt,
  pageStampFracToPdfBox,
} from '../pdfExport';
import { usePdfPreviewStore, type PageSealAnchor } from '../../store/usePdfPreviewStore';
import { PdfPreviewModal } from '../../components/common/PdfPreviewModal';

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

describe('PDF preview («មើលមុន») & interactive resizable stamp', { timeout: 15000 }, () => {
  beforeEach(async () => {
    downloads.length = 0;
    toPngMock.mockClear();
    await db.settings.clear();
    usePdfPreviewStore.setState({ request: null, resolve: null });
  });
  afterEach(() => cleanup());

  it('shows the same page images the PDF is built from, then downloads on «ទាញយក PDF»', async () => {
    render(<PdfPreviewModal />);
    const done = exportPrintNodesToPdf(pages(), { fileName: 'a.pdf', orientation: 'portrait' });

    await waitFor(() => expect(screen.getByTestId('pdf-preview-pages')).toBeTruthy());
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

  it('computes matching overlay fractions and bottom-left PDF coordinates across A4/A3 portrait/landscape', () => {
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
    // Scaling zooms around the vertical center of the stamp
    expect(bigger.topFrac + bigger.heightFrac / 2).toBeCloseTo(base.topFrac + base.heightFrac / 2, 4);

    // Nudging moves by exact mm fractions
    const nudged = computePageStampRectFrac(
      anchor,
      { width: 300, height: 300 },
      { scale: 1, offsetXMm: 29.7, offsetYMm: -21 }
    );
    expect(nudged.leftFrac - base.leftFrac).toBeCloseTo(0.1, 4);
    expect(nudged.topFrac - base.topFrac).toBeCloseTo(-0.1, 4);

    // Bottom-left origin conversion for pdf-lib on A4 landscape & A3 portrait
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
      // Top edge in PDF (y + height) equals (1 - topFrac) * ph
      expect(pdfBox.y + pdfBox.height).toBeCloseTo((1 - bigger.topFrac) * ph, 3);
    }
  });

  it('lets the user resize and move the stamp directly on the document in preview, filters the DOM stamp, and persists scale', async () => {
    await setSetting('directorStamp', { dataUrl: PNG, width: 300, height: 300 });
    render(<PdfPreviewModal />);

    const pageEl = makeAnchoredPage();
    const done = exportPrintNodesToPdf([pageEl], { fileName: 'stamped.pdf', orientation: 'landscape' });

    await waitFor(() => expect(screen.getByTestId('pdf-stamp-box-0')).toBeTruthy());

    // html-to-image filter omits [data-director-seal] so the stamp is not baked twice
    const filterFn = toPngMock.mock.calls[0]?.[1]?.filter;
    expect(typeof filterFn).toBe('function');
    const sealImg = pageEl.querySelector('[data-director-seal]')!;
    expect(filterFn!(sealImg)).toBe(false);
    expect(filterFn!(pageEl)).toBe(true);

    // Drag corner handle to enlarge stamp directly on the document
    const handle = screen.getByTestId('pdf-stamp-handle-0-se');
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160, clientY: 160 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // Also test slider fine-tuning to 1.4x (140%)
    const slider = screen.getByTestId('pdf-stamp-scale-slider');
    fireEvent.change(slider, { target: { value: '1.4' } });
    expect(screen.getByTestId('pdf-stamp-scale-label').textContent).toContain('140%');

    fireEvent.click(screen.getByText('ទាញយក PDF'));
    const bytes = await done;
    expect(bytes).not.toBeNull();
    expect(downloads).toEqual(['stamped.pdf']);
    expect(await getSetting<number>('directorStampScale')).toBeCloseTo(1.4, 3);
  });
});
