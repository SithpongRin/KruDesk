/**
 * «បង្រួមដាក់ក្នុង ១ ទំព័រ» (Optimize): scales a whole print page so a large class still fits on
 * one sheet of paper. The sheet renders every row on one `[data-print-page]` (no pagination) with
 * its content inside one `[data-fit-body]` wrapper; this module then shrinks that wrapper evenly:
 *
 *   body.width = 100/scale %   (lay the content out wider…)
 *   transform  = scale(scale)  (…then shrink it back to the page width)
 *
 * so the result keeps the full page width with no stretching, only smaller text. Called
 * imperatively right before rasterizing (fonts already loaded); React never styles `[data-fit-body]`.
 */

/** Below this the text is hard to read (9pt → about 5pt); the preview warns but still allows it. */
export const MIN_READABLE_FIT_SCALE = 0.55;
/** Never shrink further than this, whatever the class size. */
export const MIN_FIT_SCALE = 0.2;
/** Sub-pixel slack when comparing heights. */
const EPS_PX = 0.5;

/**
 * Scale that makes content of `naturalPx` height fit `availablePx` (1 when it already fits),
 * rounded down to 0.001. With `prevScale` the result never exceeds it (the content was already
 * measured too tall at that scale).
 */
export function computeFitScale(naturalPx: number, availablePx: number, prevScale?: number): number {
  if (!(naturalPx > 0) || !(availablePx > 0) || naturalPx <= availablePx + EPS_PX) {
    return prevScale !== undefined ? Math.min(1, prevScale) : 1;
  }
  let scale = Math.floor((availablePx / naturalPx) * 1000) / 1000;
  if (prevScale !== undefined) scale = Math.min(scale, prevScale);
  return Math.max(MIN_FIT_SCALE, Math.min(1, scale));
}

function fitBodyOf(pageEl: HTMLElement): HTMLElement | null {
  return pageEl.querySelector<HTMLElement>(':scope > [data-fit-body]');
}

/** Height (px) available for the content: the page's content box. */
function availableHeightPx(pageEl: HTMLElement): number {
  const cs = getComputedStyle(pageEl);
  return pageEl.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
}

function applyScale(body: HTMLElement, scale: number): void {
  if (scale >= 1) {
    body.style.removeProperty('width');
    body.style.removeProperty('transform');
    body.style.removeProperty('transform-origin');
    return;
  }
  body.style.width = `${100 / scale}%`;
  body.style.transform = `scale(${scale})`;
  body.style.transformOrigin = 'top left';
}

/** Undoes `fitPageToOnePage` (page back to its natural layout, data-fit-scale="1"). */
export function resetPageFit(pageEl: HTMLElement): void {
  const body = fitBodyOf(pageEl);
  if (body) applyScale(body, 1);
  pageEl.dataset.fitScale = '1';
}

/**
 * Shrinks the page's `[data-fit-body]` until it fits the page height. Laying the content out wider
 * can unwrap 2-line cells (shorter content, a larger scale may fit), so it re-measures up to 3
 * times and keeps the largest scale that was measured to fit. Sets `data-fit-scale` on the page
 * (read by the PDF stamp overlay) and returns the scale; 1 when no shrinking was needed or the
 * page has no `[data-fit-body]`.
 */
export function fitPageToOnePage(pageEl: HTMLElement): { scale: number } {
  const body = fitBodyOf(pageEl);
  if (!body) {
    pageEl.dataset.fitScale = '1';
    return { scale: 1 };
  }
  applyScale(body, 1);
  const avail = availableHeightPx(pageEl);
  // Layout height (a CSS transform does not change it).
  const measure = () => body.scrollHeight;

  let natural = measure();
  if (avail <= 0 || natural <= avail + EPS_PX) {
    pageEl.dataset.fitScale = '1';
    return { scale: 1 };
  }

  let scale = computeFitScale(natural, avail);
  let best: number | null = null;
  for (let pass = 0; pass < 3; pass++) {
    applyScale(body, scale);
    natural = measure();
    if (natural * scale <= avail + EPS_PX) {
      best = best === null ? scale : Math.max(best, scale);
      // Wider layout got shorter: try the larger scale it allows (only if meaningfully larger).
      const larger = computeFitScale(natural, avail);
      if (larger - scale < 0.005) break;
      scale = larger;
    } else {
      // Narrower layout re-wrapped taller than measured: shrink a bit more.
      scale = computeFitScale(natural, avail, scale - 0.001);
    }
  }
  if (best === null) {
    // Still too tall after 3 passes: keep shrinking until it is measured to fit.
    for (let guard = 0; guard < 10 && scale > MIN_FIT_SCALE; guard++) {
      applyScale(body, scale);
      natural = measure();
      if (natural * scale <= avail + EPS_PX) {
        best = scale;
        break;
      }
      scale = computeFitScale(natural, avail, scale - 0.001);
    }
    if (best === null) best = Math.max(MIN_FIT_SCALE, scale);
  }
  applyScale(body, best);
  pageEl.dataset.fitScale = String(best);
  return { scale: best };
}
