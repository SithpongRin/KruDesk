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

  it('splits into balanced pages without leaving a tiny 1-5 row tail', () => {
    const items = Array.from({ length: 46 }, (_, i) => i + 1);
    const pages = paginateByRowHeight({
      items,
      getRowHeightMm: () => 3.5,
      maxRowsPerPage: 45,
      nonLastPageBudgetMm: 165,
      lastPageBudgetMm: 145,
    });
    expect(pages).toHaveLength(2);
    expect(pages[0].items.length).toBeGreaterThanOrEqual(20);
    expect(pages[1].items.length).toBeGreaterThanOrEqual(20);
    expect(pages[0].items.length + pages[1].items.length).toBe(46);
  });

  it('estimates 1 line for short names and 2 lines for ultra-long names in narrow columns', () => {
    expect(estimateWrappedLines('ហ៊ឹម សុខ', 35, 6.0)).toBe(1);
    expect(
      estimateWrappedLines('សម្តេចព្រះអង្គម្ចាស់ នរោត្តម សុវណ្ណវិសាលរ៉ាឌីយ៉ា', 28, 6.0)
    ).toBe(2);
  });
});
