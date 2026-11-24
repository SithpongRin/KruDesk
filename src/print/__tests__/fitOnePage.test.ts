// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  MIN_FIT_SCALE,
  computeFitScale,
  fitPageToOnePage,
  resetPageFit,
} from '../fitOnePage';

describe('computeFitScale', () => {
  it('is 1 when the content already fits', () => {
    expect(computeFitScale(900, 1000)).toBe(1);
    expect(computeFitScale(1000.4, 1000)).toBe(1);
  });

  it('shrinks to available / natural, rounded down', () => {
    expect(computeFitScale(1600, 1000)).toBe(0.625);
    expect(computeFitScale(3000, 1000)).toBe(0.333);
  });

  it('never exceeds the previous scale and never goes below the floor', () => {
    expect(computeFitScale(1500, 1000, 0.6)).toBe(0.6);
    expect(computeFitScale(100000, 1000)).toBe(MIN_FIT_SCALE);
  });

  it('handles empty measurements safely', () => {
    expect(computeFitScale(0, 1000)).toBe(1);
    expect(computeFitScale(1000, 0)).toBe(1);
  });
});

/**
 * JSDOM has no layout, so the page is simulated: content height depends on the body's width
 * (wider layout → 2-line cells unwrap → shorter), like a real table.
 */
function makePage(heightAtWidth: (widthPct: number) => number, availPx = 1000) {
  const page = document.createElement('div');
  page.setAttribute('data-print-page', '');
  const body = document.createElement('div');
  body.setAttribute('data-fit-body', '');
  page.appendChild(body);
  document.body.appendChild(page);
  Object.defineProperty(page, 'clientHeight', { configurable: true, get: () => availPx });
  Object.defineProperty(body, 'scrollHeight', {
    configurable: true,
    get: () => heightAtWidth(body.style.width ? parseFloat(body.style.width) : 100),
  });
  return { page, body };
}

describe('fitPageToOnePage', () => {
  it('leaves a page that fits untouched (scale 1)', () => {
    const { page, body } = makePage(() => 800);
    expect(fitPageToOnePage(page)).toEqual({ scale: 1 });
    expect(page.dataset.fitScale).toBe('1');
    expect(body.style.transform).toBe('');
  });

  it('widens and scales the body so its scaled height fits the page', () => {
    const { page, body } = makePage(() => 1600);
    const { scale } = fitPageToOnePage(page);
    expect(scale).toBe(0.625);
    expect(page.dataset.fitScale).toBe('0.625');
    expect(body.style.transform).toBe('scale(0.625)');
    expect(body.style.transformOrigin).toBe('top left');
    expect(parseFloat(body.style.width)).toBeCloseTo(160, 5);
    expect(1600 * scale).toBeLessThanOrEqual(1000.5);
  });

  it('uses the larger scale when the wider layout gets shorter', () => {
    // 1600 px at 100% width, 1400 px once laid out wider than 120%.
    const { page } = makePage((w) => (w > 120 ? 1400 : 1600));
    const { scale } = fitPageToOnePage(page);
    expect(scale).toBe(0.714);
    expect(scale * 1400).toBeLessThanOrEqual(1000.5);
  });

  it('keeps the last scale that fitted when a larger one re-wraps taller', () => {
    // Short only when wider than 150%: 0.714 (140%) is too tall, so 0.625 stays.
    const { page } = makePage((w) => (w > 150 ? 1400 : 1600));
    expect(fitPageToOnePage(page).scale).toBe(0.625);
  });

  it('shrinks further when the narrower layout re-wraps taller', () => {
    // Taller (re-wrapped) whenever the layout is narrower than 170%.
    const { page } = makePage((w) => (w < 170 ? 1800 : 1600));
    const { scale } = fitPageToOnePage(page);
    const width = 100 / scale;
    expect((width < 170 ? 1800 : 1600) * scale).toBeLessThanOrEqual(1000.5);
  });

  it('reset restores the natural layout', () => {
    const { page, body } = makePage(() => 1600);
    fitPageToOnePage(page);
    resetPageFit(page);
    expect(body.style.transform).toBe('');
    expect(body.style.width).toBe('');
    expect(page.dataset.fitScale).toBe('1');
  });

  it('returns 1 for a page without a fit body', () => {
    const page = document.createElement('div');
    expect(fitPageToOnePage(page)).toEqual({ scale: 1 });
  });
});
