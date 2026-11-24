import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Loader2,
  Minimize2,
  Move,
  PenTool,
  RotateCcw,
  Stamp,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { setSetting } from '../../db/database';
import { MIN_READABLE_FIT_SCALE } from '../../print/fitOnePage';
import { computePageStampRectFrac, computePageTeacherSignRectFrac } from '../../services/pdfExport';
import { useAppStore } from '../../store/useAppStore';
import { usePdfPreviewStore } from '../../store/usePdfPreviewStore';
import {
  DEFAULT_STAMP_SCALE,
  MAX_STAMP_SCALE,
  MIN_STAMP_SCALE,
  STAMP_OPACITY,
  clampStampOffsetMm,
  clampStampScale,
  prepareSealImage,
  type SealImage,
} from '../../utils/directorSeal';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleButton } from './AppleButton';
import { AppleModal } from './AppleModal';

/** Which on-page overlay a drag belongs to: the director's stamp or the teacher's signature. */
type OverlayTarget = 'stamp' | 'teacher';

/** Page geometry a move drag needs (shared by seal and teacher anchors). */
interface MoveAnchor {
  pageWidthMm: number;
  pageHeightMm: number;
  fitScale?: number;
}

type DragState =
  | {
      kind: 'move';
      target: OverlayTarget;
      pointerId: number;
      startX: number;
      startY: number;
      startOffsetXMm: number;
      startOffsetYMm: number;
      pageWidthPx: number;
      pageHeightPx: number;
      pageWidthMm: number;
      pageHeightMm: number;
      fitScale: number;
    }
  | {
      kind: 'resize';
      target: OverlayTarget;
      pointerId: number;
      startX: number;
      centerX: number;
      centerY: number;
      startDist: number;
      hasLayoutBox: boolean;
      startScale: number;
    };

const CORNERS: Array<{
  id: 'nw' | 'ne' | 'sw' | 'se';
  posClass: string;
  cursorClass: string;
}> = [
  { id: 'nw', posClass: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursorClass: 'cursor-nwse-resize' },
  { id: 'ne', posClass: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursorClass: 'cursor-nesw-resize' },
  { id: 'sw', posClass: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursorClass: 'cursor-nesw-resize' },
  { id: 'se', posClass: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursorClass: 'cursor-nwse-resize' },
];

/**
 * «មើលមុន» before every PDF download. Shows the exact page images the PDF is built from,
 * plus:
 *  - «បង្រួមដាក់ក្នុង ១ ទំព័រ (Optimize)» toggle for multi-page class tables, and
 *  - an interactive director stamp («ត្រាសាលា») directly on the document that the user can
 *    freely resize (corner handles or slider) and nudge into place before downloading, and
 *  - the same for the teacher's signature («ហត្ថលេខាគ្រូ»), independently of the stamp.
 */
