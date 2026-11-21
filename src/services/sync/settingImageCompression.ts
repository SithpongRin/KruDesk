/**
 * Shrinks images inside a synced setting value (director stamp / signatures, document borders,
 * name banner) so the setting doc fits under the Cloud doc budget.
 *
 * Only images that make the setting doc too big are re-encoded, and only for the Cloud copy; the
 * uploading device then pulls that same copy back, so every device ends up with the identical
 * image. Printing draws these images as <img> sized in mm, so a smaller (still sharp) image
 * prints the same size. Transparency is kept (WebP with alpha when the browser can encode it,
 * otherwise PNG).
 */

/** Target for the whole setting doc after shrinking (well under MAX_SYNC_DOC_BYTES = 900 KB). */
export const SETTING_IMAGE_BUDGET_BYTES = 760 * 1024;

export type ImageReencoder = (dataUrl: string, step: number) => Promise<string | null>;

interface ImageSlot {
  holder: Record<string, unknown>;
  field: string;
  dataUrl: string;
}

function collectImageSlots(node: unknown, out: ImageSlot[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node) collectImageSlots(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [field, val] of Object.entries(obj)) {
    if (typeof val === 'string' && val.startsWith('data:image/')) {
      out.push({ holder: obj, field, dataUrl: val });
    } else if (val && typeof val === 'object') {
      collectImageSlots(val, out, depth + 1);
    }
  }
}

function jsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Returns a copy of `value` whose embedded image data URLs were re-encoded (largest first,
 * progressively smaller) until the JSON fits `budgetBytes`. Returns the original value unchanged
 * when it already fits, has no images, or no smaller encoding could be produced.
 */
export async function shrinkImagesInSettingValue<T>(
  value: T,
  budgetBytes: number = SETTING_IMAGE_BUDGET_BYTES,
  reencode: ImageReencoder = browserReencode
): Promise<T> {
  if (jsonBytes(value) <= budgetBytes) return value;

  const copy = JSON.parse(JSON.stringify(value)) as T;
  const slots: ImageSlot[] = [];
  collectImageSlots(copy, slots);
  if (slots.length === 0) return value;
  slots.sort((a, b) => b.dataUrl.length - a.dataUrl.length);

  const MAX_STEPS = 8;
  for (let step = 0; step < MAX_STEPS && jsonBytes(copy) > budgetBytes; step++) {
    let changed = false;
    for (const slot of slots) {
      if (jsonBytes(copy) <= budgetBytes) break;
      const smaller = await reencode(slot.dataUrl, step);
      if (smaller && smaller.startsWith('data:image/') && smaller.length < String(slot.holder[slot.field]).length) {
        slot.holder[slot.field] = smaller;
        changed = true;
      }
    }
    if (!changed && step > 2) break;
  }
  return copy;
}

/** True when this browser's canvas can really encode WebP (Safari may silently return PNG). */
let webpSupport: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    webpSupport = c.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot decode image'));
    img.src = dataUrl;
  });
}

/**
 * Step ladder: 0 = same size, then each step scales the long side down (×0.8 per step, never
 * below 360 px). Transparent images → WebP (or PNG when WebP encoding is unavailable);
 * opaque JPEG-like images → JPEG with decreasing quality.
 */
export async function browserReencode(dataUrl: string, step: number): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const img = await loadImage(dataUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;

    const longSide = Math.max(srcW, srcH);
    const targetLong = Math.max(360, Math.round(longSide * Math.pow(0.8, step)));
    const scale = Math.min(1, targetLong / longSide);
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const opaque = dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg');
    if (opaque) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', Math.max(0.5, 0.85 - step * 0.05));
    }

    ctx.drawImage(img, 0, 0, w, h);
    if (canEncodeWebp()) {
      return canvas.toDataURL('image/webp', Math.max(0.6, 0.9 - step * 0.05));
    }
    // PNG fallback (e.g. Safari): reduce noise so PNG compresses — 5 bits per colour channel,
    // 4 bits alpha. Invisible at print size for stamps/signatures/frames.
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = px[i]! & 0xf8;
      px[i + 1] = px[i + 1]! & 0xf8;
      px[i + 2] = px[i + 2]! & 0xf8;
      px[i + 3] = px[i + 3]! < 8 ? 0 : px[i + 3]! | 0x0f;
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
