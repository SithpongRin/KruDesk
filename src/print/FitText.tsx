import React, { useLayoutEffect, useRef, useState } from 'react';

export interface FitTextStepInput {
  basePt: number;
  /** Minimum single-line font size in pt before wrapping (default 6.0pt for names; 5.5pt for notes). */
  minPt?: number;
  /** Minimum font size in pt when wrapped onto 2 lines (default = minPt). */
  wrapMinPt?: number;
  stepPt?: number;
  /** Available single-line width in px. */
  availableWidth: number;
  /** Natural single-line width in px measured at `basePt`. */
  textWidth: number;
  /** Maximum lines when wrapped (default 2). */
  maxLines?: number;
}

export interface FitTextStepResult {
  fontSizePt: number;
  wrap: boolean;
}

/**
 * Pure sizing step calculation for FitText.
 * 1. Walks down from `basePt` in `stepPt` steps down to `minPt` until the text fits on 1 line.
 * 2. If it still does not fit at `minPt`, wraps onto up to `maxLines` (default 2) lines,
 *    and if 2 lines still overflow at `minPt`, keeps shrinking down to `wrapMinPt` so it
 *    stays within `maxLines` without clipping or ellipsis.
 */
export function computeFitTextLayout({
  basePt,
  minPt = 6.0,
  wrapMinPt,
  stepPt = 0.25,
  availableWidth,
  textWidth,
  maxLines = 2,
}: FitTextStepInput): FitTextStepResult {
  const safeMin = Math.min(basePt, minPt);
  const safeWrapMin = Math.min(safeMin, wrapMinPt ?? safeMin);
  if (availableWidth <= 0 || textWidth <= 0 || textWidth <= availableWidth + 0.5) {
    return { fontSizePt: basePt, wrap: false };
  }

  const step = Math.max(0.1, stepPt);
  const safeTargetWidth = Math.max(0, availableWidth - 2);
  let pt = basePt;
  while (pt > safeMin + 1e-6) {
    pt = Math.max(safeMin, Math.round((pt - step) * 100) / 100);
    const estimatedWidth = textWidth * (pt / basePt);
    if (estimatedWidth <= safeTargetWidth) {
      return { fontSizePt: pt, wrap: false };
    }
  }

  // Still does not fit on 1 line at safeMin -> wrap onto up to `maxLines` lines.
  const wrappedCapacity = availableWidth * Math.max(1, maxLines) * 0.9;
  let wrapPt = safeMin;
  while (
    wrapPt > safeWrapMin + 1e-6 &&
    textWidth * (wrapPt / basePt) > wrappedCapacity + 0.5
  ) {
    wrapPt = Math.max(safeWrapMin, Math.round((wrapPt - step) * 100) / 100);
  }

  return { fontSizePt: wrapPt, wrap: true };
}

/**
 * Estimates whether a Khmer/Latin string inside a column of `innerWidthMm`
 * will stay on 1 line or wrap to 2+ lines at `minPt`.
 */
export function estimateWrappedLines(
  text: string | undefined | null,
  innerWidthMm: number,
  minPt = 6.0,
  maxLines = 2
): number {
  const s = (text ?? '').trim();
  if (!s || innerWidthMm <= 0) return 1;
  // Average Battambang advance per UTF-16 code unit (~35-40% are zero-width combining marks/coeng).
  const estWidthMm = s.length * 0.35 * minPt * 0.3528;
  if (estWidthMm <= innerWidthMm) return 1;
  return Math.min(maxLines, Math.max(2, Math.ceil(estWidthMm / (innerWidthMm * 0.9))));
}

export interface PaginateByHeightOptions<T> {
  items: T[];
  getRowHeightMm: (item: T, index: number) => number;
  maxRowsPerPage?: number;
  nonLastPageBudgetMm: number;
  lastPageBudgetMm: number;
  firstPageExtraOverheadMm?: number;
}

/**
 * Packs items into pages using estimated row heights:
 * 1. First tries to fit everything on ONE page (within `maxRowsPerPage` and `lastPageBudgetMm`).
 * 2. Only if it still does not fit, splits into BALANCED pages (never leaving a 1-5 row tail).
 */