export const PdfPreviewModal: React.FC = () => {
  const request = usePdfPreviewStore((s) => s.request);
  const close = usePdfPreviewStore((s) => s.close);
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const addToast = useAppStore((s) => s.addToast);
  const fmt = (n: number | string) => (useKhmerNumerals ? toKhmerNumerals(n) : String(n));

  const [stampImage, setStampImage] = useState<SealImage | undefined>(undefined);
  const [stampEnabled, setStampEnabled] = useState(false);
  const [scale, setScale] = useState(DEFAULT_STAMP_SCALE);
  const [offsetXMm, setOffsetXMm] = useState(0);
  const [offsetYMm, setOffsetYMm] = useState(0);
  const [teacherSigImage, setTeacherSigImage] = useState<SealImage | undefined>(undefined);
  const [teacherSigEnabled, setTeacherSigEnabled] = useState(false);
  const [teacherScale, setTeacherScale] = useState(DEFAULT_STAMP_SCALE);
  const [teacherOffsetXMm, setTeacherOffsetXMm] = useState(0);
  const [teacherOffsetYMm, setTeacherOffsetYMm] = useState(0);
  const [interactingTarget, setInteractingTarget] = useState<OverlayTarget | null>(null);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingTeacherSig, setUploadingTeacherSig] = useState(false);
  const [togglingFit, setTogglingFit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = useRef<DragState | null>(null);
  const openedFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (!request) {
      openedFileRef.current = null;
      dragRef.current = null;
      setInteractingTarget(null);
      setTogglingFit(false);
      return;
    }
    // Only reset stamp state when a brand-new preview opens, NOT when updateRequest swaps pages
    // for Fit-to-1-Page (so the user's chosen stamp toggle, size, and nudge are preserved!).
    if (openedFileRef.current !== request.fileName) {
      openedFileRef.current = request.fileName;
      setStampImage(request.initialStamp);
      setStampEnabled(Boolean(request.initialStampEnabled && request.initialStamp));
      setScale(clampStampScale(request.initialStampScale ?? DEFAULT_STAMP_SCALE));
      setOffsetXMm(clampStampOffsetMm(request.initialStampOffsetXMm ?? 0));
      setOffsetYMm(clampStampOffsetMm(request.initialStampOffsetYMm ?? 0));
      setTeacherSigImage(request.initialTeacherSignature);
      setTeacherSigEnabled(
        Boolean(request.initialTeacherSignatureEnabled && request.initialTeacherSignature)
      );
      setTeacherScale(clampStampScale(request.initialTeacherSignatureScale ?? DEFAULT_STAMP_SCALE));
      setTeacherOffsetXMm(clampStampOffsetMm(request.initialTeacherSignatureOffsetXMm ?? 0));
      setTeacherOffsetYMm(clampStampOffsetMm(request.initialTeacherSignatureOffsetYMm ?? 0));
      setInteractingTarget(null);
      dragRef.current = null;
    }
  }, [request]);

  if (!request) return null;
  const {
    pages,
    fileName,
    orientation,
    sealAnchors,
    teacherAnchors,
    canFitOnePage,
    fitOnePage = false,
    minFitScale = 1,
    minPrintedFontPt,
    onToggleFitOnePage,
  } = request;
  const total = pages.length;
  const hasAnchors = Boolean(sealAnchors && sealAnchors.some((a) => a !== null));
  const hasTeacherAnchors = Boolean(teacherAnchors && teacherAnchors.some((a) => a !== null));
  const showToolbar = Boolean(
    hasAnchors || hasTeacherAnchors || (canFitOnePage && onToggleFitOnePage)
  );

  const handleToggleOptimize = async (nextFit: boolean) => {
    if (!onToggleFitOnePage || togglingFit) return;
    setTogglingFit(true);
    try {
      await onToggleFitOnePage(nextFit);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'មិនអាចបង្រួមទំព័របានទេ',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTogglingFit(false);
    }
  };

  const handleResetStamp = () => {
    setScale(DEFAULT_STAMP_SCALE);
    setOffsetXMm(0);
    setOffsetYMm(0);
  };

  const stepScale = (delta: number) => {
    setScale((prev) => clampStampScale(Math.round((prev + delta) * 100) / 100));
  };

  const handleResetTeacher = () => {
    setTeacherScale(DEFAULT_STAMP_SCALE);
    setTeacherOffsetXMm(0);
    setTeacherOffsetYMm(0);
  };

  const stepTeacherScale = (delta: number) => {
    setTeacherScale((prev) => clampStampScale(Math.round((prev + delta) * 100) / 100));
  };

  const handleUploadTeacherFile = async (file: File) => {
    setUploadingTeacherSig(true);
    try {
      const cleaned = await prepareSealImage(file);
      // Saved as the default only when none was stored yet; a quick swap applies to this export only.
      if (!teacherSigImage) {
        await setSetting<SealImage>('teacherSignature', cleaned);
      }
      setTeacherSigImage(cleaned);
      setTeacherSigEnabled(true);
      addToast({ type: 'success', title: 'បានបញ្ចូលហត្ថលេខាគ្រូ — អូសជ្រុងលើឯកសារដើម្បីកែទំហំ' });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'មិនអាចអានរូបហត្ថលេខាបានទេ',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploadingTeacherSig(false);
    }
  };

  const handleUploadStampFile = async (file: File) => {
    setUploadingStamp(true);
    try {
      const cleaned = await prepareSealImage(file);
      // Save as default in Settings only when no official stamp was stored yet;
      // otherwise apply to this export only so a quick swap never overwrites Settings.
      if (!stampImage) {
        await setSetting<SealImage>('directorStamp', cleaned);
      }
      setStampImage(cleaned);
      setStampEnabled(true);
      addToast({ type: 'success', title: 'បានបញ្ចូលត្រាសាលា — អូសជ្រុងលើឯកសារដើម្បីកែទំហំ' });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'មិនអាចអានរូបត្រាបានទេ',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploadingStamp(false);
    }
  };

  const handleDownload = () => {
    close(
      true,
      hasAnchors
        ? {
            enabled: Boolean(stampEnabled && stampImage),
            stamp: stampImage,
            scale: clampStampScale(scale),
            offsetXMm: clampStampOffsetMm(offsetXMm),
            offsetYMm: clampStampOffsetMm(offsetYMm),
          }
        : undefined,
      hasTeacherAnchors
        ? {
            enabled: Boolean(teacherSigEnabled && teacherSigImage),
            signature: teacherSigImage,
            scale: clampStampScale(teacherScale),
            offsetXMm: clampStampOffsetMm(teacherOffsetXMm),
            offsetYMm: clampStampOffsetMm(teacherOffsetYMm),
          }
        : undefined
    );
  };

  const startMove = (
    e: React.PointerEvent<HTMLDivElement>,
    pageIdx: number,
    anchor: MoveAnchor,
    target: OverlayTarget
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    const pageEl = pageRefs.current[pageIdx];
    const pr = pageEl?.getBoundingClientRect();
    const fitScale =
      typeof anchor.fitScale === 'number' && Number.isFinite(anchor.fitScale) && anchor.fitScale > 0
        ? anchor.fitScale
        : 1;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events in JSDOM may not register active pointer ids.
    }
    dragRef.current = {
      kind: 'move',
      target,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetXMm: target === 'teacher' ? teacherOffsetXMm : offsetXMm,
      startOffsetYMm: target === 'teacher' ? teacherOffsetYMm : offsetYMm,
      pageWidthPx: pr && pr.width > 0 ? pr.width : 800,
      pageHeightPx: pr && pr.height > 0 ? pr.height : 600,
      pageWidthMm: anchor.pageWidthMm,
      pageHeightMm: anchor.pageHeightMm,
      fitScale,
    };
    setInteractingTarget(target);
  };

  const startResize = (
    e: React.PointerEvent<HTMLDivElement>,
    boxEl: HTMLDivElement | null,
    target: OverlayTarget
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    const br = boxEl?.getBoundingClientRect();
    const hasLayoutBox = Boolean(br && br.width > 0 && br.height > 0);
    const centerX = hasLayoutBox && br ? br.left + br.width / 2 : 0;
    const centerY = hasLayoutBox && br ? br.top + br.height / 2 : 0;
    const startDist = hasLayoutBox ? Math.max(12, Math.hypot(e.clientX - centerX, e.clientY - centerY)) : 100;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore in JSDOM.
    }
    dragRef.current = {
      kind: 'resize',
      target,
      pointerId: e.pointerId,
      startX: e.clientX,
      centerX,
      centerY,
      startDist,
      hasLayoutBox,
      startScale: target === 'teacher' ? teacherScale : scale,
    };
    setInteractingTarget(target);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    e.preventDefault();
    const isTeacher = st.target === 'teacher';
    if (st.kind === 'move') {
      const dxMm = ((e.clientX - st.startX) / st.pageWidthPx) * (st.pageWidthMm / st.fitScale);
      const dyMm = ((e.clientY - st.startY) / st.pageHeightPx) * (st.pageHeightMm / st.fitScale);
      const nextX = clampStampOffsetMm(Math.round((st.startOffsetXMm + dxMm) * 100) / 100);
      const nextY = clampStampOffsetMm(Math.round((st.startOffsetYMm + dyMm) * 100) / 100);
      (isTeacher ? setTeacherOffsetXMm : setOffsetXMm)(nextX);
      (isTeacher ? setTeacherOffsetYMm : setOffsetYMm)(nextY);
    } else {
      const next = st.hasLayoutBox
        ? st.startScale * (Math.hypot(e.clientX - st.centerX, e.clientY - st.centerY) / st.startDist)
        : st.startScale + (e.clientX - st.startX) / 120;
      (isTeacher ? setTeacherScale : setScale)(clampStampScale(Math.round(next * 1000) / 1000));
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setInteractingTarget(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore in JSDOM.
    }
  };

  const scalePct = Math.round(scale * 100);
  const teacherScalePct = Math.round(teacherScale * 100);
  const fitPct = Math.round(minFitScale * 100);
  const effectiveFontPt = minPrintedFontPt ?? Math.round(8.5 * minFitScale * 10) / 10;
  const approxBodyPt = effectiveFontPt.toFixed(1).replace(/\.0$/, '');
  const isVerySmallFit = fitOnePage && minFitScale < MIN_READABLE_FIT_SCALE;

  return (
    <AppleModal
      isOpen={true}
      onClose={() => close(false)}
      title="មើលមុន (Preview)"
      subtitle={`${fileName} · ${fmt(total)} ទំព័រ — ដូច PDF ដែលនឹងទាញយកទាំងស្រុង`}
      maxWidth={orientation === 'landscape' ? '6xl' : '4xl'}
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={() => close(false)} disabled={togglingFit}>
            បិទ
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            icon={<Download size={15} />}
            onClick={handleDownload}
            disabled={togglingFit}
          >
            ទាញយក PDF
          </AppleButton>
        </>
      }
    >
      {showToolbar && (
        <div
          className="sticky -top-6 z-20 -mx-6 -mt-6 mb-4 px-4 py-2.5 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur border-b border-black/[0.08] dark:border-white/[0.1] flex flex-col gap-2"
          data-testid="pdf-stamp-toolbar"
        >
          {canFitOnePage && onToggleFitOnePage && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="pdf-fit-one-page-toggle"
                    checked={fitOnePage}
                    disabled={togglingFit}
                    onChange={(e) => void handleToggleOptimize(e.target.checked)}
                    className="w-4 h-4 accent-[#0071e3]"
                  />
                  {togglingFit ? (
                    <Loader2 size={14} className="text-[#0071e3] animate-spin" />
                  ) : (
                    <Minimize2 size={14} className="text-[#0071e3]" />
                  )}
                  <span>បង្រួមដាក់ក្នុង ១ ទំព័រ (Optimize)</span>
                </label>

                {fitOnePage && !togglingFit && (
                  <span
                    data-testid="pdf-fit-scale-badge"
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#0071e3]/10 text-[#0071e3]"
                  >
                    មាត្រដ្ឋាន {fmt(fitPct)}% · អក្សរ ≈ {fmt(approxBodyPt)}pt
                  </span>
                )}
              </div>

              {isVerySmallFit && !togglingFit && (
                <div
                  data-testid="pdf-fit-small-warning"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg"
                >
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>តូចពេក អាចពិបាកអាន (ចន្លោះហត្ថលេខាក៏រួមតូចតាមមាត្រដ្ឋានដែរ)</span>
                </div>
              )}
            </div>
          )}

          {hasAnchors && (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                aria-label="បញ្ចូលរូបត្រាសាលា"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) void handleUploadStampFile(picked);
                  e.target.value = '';
                }}
              />

              {stampImage ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="pdf-stamp-toggle"
                        checked={stampEnabled}
                        onChange={(e) => setStampEnabled(e.target.checked)}
                        className="w-4 h-4 accent-[#dc2626]"
                      />
                      <Stamp size={14} className="text-[#dc2626]" />
                      <span>ដាក់ត្រាសាលាលើឯកសារ</span>
                    </label>

                    {stampEnabled && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="បង្រួមត្រា"
                          onClick={() => stepScale(-0.1)}
                          disabled={scale <= MIN_STAMP_SCALE}
                          className="p-1.5 rounded-lg bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] disabled:opacity-40 text-[#1d1d1f] dark:text-[#f5f5f7]"
                        >
                          <ZoomOut size={14} />
                        </button>
                        <input
                          type="range"
                          aria-label="ទំហំត្រា"
                          data-testid="pdf-stamp-scale-slider"
                          min={MIN_STAMP_SCALE}
                          max={MAX_STAMP_SCALE}
                          step={0.02}
                          value={scale}
                          onChange={(e) => setScale(clampStampScale(Number(e.target.value)))}
                          className="w-28 sm:w-36 accent-[#dc2626] cursor-pointer"
                        />
                        <button
                          type="button"
                          aria-label="ពង្រីកត្រា"
                          onClick={() => stepScale(0.1)}
                          disabled={scale >= MAX_STAMP_SCALE}
                          className="p-1.5 rounded-lg bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] disabled:opacity-40 text-[#1d1d1f] dark:text-[#f5f5f7]"
                        >
                          <ZoomIn size={14} />
                        </button>
                        <span
                          data-testid="pdf-stamp-scale-label"
                          className="min-w-[3rem] text-center text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-[#dc2626]/10 text-[#dc2626]"
                        >
                          {fmt(scalePct)}%
                        </span>
                        <button
                          type="button"
                          onClick={handleResetStamp}
                          title="កំណត់ទំហំ និងទីតាំងត្រាដើមវិញ"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7]"
                        >
                          <RotateCcw size={12} />
                          <span>កំណត់ដើម</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#6e6e73] dark:text-[#98989d]">
                    {stampEnabled && (
                      <span className="hidden md:inline-flex items-center gap-1">
                        <Move size={12} className="text-[#dc2626]" />
                        អូសជ្រុងត្រាលើឯកសារដើម្បីពង្រីក/បង្រួម ឬអូសត្រាដើម្បីរំកិល
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={uploadingStamp}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7]"
                    >
                      <Upload size={12} />
                      <span>ប្ដូររូបត្រា</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between w-full gap-2">
                  <span className="text-xs text-[#6e6e73] dark:text-[#98989d] flex items-center gap-1.5">
                    <Stamp size={14} className="text-[#dc2626]" />
                    <span>ចង់ដាក់ត្រាសាលា និងកែទំហំលើឯកសារនេះមែនទេ?</span>
                  </span>
                  <AppleButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Upload size={13} />}
                    disabled={uploadingStamp}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingStamp ? 'កំពុងរៀបចំ...' : 'បញ្ចូលរូបត្រាសាលា'}
                  </AppleButton>
                </div>
              )}
            </div>
          )}

          {hasTeacherAnchors && (
            <div
              data-testid="pdf-teacher-toolbar"
              className={`flex flex-wrap items-center justify-between gap-2.5 ${
                hasAnchors ? 'pt-2 border-t border-black/[0.06] dark:border-white/[0.08]' : ''
              }`}
            >
              <input
                ref={teacherFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                aria-label="បញ្ចូលរូបហត្ថលេខាគ្រូ"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) void handleUploadTeacherFile(picked);
                  e.target.value = '';
                }}
              />

              {teacherSigImage ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="pdf-teacher-sign-toggle"
                        checked={teacherSigEnabled}
                        onChange={(e) => setTeacherSigEnabled(e.target.checked)}
                        className="w-4 h-4 accent-[#0071e3]"
                      />
                      <PenTool size={14} className="text-[#0071e3]" />
                      <span>ដាក់ហត្ថលេខាគ្រូលើឯកសារ</span>
                    </label>

                    {teacherSigEnabled && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="បង្រួមហត្ថលេខាគ្រូ"
                          onClick={() => stepTeacherScale(-0.1)}
                          disabled={teacherScale <= MIN_STAMP_SCALE}
                          className="p-1.5 rounded-lg bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] disabled:opacity-40 text-[#1d1d1f] dark:text-[#f5f5f7]"
                        >
                          <ZoomOut size={14} />
                        </button>
                        <input
                          type="range"
                          aria-label="ទំហំហត្ថលេខាគ្រូ"
                          data-testid="pdf-teacher-scale-slider"
                          min={MIN_STAMP_SCALE}
                          max={MAX_STAMP_SCALE}
                          step={0.02}
                          value={teacherScale}
                          onChange={(e) => setTeacherScale(clampStampScale(Number(e.target.value)))}
                          className="w-28 sm:w-36 accent-[#0071e3] cursor-pointer"
                        />
                        <button
                          type="button"
                          aria-label="ពង្រីកហត្ថលេខាគ្រូ"
                          onClick={() => stepTeacherScale(0.1)}
                          disabled={teacherScale >= MAX_STAMP_SCALE}
                          className="p-1.5 rounded-lg bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] disabled:opacity-40 text-[#1d1d1f] dark:text-[#f5f5f7]"
                        >
                          <ZoomIn size={14} />
                        </button>
                        <span
                          data-testid="pdf-teacher-scale-label"
                          className="min-w-[3rem] text-center text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-[#0071e3]/10 text-[#0071e3]"
                        >
                          {fmt(teacherScalePct)}%
                        </span>
                        <button
                          type="button"
                          data-testid="pdf-teacher-reset"
                          onClick={handleResetTeacher}
                          title="កំណត់ទំហំ និងទីតាំងហត្ថលេខាគ្រូដើមវិញ"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7]"
                        >
                          <RotateCcw size={12} />
                          <span>កំណត់ដើម</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#6e6e73] dark:text-[#98989d]">
                    {teacherSigEnabled && (
                      <span className="hidden md:inline-flex items-center gap-1">
                        <Move size={12} className="text-[#0071e3]" />
                        អូសជ្រុងហត្ថលេខាដើម្បីពង្រីក/បង្រួម ឬអូសហត្ថលេខាដើម្បីរំកិល
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={uploadingTeacherSig}
                      onClick={() => teacherFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7]"
                    >
                      <Upload size={12} />
                      <span>ប្ដូរហត្ថលេខាគ្រូ</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between w-full gap-2">
                  <span className="text-xs text-[#6e6e73] dark:text-[#98989d] flex items-center gap-1.5">
                    <PenTool size={14} className="text-[#0071e3]" />
                    <span>ចង់ដាក់ហត្ថលេខាគ្រូ និងកែទំហំលើឯកសារនេះមែនទេ?</span>
                  </span>
                  <AppleButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Upload size={13} />}
                    disabled={uploadingTeacherSig}
                    onClick={() => teacherFileInputRef.current?.click()}
                  >
                    {uploadingTeacherSig ? 'កំពុងរៀបចំ...' : 'បញ្ចូលហត្ថលេខាគ្រូ'}
                  </AppleButton>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        className="space-y-5 bg-[#e8e8ed] dark:bg-black/40 -m-6 p-4 sm:p-6"
        data-testid="pdf-preview-pages"
      >
        {pages.map((src, idx) => {
          const anchor = sealAnchors?.[idx] ?? null;
          const stampRect =
            stampEnabled && stampImage && anchor
              ? computePageStampRectFrac(anchor, stampImage, { scale, offsetXMm, offsetYMm })
              : null;
          const teacherAnchor = teacherAnchors?.[idx] ?? null;
          const teacherRect =
            teacherSigEnabled && teacherSigImage && teacherAnchor
              ? computePageTeacherSignRectFrac(teacherAnchor, teacherSigImage, {
                  scale: teacherScale,
                  offsetXMm: teacherOffsetXMm,
                  offsetYMm: teacherOffsetYMm,
                })
              : null;

          return (
            <figure
              key={idx}
              className="mx-auto"
              style={{ maxWidth: orientation === 'landscape' ? '1100px' : '794px' }}
            >
              <div
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className="relative w-full select-none overflow-hidden bg-white shadow-[0_4px_18px_rgba(0,0,0,0.18)]"
              >
                <img
                  src={src}
                  alt={`ទំព័រ ${idx + 1}`}
                  draggable={false}
                  className="w-full h-auto block"
                />

                {stampRect && stampImage && anchor && (
                  <div
                    data-testid={`pdf-stamp-box-${idx}`}
                    onPointerDown={(e) => startMove(e, idx, anchor, 'stamp')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    title="អូសដើម្បីរំកិលទីតាំងត្រា ឬអូសជ្រុងដើម្បីពង្រីក/បង្រួម"
                    className={`group absolute cursor-move rounded-sm transition-shadow ${
                      interactingTarget === 'stamp'
                        ? 'ring-2 ring-[#dc2626] bg-[#dc2626]/[0.03]'
                        : 'ring-1 ring-dashed ring-[#dc2626]/65 hover:ring-2 hover:ring-[#dc2626]'
                    }`}
                    style={{
                      left: `${stampRect.leftFrac * 100}%`,
                      top: `${stampRect.topFrac * 100}%`,
                      width: `${stampRect.widthFrac * 100}%`,
                      height: `${stampRect.heightFrac * 100}%`,
                      touchAction: 'none',
                    }}
                  >
                    <img
                      src={stampImage.dataUrl}
                      alt=""
                      role="presentation"
                      draggable={false}
                      className="w-full h-full object-contain pointer-events-none select-none"
                      style={{ opacity: STAMP_OPACITY }}
                    />

                    {CORNERS.map((corner) => (
                      <div
                        key={corner.id}
                        data-testid={`pdf-stamp-handle-${idx}-${corner.id}`}
                        onPointerDown={(e) =>
                          startResize(
                            e,
                            e.currentTarget.parentElement as HTMLDivElement | null,
                            'stamp'
                          )
                        }
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className={`absolute ${corner.posClass} ${corner.cursorClass} w-5 h-5 flex items-center justify-center touch-none`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-[#dc2626] shadow-sm" />
                      </div>
                    ))}
                  </div>
                )}

                {teacherRect && teacherSigImage && teacherAnchor && (
                  <div
                    data-testid={`pdf-teacher-box-${idx}`}
                    onPointerDown={(e) => startMove(e, idx, teacherAnchor, 'teacher')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    title="អូសដើម្បីរំកិលហត្ថលេខាគ្រូ ឬអូសជ្រុងដើម្បីពង្រីក/បង្រួម"
                    className={`group absolute cursor-move rounded-sm transition-shadow ${
                      interactingTarget === 'teacher'
                        ? 'ring-2 ring-[#0071e3] bg-[#0071e3]/[0.03]'
                        : 'ring-1 ring-dashed ring-[#0071e3]/65 hover:ring-2 hover:ring-[#0071e3]'
                    }`}
                    style={{
                      left: `${teacherRect.leftFrac * 100}%`,
                      top: `${teacherRect.topFrac * 100}%`,
                      width: `${teacherRect.widthFrac * 100}%`,
                      height: `${teacherRect.heightFrac * 100}%`,
                      touchAction: 'none',
                    }}
                  >
                    <img
                      src={teacherSigImage.dataUrl}
                      alt=""
                      role="presentation"
                      draggable={false}
                      className="w-full h-full object-contain pointer-events-none select-none"
                      style={{ opacity: 1 }}
                    />

                    {CORNERS.map((corner) => (
                      <div
                        key={corner.id}
                        data-testid={`pdf-teacher-handle-${idx}-${corner.id}`}
                        onPointerDown={(e) =>
                          startResize(
                            e,
                            e.currentTarget.parentElement as HTMLDivElement | null,
                            'teacher'
                          )
                        }
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className={`absolute ${corner.posClass} ${corner.cursorClass} w-5 h-5 flex items-center justify-center touch-none`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-[#0071e3] shadow-sm" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {total > 1 && (
                <figcaption className="text-center text-[11px] text-[#6e6e73] dark:text-[#98989d] mt-1.5">
                  ទំព័រ {fmt(idx + 1)} / {fmt(total)}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
    </AppleModal>
  );
};
