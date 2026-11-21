import { getAssetUrl } from './assets';

/**
 * Frames for printed documents (Khmer «ក្បាច់» borders, the gold name plaque).
 * The app ships the teacher's templates (public/images/frames, teacher's decision 2026-11-20);
 * a teacher can also upload their own image, stored only in this browser (settings table,
 * so it also travels in backups).
 */
export type DocumentBorderKey = 'certificateBorder' | 'honorRollBorder' | 'honorRollNameBanner';

export type CertificateRank = 1 | 2 | 3;
export const CERTIFICATE_RANKS: readonly CertificateRank[] = [1, 2, 3] as const;

export type CertificateRankBorderKey = `certificateBorder_${CertificateRank}`;

export function certificateRankBorderKey(rank: CertificateRank): CertificateRankBorderKey {
  return `certificateBorder_${rank}`;
}

export interface DocumentBorderImage {
  /** Image URL: a data URL (uploaded) or a built-in asset URL. */
  dataUrl: string;
  width: number;
  height: number;
  /** Original file name or built-in frame name, shown to the teacher. */
  fileName?: string;
  /** Draw turned 90° (a built-in landscape frame on a portrait page). Uploads are turned already. */
  rotate?: boolean;
  /**
   * Width of the frame on each side as a fraction of the page (as drawn), measured to the
   * innermost line of the frame, so the text can be kept clear of it.
   */
  inner?: FrameInset;
}

export interface FrameInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Page padding (mm) that keeps the text `marginMm` clear of the frame, never below `minMm`. */
export function framePaddingMm(
  inner: FrameInset | undefined,
  pageWidthMm: number,
  pageHeightMm: number,
  minMm: FrameInset,
  marginMm = 4
): FrameInset {
  const side = (frac: number | undefined, dim: number, min: number) =>
    Math.max(min, frac === undefined ? min : Math.ceil(frac * dim + marginMm));
  return {
    top: side(inner?.top, pageHeightMm, minMm.top),
    right: side(inner?.right, pageWidthMm, minMm.right),
    bottom: side(inner?.bottom, pageHeightMm, minMm.bottom),
    left: side(inner?.left, pageWidthMm, minMm.left),
  };
}

/** A frame shipped with the app. */
export interface BuiltInFrame {
  id: string;
  label: string;
  /** Path under public/ (resolved with getAssetUrl). */
  path: string;
  width: number;
  height: number;
  /** Frame width per side (fraction of the image), measured from the image to its innermost line. */
  inner: FrameInset;
}

/** Page frames (landscape images; turned for portrait pages). */
export const BUILT_IN_PAGE_FRAMES: BuiltInFrame[] = [
  {
    id: 'frame-orange',
    label: 'ក្បាច់ទឹកក្រូច',
    path: 'images/frames/frame-orange.jpg',
    width: 2048,
    height: 1403,
    inner: { top: 0.083, right: 0.06, bottom: 0.086, left: 0.059 },
  },
  {
    id: 'frame-blue',
    label: 'ក្បាច់ខៀវ',
    path: 'images/frames/frame-blue.jpg',
    width: 2048,
    height: 1403,
    inner: { top: 0.083, right: 0.06, bottom: 0.086, left: 0.059 },
  },
  {
    id: 'frame-gold',
    label: 'ក្បាច់មាស',
    path: 'images/frames/frame-gold.jpg',
    width: 2048,
    height: 1404,
    inner: { top: 0.1, right: 0.084, bottom: 0.1, left: 0.083 },
  },
  {
    id: 'frame-gold-crest',
    label: 'ក្បាច់មាស (កំពូល)',
    path: 'images/frames/frame-gold-crest.jpg',
    width: 2048,
    height: 1449,
    inner: { top: 0.164, right: 0.072, bottom: 0.164, left: 0.071 },
  },
  {
    id: 'frame-peach',
    label: 'ក្បាច់ស្រាល',
    path: 'images/frames/frame-peach.jpg',
    width: 2048,
    height: 1417,
    inner: { top: 0.117, right: 0.079, bottom: 0.117, left: 0.079 },
  },
  {
    id: 'frame-blue-lace',
    label: 'ក្បាច់ខៀវស្រាល',
    path: 'images/frames/frame-blue-lace.jpg',
    width: 2048,
    height: 1405,
    inner: { top: 0.083, right: 0.057, bottom: 0.083, left: 0.056 },
  },
  {
    id: 'frame-gold-rings',
    label: 'ស៊ុមមាសរង្វង់',
    path: 'images/frames/frame-gold-rings.jpg',
    width: 2048,
    height: 1448,
    inner: { top: 0.095, right: 0.064, bottom: 0.095, left: 0.063 },
  },
];

/** Name plaques for the honor roll (transparent PNG). */
export const BUILT_IN_NAME_PLAQUES: BuiltInFrame[] = [
  {
    id: 'plaque-gold',
    label: 'ផ្ទាំងមាស',
    path: 'images/frames/name-plaque.png',
    width: 1200,
    height: 347,
    inner: { top: 0, right: 0, bottom: 0, left: 0 },
  },
];

/** Which built-in choices each document offers, and its default (null = the drawn indigo frame). */
export const DOCUMENT_FRAME_CHOICES: Record<
  DocumentBorderKey,
  { frames: BuiltInFrame[]; defaultId: string | null }
> = {
  certificateBorder: { frames: BUILT_IN_PAGE_FRAMES, defaultId: 'frame-orange' },
  // The crest frame's ornaments land in the middle of the long sides on a portrait page and
  // leave too little width for the photos, so it is offered for the certificate only.
  honorRollBorder: {
    frames: BUILT_IN_PAGE_FRAMES.filter((f) => f.id !== 'frame-gold-crest'),
    defaultId: null,
  },
  honorRollNameBanner: { frames: BUILT_IN_NAME_PLAQUES, defaultId: 'plaque-gold' },
};

