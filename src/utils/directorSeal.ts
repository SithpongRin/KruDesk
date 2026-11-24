/**
 * Director's stamp («ត្រា») and signature, and the teacher's own signature, as images uploaded
 * in Settings.
 * Stored only in this browser (settings table, so they travel in backups) — never in the app's
 * code or on GitHub. Printed only when the teacher ticks the matching box in the sign dialog.
 */
export type DirectorSealKey = 'directorStamp' | 'directorSignature' | 'teacherSignature';

export interface SealImage {
  /** Transparent PNG data URL, trimmed to the ink. */
  dataUrl: string;
  width: number;
  height: number;
}

export const MIN_STAMP_SCALE = 0.4;
export const MAX_STAMP_SCALE = 2.2;
export const DEFAULT_STAMP_SCALE = 1;
export const STAMP_OPACITY = 0.92;

export function clampStampScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_STAMP_SCALE;
  return Math.min(MAX_STAMP_SCALE, Math.max(MIN_STAMP_SCALE, value));
}

export function clampStampOffsetMm(value: unknown, limitMm = 60): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(limitMm, Math.max(-limitMm, value));
}

export interface StampPlacementInput {
  gapMm: number;
  fontSizePt: number;
  combined: boolean;
  /** True when a name line sits below SealSpace (director-only certificate block). */
  hasBottomName?: boolean;
  /** Natural width / height of the stamp image. */
  aspectRatio?: number;
  scale?: number;
  offsetXMm?: number;
  offsetYMm?: number;
}

export interface StampPlacementBox {
  widthMm: number;
  heightMm: number;
  /** Top relative to SealSpace top (mm). */
  topMm: number;
  /** Horizontal offset from 50% of SealSpace width (mm). */
  offsetXMm: number;
  /** Fraction of widthMm placed to the left of the anchor point (0.4 combined, 0.5 round). */
  anchorXFraction: number;
  scale: number;
  offsetYMm: number;
}

/**
 * Single source of truth for the director's stamp size & position inside `SealSpace`,
 * shared by DOM print rendering, interactive PDF preview overlay, and pdf-lib embedding.
 */
export function computeDirectorStampBox(input: StampPlacementInput): StampPlacementBox {
  const lineMm = input.fontSizePt * 0.3528 * 1.375;
  const baseHeightMm = input.combined
    ? Math.min(44, Math.max(34, input.gapMm + 2 * lineMm + 12))
    : Math.min(36, Math.max(30, input.gapMm + 2 * lineMm + 6));
  const baseMaxWidthMm = input.combined ? 85 : baseHeightMm * 1.15;
  const aspect =
    typeof input.aspectRatio === 'number' && Number.isFinite(input.aspectRatio) && input.aspectRatio > 0
      ? input.aspectRatio
      : 1;
  const unscaledWidthMm = Math.min(baseMaxWidthMm, baseHeightMm * aspect);
  const unscaledHeightMm = unscaledWidthMm / aspect;
  const bottomAllowanceMm = input.hasBottomName ? lineMm : 0;
  const baseTopMm = Math.min(
    -(2 * lineMm) - 1,
    input.gapMm + bottomAllowanceMm - unscaledHeightMm
  );
  const scale = clampStampScale(input.scale);
  const offsetXMm = clampStampOffsetMm(input.offsetXMm);
  const offsetYMm = clampStampOffsetMm(input.offsetYMm);
  const widthMm = unscaledWidthMm * scale;
  const heightMm = unscaledHeightMm * scale;
  const baseCenterYMm = baseTopMm + unscaledHeightMm / 2;
  const topMm = baseCenterYMm - heightMm / 2 + offsetYMm;
  return {
    widthMm,
    heightMm,
    topMm,
    offsetXMm,
    anchorXFraction: input.combined ? 0.4 : 0.5,
    scale,
    offsetYMm,
  };
}

export interface SignaturePlacementInput {
  gapMm: number;
  /** Natural width / height of the signature image (default 2). */
  aspectRatio?: number;
  scale?: number;
  offsetXMm?: number;
  offsetYMm?: number;
}

export interface SignaturePlacementBox {
  widthMm: number;
  heightMm: number;
  /** Top relative to SealSpace top (mm). */
  topMm: number;
  /** Horizontal offset from 50% of SealSpace width (mm). */
  offsetXMm: number;
  /** The signature is always centred on its anchor point. */
  anchorXFraction: 0.5;
  scale: number;
  offsetYMm: number;
}

/**
 * Single source of truth for the teacher's signature size & position inside `SealSpace`
 * (centred in the signing gap), shared by DOM print rendering, the interactive PDF preview
 * overlay and pdf-lib embedding.
 */
export function computeSignatureBox(input: SignaturePlacementInput): SignaturePlacementBox {
  const baseHeightMm = Math.max(8, input.gapMm * 0.9);
  const baseMaxWidthMm = 75;
  const aspect =
    typeof input.aspectRatio === 'number' && Number.isFinite(input.aspectRatio) && input.aspectRatio > 0
      ? input.aspectRatio
      : 2;
  const unscaledWidthMm = Math.min(baseMaxWidthMm, baseHeightMm * aspect);
  const unscaledHeightMm = unscaledWidthMm / aspect;
  const scale = clampStampScale(input.scale);
  const offsetXMm = clampStampOffsetMm(input.offsetXMm);
  const offsetYMm = clampStampOffsetMm(input.offsetYMm);
  const widthMm = unscaledWidthMm * scale;
  const heightMm = unscaledHeightMm * scale;
  return {
    widthMm,
    heightMm,
    topMm: input.gapMm / 2 - heightMm / 2 + offsetYMm,
    offsetXMm,
    anchorXFraction: 0.5,
    scale,
    offsetYMm,
  };
}

