import { describe, it, expect } from 'vitest';
import { computeFitTextLayout, estimateWrappedLines, paginateByRowHeight } from '../FitText';

describe('computeFitTextLayout', () => {
  it('keeps basePt and nowrap when text fits inside available width', () => {
    const res = computeFitTextLayout({
      basePt: 8.5,
      minPt: 6.0,
      availableWidth: 150,
      textWidth: 120,
    });
    expect(res).toEqual({ fontSizePt: 8.5, wrap: false });
  });

  it('shrinks in steps down to 6.0pt without wrapping when it fits on 1 line', () => {
    const res = computeFitTextLayout({
      basePt: 8.0,
      minPt: 6.0,
      stepPt: 0.25,
      availableWidth: 100,
      textWidth: 130,
    });
    // 130 * (6.0 / 8.0) = 97.5 <= 100.5 -> fits on 1 line at 6.0pt
    expect(res.wrap).toBe(false);
    expect(res.fontSizePt).toBeGreaterThanOrEqual(6.0);
    expect(130 * (res.fontSizePt / 8.0)).toBeLessThanOrEqual(100.5);
  });

  it('switches to wrapping at minPt when text still does not fit on 1 line', () => {
    const res = computeFitTextLayout({
      basePt: 8.5,
      minPt: 6.0,
      stepPt: 0.25,
      availableWidth: 80,
      textWidth: 200,
    });
    expect(res).toEqual({ fontSizePt: 6.0, wrap: true });
  });

  it('shrinks notes on 1 line down to 5.5pt before wrapping', () => {
    const res = computeFitTextLayout({
      basePt: 7.5,
      minPt: 5.5,
      stepPt: 0.25,
      availableWidth: 60,
      textWidth: 160,
      maxLines: 2,
    });
    expect(res).toEqual({ fontSizePt: 5.5, wrap: true });
  });

  it('handles zero available width safely without shrinking', () => {
    const res = computeFitTextLayout({
      basePt: 9,
      minPt: 6.0,
      availableWidth: 0,
      textWidth: 120,
    });
    expect(res).toEqual({ fontSizePt: 9, wrap: false });
  });
});

describe('paginateByRowHeight', () => {
  it('keeps a normal 45-student class on 1 page when total height fits lastPageBudgetMm', () => {
    const items = Array.from({ length: 45 }, (_, i) => i + 1);
    const pages = paginateByRowHeight({
      items,
      getRowHeightMm: () => 3.3,
      maxRowsPerPage: 45,
      nonLastPageBudgetMm: 170,
      lastPageBudgetMm: 155,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(45);
    expect(pages[0].startIndex).toBe(0);
  });

  // Results sheet geometry: 6 mm rows, 248 mm middle pages, 40 mm title on page 1 (34 rows fit).
  const results = (count: number) =>
    paginateByRowHeight({
      items: Array.from({ length: count }, (_, i) => i + 1),
      getRowHeightMm: () => 6,
      maxRowsPerPage: 34,
      nonLastPageBudgetMm: 248,
      lastPageBudgetMm: 190,
      firstPageExtraOverheadMm: 40,
    }).map((p) => p.items.length);

  it('fills page 1 to the bottom like the ministry sample instead of splitting in half', () => {
    expect(results(40)).toEqual([34, 6]);
    expect(results(46)).toEqual([34, 12]);
  });

  it('pulls rows back so the last page never has fewer than 5 rows', () => {
    expect(results(38)).toEqual([33, 5]);
    expect(results(26)).toEqual([21, 5]);
  });

  it('keeps every row exactly once, in order, across pages', () => {
    const items = Array.from({ length: 95 }, (_, i) => i + 1);
    const pages = paginateByRowHeight({
      items,
      getRowHeightMm: () => 6,
      maxRowsPerPage: 34,
      nonLastPageBudgetMm: 248,
      lastPageBudgetMm: 190,
      firstPageExtraOverheadMm: 40,
    });
    expect(pages.flatMap((p) => p.items)).toEqual(items);
    pages.forEach((p, i) => expect(p.startIndex).toBe(i === 0 ? 0 : pages[i - 1].startIndex + pages[i - 1].items.length));
    expect(pages[pages.length - 1].items.length).toBeGreaterThanOrEqual(5);
  });

  it('adds a page when the last page cannot hold its rows plus the signature', () => {
    // 36 rows of 6 mm: page 1 fits 34, but 2 rows < 5-row tail → 31 + 5 (5×6 = 30 mm fits 190).
    expect(results(36)).toEqual([31, 5]);
    // Last-page budget too small for the tail → a third page.
    const pages = paginateByRowHeight({
      items: Array.from({ length: 60 }, (_, i) => i + 1),
      getRowHeightMm: () => 6,
      maxRowsPerPage: 34,
      nonLastPageBudgetMm: 200,
      lastPageBudgetMm: 40,
    }).map((p) => p.items.length);
    expect(pages.reduce((a, b) => a + b, 0)).toBe(60);
    expect(pages[pages.length - 1] * 6).toBeLessThanOrEqual(40);
  });

  it('caps the tail rule for small classes that still need two pages', () => {
    const pages = paginateByRowHeight({
      items: Array.from({ length: 6 }, (_, i) => i + 1),
      getRowHeightMm: () => 30,
      maxRowsPerPage: 45,
      nonLastPageBudgetMm: 150,
      lastPageBudgetMm: 100,
    }).map((p) => p.items.length);
    expect(pages).toEqual([3, 3]);
  });

  it('estimates 1 line for short names and 2 lines for ultra-long names in narrow columns', () => {
    expect(estimateWrappedLines('ហ៊ឹម សុខ', 35, 6.0)).toBe(1);
    expect(
      estimateWrappedLines('សម្តេចព្រះអង្គម្ចាស់ នរោត្តម សុវណ្ណវិសាលរ៉ាឌីយ៉ា', 28, 6.0)
    ).toBe(2);
  });
});