/** What is stored in settings: an uploaded image, or the id of a built-in frame (or of none). */
export type StoredDocumentBorder = DocumentBorderImage | { presetId: string | null };

/** Page orientation of each document that can carry a border image. */
export const DOCUMENT_BORDER_ORIENTATION: Record<DocumentBorderKey, 'landscape' | 'portrait'> = {
  certificateBorder: 'landscape',
  honorRollBorder: 'portrait',
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
  honorRollBorder: { transparent: false, maxLongSide: 2400 },
  honorRollNameBanner: { transparent: true, maxLongSide: 1200 },
};

export function builtInFrameImage(
  key: DocumentBorderKey,
  frame: BuiltInFrame
): DocumentBorderImage {
  const frameIsLandscape = frame.width >= frame.height;
  const rotate = frameIsLandscape !== (DOCUMENT_BORDER_ORIENTATION[key] === 'landscape');
  const i = frame.inner;
  return {
    dataUrl: getAssetUrl(frame.path),
    width: frame.width,
    height: frame.height,
    fileName: frame.label,
    rotate,
    // Turned 90° clockwise: the image's left side becomes the page's top, and so on.
    inner: rotate ? { top: i.left, right: i.top, bottom: i.right, left: i.bottom } : i,
  };
}

/** The teacher's current choice for a document: 'upload', a built-in id, or null (drawn frame). */
export function documentBorderSelection(key: DocumentBorderKey, stored: unknown): string | null {
  if (isDocumentBorderImage(stored)) return 'upload';
  if (stored && typeof stored === 'object' && 'presetId' in stored) {
    const id = (stored as { presetId: unknown }).presetId;
    if (id === null) return null;
    if (typeof id === 'string' && DOCUMENT_FRAME_CHOICES[key].frames.some((f) => f.id === id)) {
      return id;
    }
  }
  return DOCUMENT_FRAME_CHOICES[key].defaultId;
}

/** Image to draw for a document, or undefined for the drawn (built-in SVG) frame. */
export function resolveDocumentBorder(
  key: DocumentBorderKey,
  stored: unknown
): DocumentBorderImage | undefined {
  if (isDocumentBorderImage(stored)) return stored;
  const id = documentBorderSelection(key, stored);
  const frame = DOCUMENT_FRAME_CHOICES[key].frames.find((f) => f.id === id);
  return frame ? builtInFrameImage(key, frame) : undefined;
}

/**
 * Resolves a per-rank certificate frame override (`certificateBorder_1` / `_2` / `_3`).
 * Returns `undefined` when no override is stored so the caller falls back to the shared
 * `certificateBorder` setting.
 */
export function resolveCertificateRankBorder(stored: unknown): DocumentBorderImage | undefined {
  if (stored === undefined || stored === null) return undefined;
  return resolveDocumentBorder('certificateBorder', stored);
}

/**
 * Current selection for a specific certificate rank: `'inherit'` when using the shared frame,
 * `'upload'` when an image was uploaded for this rank, or a built-in frame ID.
 */
export function certificateRankBorderSelection(stored: unknown): string {
  if (stored === undefined || stored === null) return 'inherit';
  if (isDocumentBorderImage(stored)) return 'upload';
  if (stored && typeof stored === 'object' && 'presetId' in stored) {
    const id = (stored as { presetId: unknown }).presetId;
    if (
      typeof id === 'string' &&
      DOCUMENT_FRAME_CHOICES.certificateBorder.frames.some((f) => f.id === id)
    ) {
      return id;
    }
  }
  return 'inherit';
}

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

  let inner: FrameInset | undefined;
  if (!transparent) {
    try {
      inner = measureFrameInset(ctx.getImageData(0, 0, outW, outH));
    } catch {
      inner = undefined;
    }
  }

  return {
    dataUrl: transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality),
    width: outW,
    height: outH,
    fileName: file.name,
    ...(inner ? { inner } : {}),
  };
}

/**
 * Frame width per side, as fractions: from the centre of the image, walk outwards along a few
 * lines until the first non-white pixel (the innermost line of the frame) and keep the deepest.
 */
export function measureFrameInset(
  data: Pick<ImageData, 'data' | 'width' | 'height'>,
  threshold = 235
): FrameInset {
  const { width: W, height: H } = data;
  const lum = (x: number, y: number) => {
    const o = (y * W + x) * 4;
    return 0.299 * data.data[o] + 0.587 * data.data[o + 1] + 0.114 * data.data[o + 2];
  };
  const fractions = [0.2, 0.35, 0.5, 0.65, 0.8];
  const walk = (x0: number, y0: number, dx: number, dy: number): number => {
    let x = x0;
    let y = y0;
    let steps = 0;
    while (x >= 0 && y >= 0 && x < W && y < H) {
      if (lum(x, y) < threshold) return steps;
      x += dx;
      y += dy;
      steps += 1;
    }
    return steps;
  };
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;
  for (const f of fractions) {
    const x = Math.floor(W * f);
    const y = Math.floor(H * f);
    top = Math.max(top, (cy - walk(x, cy, 0, -1)) / H);
    bottom = Math.max(bottom, 1 - (cy + walk(x, cy, 0, 1)) / H);
    left = Math.max(left, (cx - walk(cx, y, -1, 0)) / W);
    right = Math.max(right, 1 - (cx + walk(cx, y, 1, 0)) / W);
  }
  return { top, right, bottom, left };
}
