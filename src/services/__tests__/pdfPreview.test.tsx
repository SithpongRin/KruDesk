// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// 1×1 white PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

vi.mock('html-to-image', () => ({ toPng: vi.fn(async () => PNG) }));
const downloads: string[] = [];
vi.mock('../excelExport', () => ({
  triggerBlobDownload: (_blob: Blob, name: string) => downloads.push(name),
}));

import { exportPrintNodesToPdf } from '../pdfExport';
import { usePdfPreviewStore } from '../../store/usePdfPreviewStore';
import { PdfPreviewModal } from '../../components/common/PdfPreviewModal';

const pages = () => [document.createElement('div'), document.createElement('div')];

describe('PDF preview («មើលមុន»)', () => {
  beforeEach(() => {
    downloads.length = 0;
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
});
