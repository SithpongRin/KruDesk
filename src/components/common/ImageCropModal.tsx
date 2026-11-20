import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { AppleModal } from './AppleModal';
import { AppleButton } from './AppleButton';
import {
  cleanSealCanvas,
  DEFAULT_SEAL_CLEAN,
  sealImageFromCanvas,
  type SealCleanOptions,
  type SealImage,
} from '../../utils/directorSeal';

/** Crop rectangle in the (rotated) image's own pixels. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageCropModalProps {
  file: File | null;
  title: string;
  onCancel: () => void;
  /** Receives the turned, cropped and cleaned image, exactly as previewed. */
  onConfirm: (image: SealImage) => void | Promise<void>;
  /**
   * Shows the cleaned image where it will be printed (e.g. in the signature block);
   * `widthPx` is the room available in the dialog.
   */
  renderPreview?: (image: SealImage, widthPx: number) => React.ReactNode;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const VIEW_MAX_W = 420;
const VIEW_MAX_H = 360;
const MIN_CROP_PX = 12;

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot decode image'));
    img.src = src;
  });
}

/** Draws `img` turned by `quarterTurns` × 90° clockwise onto a new canvas. */
function rotatedCanvas(img: HTMLImageElement, quarterTurns: number): HTMLCanvasElement {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = turns % 2 ? h : w;
  canvas.height = turns % 2 ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

/**
 * Lets the teacher turn the photo and drag a box around the stamp or signature before it is
 * saved (phone photos are often sideways and include the whole page).
 */
export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  file,
  title,
  onCancel,
  onConfirm,
  renderPreview,
}) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [turns, setTurns] = useState(0);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [clean, setClean] = useState<SealCleanOptions>(DEFAULT_SEAL_CLEAN);
  const [preview, setPreview] = useState<SealImage | null>(null);
  const [previewEmpty, setPreviewEmpty] = useState(false);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(400);
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPreviewWidth(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, [file]);
  // Kept in a ref so a new onCancel function from the parent does not reload the image.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; start: CropRect } | null>(
    null
  );

  // Load the picked file.
  useEffect(() => {
    if (!file) {
      setImg(null);
      return;
    }
    const url = URL.createObjectURL(file);
    let cancelled = false;
    loadImage(url)
      .then((loaded) => {
        if (!cancelled) {
          setImg(loaded);
          setTurns(0);
        }
      })
      .catch(() => {
        if (!cancelled) onCancelRef.current();
      });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Rotate, then start with a box covering the whole image (less 4% at each edge).
  useEffect(() => {
    if (!img) {
      setSource(null);
      return;
    }
    const canvas = rotatedCanvas(img, turns);
    setSource(canvas);
    const mx = Math.round(canvas.width * 0.04);
    const my = Math.round(canvas.height * 0.04);
    setCrop({ x: mx, y: my, w: canvas.width - 2 * mx, h: canvas.height - 2 * my });
  }, [img, turns]);

  // On a phone the dialog is narrower than VIEW_MAX_W.
  const maxViewW = Math.max(
    200,
    Math.min(VIEW_MAX_W, (typeof window !== 'undefined' ? window.innerWidth : 800) - 110)
  );
  const scale = source ? Math.min(maxViewW / source.width, VIEW_MAX_H / source.height, 1) : 1;
  const viewW = source ? Math.round(source.width * scale) : 0;
  const viewH = source ? Math.round(source.height * scale) : 0;

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !source) return;
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      const s = d.start;
      let { x, y, w, h } = s;
      if (d.mode === 'move') {
        x = Math.min(Math.max(0, s.x + dx), source.width - s.w);
        y = Math.min(Math.max(0, s.y + dy), source.height - s.h);
      } else {
        const left = d.mode === 'nw' || d.mode === 'sw';
        const top = d.mode === 'nw' || d.mode === 'ne';
        if (left) {
          x = Math.min(Math.max(0, s.x + dx), s.x + s.w - MIN_CROP_PX);
          w = s.x + s.w - x;
        } else {
          w = Math.min(Math.max(MIN_CROP_PX, s.w + dx), source.width - s.x);
        }
        if (top) {
          y = Math.min(Math.max(0, s.y + dy), s.y + s.h - MIN_CROP_PX);
          h = s.y + s.h - y;
        } else {
          h = Math.min(Math.max(MIN_CROP_PX, s.h + dy), source.height - s.y);
        }
      }
      setCrop({ x, y, w, h });
    },
    [scale, source]
  );

  useEffect(() => {
    const up = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', up);
    };
  }, [onPointerMove]);

  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: crop };
  };

  /** The crop box as its own canvas, scaled so its long side is at most `maxSide`. */
  const cropCanvas = useCallback(
    (maxSide: number): HTMLCanvasElement | null => {
      if (!source || !crop) return null;
      const k = Math.min(1, maxSide / Math.max(crop.w, crop.h));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(crop.w * k));
      out.height = Math.max(1, Math.round(crop.h * k));
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
      return out;
    },
    [source, crop]
  );

  // Live preview of the result while the box is dragged or the options change.
  useEffect(() => {
    if (!source || !crop) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const cropped = cropCanvas(700);
      const cleaned = cropped ? cleanSealCanvas(cropped, clean, 600) : null;
      setPreviewEmpty(!cleaned);
      setPreview(cleaned ? sealImageFromCanvas(cleaned) : null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [source, crop, clean, cropCanvas]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const cropped = cropCanvas(1600);
      const cleaned = cropped ? cleanSealCanvas(cropped, clean, 900) : null;
      if (cleaned) await onConfirm(sealImageFromCanvas(cleaned));
    } finally {
      setBusy(false);
    }
  };

  const sourceUrl = useMemo(() => (source ? source.toDataURL('image/png') : ''), [source]);

  const handle = (mode: DragMode, left: string, top: string) => (
    <span
      onPointerDown={startDrag(mode)}
      className="absolute w-4 h-4 rounded-full bg-white border-2 border-[#0071e3] shadow touch-none"
      style={{ left, top, transform: 'translate(-50%, -50%)', cursor: `${mode}-resize` }}
    />
  );

  return (
    <AppleModal
      isOpen={Boolean(file)}
      onClose={onCancel}
      title={title}
      subtitle="អូសប្រអប់ពណ៌ខៀវឱ្យនៅជុំវិញត្រា ឬហត្ថលេខា — រូបខាងស្ដាំជាលទ្ធផលដែលនឹងបោះពុម្ព"
      maxWidth="2xl"
      footer={
        <>
          <AppleButton
            type="button"
            variant="secondary"
            size="sm"
            icon={<RotateCw size={14} />}
            onClick={() => setTurns((t) => t + 1)}
            disabled={!source || busy}
          >
            បង្វិល
          </AppleButton>
          <AppleButton type="button" variant="secondary" size="sm" onClick={onCancel}>
            បោះបង់
          </AppleButton>
          <AppleButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={!source || !crop || busy || previewEmpty}
          >
            {busy ? 'កំពុងរៀបចំ...' : 'ប្រើរូបនេះ'}
          </AppleButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-center">
          <div className="flex justify-center">
            {source && crop ? (
              // The outer frame clips the dark shading around the box (it must not dim the preview)
              // and leaves room for the corner handles.
              <div className="overflow-hidden rounded-lg p-2 bg-black/40">
                <div
                  className="relative select-none bg-[repeating-conic-gradient(#eee_0%_25%,#fff_0%_50%)] [background-size:16px_16px]"
                  style={{ width: viewW, height: viewH }}
                >
                  <img
                    src={sourceUrl}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 w-full h-full"
                  />
                  {/* the crop box; everything outside it is dimmed */}
                  <div
                    className="absolute border-2 border-[#0071e3] touch-none"
                    style={{
                      left: crop.x * scale,
                      top: crop.y * scale,
                      width: crop.w * scale,
                      height: crop.h * scale,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                      cursor: 'move',
                    }}
                    onPointerDown={startDrag('move')}
                  >
                    {handle('nw', '0%', '0%')}
                    {handle('ne', '100%', '0%')}
                    {handle('sw', '0%', '100%')}
                    {handle('se', '100%', '100%')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center text-sm text-[#86868b]">កំពុងបើករូប...</div>
            )}
          </div>

          <div className="w-full md:w-[240px] shrink-0 space-y-3">
            <label className="flex items-center gap-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clean.enhance}
                onChange={(e) => setClean((c) => ({ ...c, enhance: e.target.checked }))}
                className="w-4 h-4 accent-[#0071e3]"
              />
              ធ្វើឱ្យច្បាស់ (ពណ៌ដិត)
            </label>
            <div>
              <div className="flex justify-between text-[11px] text-[#86868b] mb-1">
                <span>លុបផ្ទៃក្រដាស</span>
                <span>
                  {clean.strength === 0
                    ? 'ស្វ័យប្រវត្តិ'
                    : clean.strength > 0
                      ? `+${clean.strength}`
                      : clean.strength}
                </span>
              </div>
              <input
                type="range"
                aria-label="លុបផ្ទៃក្រដាស"
                min={-30}
                max={60}
                step={2}
                value={clean.strength}
                onChange={(e) => setClean((c) => ({ ...c, strength: Number(e.target.value) }))}
                className="w-full accent-[#0071e3]"
              />
              <div className="flex justify-between text-[10px] text-[#86868b]">
                <span>តិច (ទុកទឹកខ្មៅស្រាល)</span>
                <span>ច្រើន (លុបស្រមោល)</span>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">
            លទ្ធផលលើឯកសារ
          </div>
          <div
            ref={previewBoxRef}
            className="rounded-xl bg-white border border-black/[0.08] overflow-hidden min-h-[120px] flex items-center justify-center p-3"
          >
            {preview ? (
              renderPreview ? (
                renderPreview(preview, previewWidth)
              ) : (
                <img
                  src={preview.dataUrl}
                  alt=""
                  className="max-h-[180px] max-w-full object-contain"
                />
              )
            ) : (
              <span className="text-xs text-[#86868b] text-center px-2">
                {previewEmpty ? 'មិនឃើញត្រា ឬហត្ថលេខា — សូមបន្ថយការលុបផ្ទៃ' : '...'}
              </span>
            )}
          </div>
        </div>
      </div>
    </AppleModal>
  );
};