export function paginateByRowHeight<T>({
  items,
  getRowHeightMm,
  maxRowsPerPage = 45,
  nonLastPageBudgetMm,
  lastPageBudgetMm,
  firstPageExtraOverheadMm = 0,
}: PaginateByHeightOptions<T>): Array<{ items: T[]; startIndex: number }> {
  if (items.length === 0) {
    return [{ items: [], startIndex: 0 }];
  }

  const heights = items.map((item, idx) => Math.max(1, getRowHeightMm(item, idx)));
  const totalHeight = heights.reduce((a, b) => a + b, 0);

  // Step 1: Try fitting everything on a single page first.
  const singlePageBudget = Math.max(10, lastPageBudgetMm - firstPageExtraOverheadMm);
  if (items.length <= maxRowsPerPage && totalHeight <= singlePageBudget) {
    return [{ items, startIndex: 0 }];
  }

  // Step 2: Find the minimum page count k >= 2 that allows a balanced split where every page fits.
  const minPagesByCount = Math.ceil(items.length / maxRowsPerPage);
  let k = Math.max(2, minPagesByCount);
  const maxK = Math.max(k, items.length);

  const pageBudget = (p: number, totalPages: number) => {
    const base = p === totalPages - 1 ? lastPageBudgetMm : nonLastPageBudgetMm;
    const overhead = p === 0 ? firstPageExtraOverheadMm : 0;
    return Math.max(10, base - overhead);
  };

  while (k <= maxK) {
    const budgets = Array.from({ length: k }, (_, p) => pageBudget(p, k));
    const sumBudgets = budgets.reduce((a, b) => a + b, 0);

    if (sumBudgets >= totalHeight || k === maxK) {
      const candidate: Array<{ items: T[]; startIndex: number }> = [];
      let cursor = 0;
      let fits = true;

      for (let p = 0; p < k; p++) {
        const remainingPages = k - p;
        const remainingItems = items.length - cursor;
        if (p === k - 1) {
          let h = 0;
          for (let i = cursor; i < items.length; i++) h += heights[i];
          if (remainingItems > maxRowsPerPage || (h > budgets[p] && remainingItems > 1)) {
            fits = false;
          }
          candidate.push({ items: items.slice(cursor), startIndex: cursor });
          cursor = items.length;
        } else {
          // Proportional target height & balanced item count for page p
          const targetH = Math.min(budgets[p], totalHeight * (budgets[p] / sumBudgets));
          const maxTakeHere = Math.min(maxRowsPerPage, remainingItems - (remainingPages - 1));
          let used = 0;
          let take = 0;
          while (take < maxTakeHere) {
            const nextH = heights[cursor + take];
            if (take > 0 && used + nextH > budgets[p]) break;
            if (take > 0 && used + nextH > targetH + nextH * 0.35) break;
            used += nextH;
            take++;
          }
          if (take === 0) take = 1;
          candidate.push({ items: items.slice(cursor, cursor + take), startIndex: cursor });
          cursor += take;
        }
      }

      if (fits && cursor === items.length) {
        return candidate;
      }
    }
    k++;
  }

  // Fallback: 1 item per page
  return items.map((item, idx) => ({ items: [item], startIndex: idx }));
}

export interface FitTextProps {
  text: string;
  /** Starting font size in pt; when omitted, reads the inherited computed font size. */
  basePt?: number;
  /** Minimum single-line font size in pt before wrapping onto 2 lines (default 6.0pt). */
  minPt?: number;
  /** Minimum font size in pt when wrapped onto 2 lines (default = minPt). */
  wrapMinPt?: number;
  /** Decrement step in pt when shrinking to fit (default 0.25pt). */
  stepPt?: number;
  /** Line-height (clamped to >= 1.25 so Khmer subscripts and vowels are never clipped). */
  lineHeight?: number;
  /** Maximum lines when wrapped (default 2). */
  maxLines?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders text on a single line without ellipsis or overflow:hidden.
 * If the text overflows its container width, shrinks font-size down to `minPt`;
 * if it still does not fit, wraps cleanly at Khmer word boundaries (never breaking coeng clusters).
 */
export const FitText: React.FC<FitTextProps> = ({
  text,
  basePt,
  minPt = 6.0,
  wrapMinPt,
  stepPt = 0.25,
  lineHeight = 1.25,
  maxLines = 2,
  className = '',
  style,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const currentPtRef = useRef<number | null>(basePt ?? null);
  const safeLineHeight = Math.max(1.1, lineHeight);
  const [layout, setLayout] = useState<{ fontSizePt: number | null; wrap: boolean }>({
    fontSizePt: basePt ?? null,
    wrap: false,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) return;

    const measure = () => {
      // Read clientWidth/scrollWidth without mutating styles first to avoid layout thrashing.
      const availableWidth = el.clientWidth;
      const textWidth = el.scrollWidth;
      if (availableWidth <= 0 || textWidth <= availableWidth + 0.5) {
        return;
      }

      let effectiveBasePt = currentPtRef.current ?? basePt;
      if (effectiveBasePt === undefined) {
        const computedPx = parseFloat(getComputedStyle(el).fontSize);
        effectiveBasePt = Number.isFinite(computedPx) && computedPx > 0 ? computedPx * 0.75 : 8;
      }

      const next = computeFitTextLayout({
        basePt: effectiveBasePt,
        minPt,
        wrapMinPt,
        stepPt,
        availableWidth,
        textWidth,
        maxLines,
      });

      currentPtRef.current = next.fontSizePt;
      setLayout((prev) =>
        prev.fontSizePt === next.fontSizePt && prev.wrap === next.wrap ? prev : next
      );
    };

    measure();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [text, basePt, minPt, wrapMinPt, stepPt, maxLines]);

  return (
    <span
      ref={ref}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        lineHeight: safeLineHeight,
        whiteSpace: layout.wrap ? 'normal' : 'nowrap',
        wordBreak: 'normal',
        ...(layout.fontSizePt !== null ? { fontSize: `${layout.fontSizePt}pt` } : {}),
        ...style,
      }}
    >
      {text}
    </span>
  );
};
