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

/**
 * Reads a photo or scan of a stamp/signature, removes the white paper, trims to the ink and
 * scales the long side down to `maxLongSide`. A PNG that is already transparent keeps its alpha.
 */
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

  // Work at a bounded size first (large phone photos).
  const workScale = Math.min(1, 1600 / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * workScale));
  const h = Math.max(1, Math.round(srcH * workScale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d');
  if (!wctx) throw new Error('Canvas 2D context unavailable');
  wctx.drawImage(img, 0, 0, w, h);
  const pixels = wctx.getImageData(0, 0, w, h);
  whiteToTransparent(pixels.data);
  wctx.putImageData(pixels, 0, 0);

  const box = inkBounds(pixels.data, w, h);
  if (!box) throw new Error('No ink found');
  const pad = Math.round(Math.max(box.w, box.h) * 0.02);
  const cx = Math.max(0, box.x - pad);
  const cy = Math.max(0, box.y - pad);
  const cw = Math.min(w - cx, box.w + pad * 2);
  const ch = Math.min(h - cy, box.h + pad * 2);

  const outScale = Math.min(1, maxLongSide / Math.max(cw, ch));
  const outW = Math.max(1, Math.round(cw * outScale));
  const outH = Math.max(1, Math.round(ch * outScale));
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas 2D context unavailable');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(work, cx, cy, cw, ch, 0, 0, outW, outH);
  return { dataUrl: out.toDataURL('image/png'), width: outW, height: outH };
}
