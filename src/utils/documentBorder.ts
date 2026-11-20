/**
 * Border images the teacher picks for printed documents (e.g. a Khmer «ក្បាច់» frame).
 * They are stored only in this browser (settings table, so they also travel in backups) —
 * never shipped with the app, because such artwork usually belongs to someone else.
 */
export type DocumentBorderKey = 'certificateBorder' | 'honorRollNameBanner';

export interface DocumentBorderImage {
  /** JPEG (or PNG for name banners) data URL, already turned to the page's orientation. */
  dataUrl: string;
  width: number;
  height: number;
  /** Original file name, shown to the teacher. */
  fileName?: string;
}

/** Page orientation of each document that can carry a border image. */
export const DOCUMENT_BORDER_ORIENTATION: Record<DocumentBorderKey, 'landscape' | 'portrait'> = {
  certificateBorder: 'landscape',
  honorRollNameBanner: 'landscape',
};

/**
 * Name banners are small and drawn over the photo, so they keep their transparency (PNG)
 * and need fewer pixels; page frames become JPEG on white.
 */
export const DOCUMENT_BORDER_FORMAT: Record<
  DocumentBorderKey,
  { transparent: boolean; maxLongSide: number }
> = {
  certificateBorder: { transparent: false, maxLongSide: 2400 },
  honorRollNameBanner: { transparent: true, maxLongSide: 1200 },
};

export function isDocumentBorderImage(value: unknown): value is DocumentBorderImage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DocumentBorderImage>;
  return (
    typeof v.dataUrl === 'string' &&
    v.dataUrl.startsWith('data:image/') &&
    typeof v.width === 'number' &&
    typeof v.height === 'number'
  );
}

/**
 * Reads an image file, turns it 90° when its orientation does not match the page
 * (a landscape frame becomes a portrait frame), scales the long side down to `maxLongSide`
 * and re-encodes it as JPEG on a white background (keeps backups small), or as PNG when
 * `transparent` is set (name banners laid over photos).
 */
export async function prepareDocumentBorderImage(
  file: File,
  orientation: 'landscape' | 'portrait',
  maxLongSide = 2400,
  quality = 0.9,
  transparent = false
): Promise<DocumentBorderImage> {
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

  const srcIsLandscape = srcW >= srcH;
  const rotate = srcIsLandscape !== (orientation === 'landscape');
  const scale = Math.min(1, maxLongSide / Math.max(srcW, srcH));
  const drawW = Math.max(1, Math.round(srcW * scale));
  const drawH = Math.max(1, Math.round(srcH * scale));
  const outW = rotate ? drawH : drawW;
  const outH = rotate ? drawW : drawH;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  if (!transparent) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (rotate) {
    ctx.translate(outW, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(img, 0, 0, drawW, drawH);

  return {
    dataUrl: transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality),
    width: outW,
    height: outH,
    fileName: file.name,
  };
}
