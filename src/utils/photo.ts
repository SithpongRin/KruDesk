/**
 * Center-crops a student photo to 3:4 aspect ratio and compresses it to a JPEG Blob
 * with max height 600 px (i.e. max 450 x 600 px, quality ~0.85) so IndexedDB and
 * JSON backups stay small while keeping sharp print quality.
 */
export async function cropAndCompressPhoto3x4(
  file: File,
  maxHeight = 600,
  quality = 0.85
): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cannot read image file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Cannot decode image'));
    el.src = dataUrl;
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Invalid image dimensions');
  }

  const targetRatio = 3 / 4; // 0.75
  const srcRatio = srcW / srcH;

  let sx = 0;
  let sy = 0;
  let cropW = srcW;
  let cropH = srcH;

  if (srcRatio > targetRatio) {
    // Wider than 3:4 -> crop sides
    cropW = srcH * targetRatio;
    sx = (srcW - cropW) / 2;
  } else if (srcRatio < targetRatio) {
    // Taller than 3:4 -> crop top/bottom
    cropH = srcW / targetRatio;
    sy = (srcH - cropH) / 2;
  }

  const outH = Math.min(maxHeight, Math.max(1, Math.round(cropH)));
  const outW = Math.max(1, Math.round(outH * targetRatio));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode JPEG blob'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}
