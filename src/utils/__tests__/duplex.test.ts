import { describe, it, expect } from 'vitest';
import { defaultPrintSettings, defaultReferenceTemplate } from '../../db/defaultTemplates';
import { computeSheetLayout } from '../cardSizes';

/** Front x of column c, and back x of the card printed behind it (long-edge flip). */
function frontAndBackX(marginLeftMm: number, duplexOffsetXmM = 0) {
  const layout = computeSheetLayout(defaultReferenceTemplate, {
    ...defaultPrintSettings,
    marginLeftMm,
    duplexOffsetXmM,
  });
  return Array.from({ length: layout.cols }, (_, c) => {
    const frontX = layout.marginLeftMm + c * layout.cardWidthMm;
    const backX = layout.backMarginLeftMm + (layout.cols - 1 - c) * layout.cardWidthMm;
    // After flipping the sheet left↔right, the back's left edge is at paperWidth - backX - cardWidth
    const backSeenFromFront = layout.paperWidthMm - backX - layout.cardWidthMm;
    return { frontX, backSeenFromFront, layout };
  });
}

describe('Duplex back-side alignment', () => {
  it('every back lands exactly behind its front with centred margins', () => {
    for (const { frontX, backSeenFromFront } of frontAndBackX(24)) {
      expect(backSeenFromFront).toBeCloseTo(frontX, 6);
    }
  });

  it('every back lands exactly behind its front when the left margin is NOT centred', () => {
    for (const { frontX, backSeenFromFront } of frontAndBackX(10)) {
      expect(backSeenFromFront).toBeCloseTo(frontX, 6);
    }
    for (const { frontX, backSeenFromFront } of frontAndBackX(40)) {
      expect(backSeenFromFront).toBeCloseTo(frontX, 6);
    }
  });

  it('duplex offset shifts only the back side', () => {
    const [col0] = frontAndBackX(24, 2);
    expect(col0.layout.marginLeftMm).toBe(24);
    expect(col0.layout.backMarginLeftMm).toBeCloseTo(24 + 2, 6);
  });

  it('back grid stays on the paper', () => {
    for (const ml of [0, 10, 24, 48]) {
      const [{ layout }] = frontAndBackX(ml);
      expect(layout.backMarginLeftMm).toBeGreaterThanOrEqual(0);
      expect(layout.backMarginLeftMm + layout.cols * layout.cardWidthMm).toBeLessThanOrEqual(
        layout.paperWidthMm + 1e-9
      );
    }
  });
});
