export const MAX_PHOTO_SIDE_PX = 400;
export const MAX_PHOTO_BYTES = 150 * 1024;

export async function rawBlobToDataUrl(blob: Blob): Promise<string> {
  if (!blob || typeof blob !== 'object') {
    throw new Error('Unreadable photo blob');
  }

  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result || !result.startsWith('data:')) {
            reject(new Error('Failed to decode photo blob as data URL'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read photo blob'));
        reader.readAsDataURL(blob);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to read photo blob'));
      }
    });
  }

  if (typeof blob.arrayBuffer !== 'function') {
    throw new Error('Unreadable photo blob: arrayBuffer is not available');
  }

  try {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const mime = blob.type || 'image/jpeg';
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (err) {
    throw err instanceof Error ? err : new Error('Failed to read photo blob');
  }
}

export function dataUrlToPhotoBlob(dataUrl: string): Blob | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:')) return undefined;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return undefined;
  const header = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return undefined;
  }
}

/**
 * Converts a student photo Blob into a compressed JPEG Data URL (max side 400px, <= 150 KB).
 * In headless/jsdom tests where Image/Canvas decoding is unavailable, falls back to the raw Data URL.
 */
export async function compressPhotoBlobForSync(blob: Blob): Promise<string> {
  const rawDataUrl = await rawBlobToDataUrl(blob);

  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    blob.size <= MAX_PHOTO_BYTES
  ) {
    return rawDataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
      el.src = rawDataUrl;
    });

    const w = img.naturalWidth || img.width || MAX_PHOTO_SIDE_PX;
    const h = img.naturalHeight || img.height || MAX_PHOTO_SIDE_PX;
    const scale = Math.min(1, MAX_PHOTO_SIDE_PX / Math.max(w, h, 1));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const candidate = canvas.toDataURL('image/jpeg', quality);
      if (candidate.startsWith('data:image/jpeg') && candidate.length <= MAX_PHOTO_BYTES * 1.37) {
        return candidate;
      }
    }
    return canvas.toDataURL('image/jpeg', 0.35);
  } catch {
    return rawDataUrl;
  }
}