export function isSealImage(value: unknown): value is SealImage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SealImage>;
  return (
    typeof v.dataUrl === 'string' &&
    v.dataUrl.startsWith('data:image/') &&
    typeof v.width === 'number' &&
    typeof v.height === 'number'
  );
}

/**
 * Makes white paper transparent: pixels lighter than `clearAbove` become fully transparent,
 * pixels between `solidBelow` and `clearAbove` fade, darker ink stays. Works on RGBA in place.
 */
export function whiteToTransparent(
  data: Uint8ClampedArray,
  solidBelow = 170,
  clearAbove = 230
): void {
  for (let o = 0; o < data.length; o += 4) {
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    if (lum >= clearAbove) {
      data[o + 3] = 0;
    } else if (lum > solidBelow) {
      const keep = (clearAbove - lum) / (clearAbove - solidBelow);
      data[o + 3] = Math.round(data[o + 3] * keep);
    }
  }
}

/** Bounding box of pixels with alpha above `minAlpha`, or null when the image is empty. */
export function inkBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minAlpha = 24
): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > minAlpha) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export interface SealCleanOptions {
  /**
   * How much of the paper to remove, around the measured paper colour: 0 = automatic,
   * higher removes more (greyer paper, shadows), lower keeps fainter ink.
   */
  strength: number;
  /** Deepen and saturate the ink so a pale photo prints clearly. */
  enhance: boolean;
}

export const DEFAULT_SEAL_CLEAN: SealCleanOptions = { strength: 0, enhance: true };

/**
 * Brightness of the paper: phone photos are rarely white, so take the 85th percentile of the
 * luminance (the paper covers most of a cropped stamp/signature).
 */
export function paperLuminance(data: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let o = 0; o < data.length; o += 4) {
    if (data[o + 3] < 128) continue;
    hist[Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2])] += 1;
    n += 1;
  }
  if (n === 0) return 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= n * 0.85) return v;
  }
  return 255;
}

/**
 * Makes faded ink print clearly: pushes each colour channel away from white (darker) and away
 * from grey (more saturated), and firms up semi-transparent edges. Works on RGBA in place.
 */
export function enhanceInk(data: Uint8ClampedArray, depth = 1.45, saturation = 1.3): void {
  for (let o = 0; o < data.length; o += 4) {
    const a = data[o + 3];
    if (a === 0) continue;
    let r = 255 - (255 - data[o]) * depth;
    let g = 255 - (255 - data[o + 1]) * depth;
    let b = 255 - (255 - data[o + 2]) * depth;
    const grey = (r + g + b) / 3;
    r = grey + (r - grey) * saturation;
    g = grey + (g - grey) * saturation;
    b = grey + (b - grey) * saturation;
    data[o] = Math.max(0, Math.min(255, Math.round(r)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
    data[o + 3] = Math.min(255, Math.round(a * 1.6));
  }
}

/**
 * Cleans a (cropped) canvas: paper → transparent, optional ink enhancement, trimmed to the ink
 * with a small margin, long side at most `maxLongSide`. Returns a new canvas, or null when no
 * ink is left (e.g. the paper threshold is too low).
 */
export function cleanSealCanvas(
  source: HTMLCanvasElement,
  options: SealCleanOptions = DEFAULT_SEAL_CLEAN,
  maxLongSide = 900
): HTMLCanvasElement | null {
  // Work at a bounded size (large phone photos).
  const workScale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * workScale));
  const h = Math.max(1, Math.round(source.height * workScale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d');
  if (!wctx) return null;
  wctx.drawImage(source, 0, 0, w, h);
  const pixels = wctx.getImageData(0, 0, w, h);
  // Paper slightly darker than its measured brightness still counts as paper.
  const clearAbove = Math.max(
    60,
    Math.min(250, paperLuminance(pixels.data) - 18 - options.strength)
  );
  // A narrow fade band: pale ink (faded stamps) stays solid instead of half-transparent.
  whiteToTransparent(pixels.data, clearAbove - 30, clearAbove);
  if (options.enhance) enhanceInk(pixels.data);
  wctx.putImageData(pixels, 0, 0);

  const box = inkBounds(pixels.data, w, h);
  if (!box) return null;
  const pad = Math.round(Math.max(box.w, box.h) * 0.02);
  const cx = Math.max(0, box.x - pad);
  const cy = Math.max(0, box.y - pad);
  const cw = Math.min(w - cx, box.w + pad * 2);
  const ch = Math.min(h - cy, box.h + pad * 2);

  const outScale = Math.min(1, maxLongSide / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cw * outScale));
  out.height = Math.max(1, Math.round(ch * outScale));
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(work, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return out;
}

export function sealImageFromCanvas(canvas: HTMLCanvasElement): SealImage {
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** Reads an image file without cropping and cleans it with the default options. */
export async function prepareSealImage(file: File, maxLongSide = 900): Promise<SealImage> {
  const srcUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cannot read image file'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Cannot decode image'));
    el.src = srcUrl;
  });
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('Invalid image dimensions');
  const source = document.createElement('canvas');
  source.width = srcW;
  source.height = srcH;
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);
  const cleaned = cleanSealCanvas(source, DEFAULT_SEAL_CLEAN, maxLongSide);
  if (!cleaned) throw new Error('No ink found');
  return sealImageFromCanvas(cleaned);
}
