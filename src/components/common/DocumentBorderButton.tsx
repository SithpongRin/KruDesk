import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Frame, RotateCcw, Upload } from 'lucide-react';
import { db, setSetting } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  CERTIFICATE_RANKS,
  certificateRankBorderKey,
  certificateRankBorderSelection,
  DOCUMENT_BORDER_FORMAT,
  DOCUMENT_BORDER_ORIENTATION,
  DOCUMENT_FRAME_CHOICES,
  documentBorderSelection,
  isDocumentBorderImage,
  prepareDocumentBorderImage,
  resolveCertificateRankBorder,
  resolveDocumentBorder,
  type CertificateRank,
  type DocumentBorderImage,
  type DocumentBorderKey,
  type StoredDocumentBorder,
} from '../../utils/documentBorder';
import { getAssetUrl } from '../../utils/assets';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleButton } from './AppleButton';
import { AppleModal } from './AppleModal';

/** The frame image to draw for a document, or undefined for the drawn indigo frame. */
export function useDocumentBorder(key: DocumentBorderKey): DocumentBorderImage | undefined {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return resolveDocumentBorder(key, row?.value);
}

/** Optional per-rank certificate frame overrides (`certificateBorder_1` / `_2` / `_3`). */
export function useCertificateRankBorders(): Partial<
  Record<CertificateRank, DocumentBorderImage | undefined>
> {
  const rows = useLiveQuery(
    () =>
      Promise.all(
        CERTIFICATE_RANKS.map(async (rank) => ({
          rank,
          row: await db.settings.get(certificateRankBorderKey(rank)),
        }))
      ),
    []
  );
  const out: Partial<Record<CertificateRank, DocumentBorderImage | undefined>> = {};
  if (!rows) return out;
  for (const item of rows) {
    const resolved = resolveCertificateRankBorder(item.row?.value);
    if (resolved) out[item.rank] = resolved;
  }
  return out;
}

interface DocumentBorderButtonProps {
  borderKey: DocumentBorderKey;
  /** Button text (default «ប្ដូរស៊ុម»). */
  label?: string;
  /** When true (certificates), lets the teacher pick different frames for ranks 1, 2, 3. */
  enablePerRank?: boolean;
}

type BorderTarget = 'all' | CertificateRank;

const tileBase =
  'relative rounded-xl border-2 overflow-hidden bg-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]';

/**
 * «ប្ដូរស៊ុម»: a dialog with the frames shipped with the app (the teacher's templates),
 * the drawn frame where there is one, and «បញ្ចូលរូបខ្លួនឯង» for the teacher's own image.
 * When `enablePerRank` is set on certificates, also lets the teacher pick a separate frame
 * per rank (លេខ ១, លេខ ២, លេខ ៣) or keep all ranks using the same shared frame.
 */
export const DocumentBorderButton: React.FC<DocumentBorderButtonProps> = ({
  borderKey,
  label = 'ប្ដូរស៊ុម',
  enablePerRank = false,
}) => {
  const { addToast } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<BorderTarget>('all');

  const allowPerRank = enablePerRank && borderKey === 'certificateBorder';
  const activeSettingKey =
    allowPerRank && target !== 'all' ? certificateRankBorderKey(target) : borderKey;

  const baseRow = useLiveQuery(() => db.settings.get(borderKey), [borderKey]);
  const rankRows = useLiveQuery(
    async () => {
      if (!allowPerRank) return undefined;
      const entries = await Promise.all(
        CERTIFICATE_RANKS.map(async (rank) => [
          rank,
          (await db.settings.get(certificateRankBorderKey(rank)))?.value,
        ] as const)
      );
      return Object.fromEntries(entries) as Record<CertificateRank, unknown>;
    },
    [allowPerRank]
  );

  const activeRawValue =
    allowPerRank && target !== 'all' ? rankRows?.[target] : baseRow?.value;

  const selection =
    allowPerRank && target !== 'all'
      ? certificateRankBorderSelection(activeRawValue)
      : documentBorderSelection(borderKey, activeRawValue);
  const uploaded = isDocumentBorderImage(activeRawValue) ? activeRawValue : undefined;

  const customRanks = allowPerRank
    ? CERTIFICATE_RANKS.filter(
        (rank) => certificateRankBorderSelection(rankRows?.[rank]) !== 'inherit'
      )
    : [];

  const { frames, defaultId } = DOCUMENT_FRAME_CHOICES[borderKey];
  const isPlaque = borderKey === 'honorRollNameBanner';
  const portrait = DOCUMENT_BORDER_ORIENTATION[borderKey] === 'portrait';

  const choose = async (presetId: string | null) => {
    await setSetting<StoredDocumentBorder>(activeSettingKey, { presetId });
    if (!allowPerRank || target === 'all') {
      setOpen(false);
    }
  };

  const resetRankToShared = async (rank: CertificateRank) => {
    await db.settings.delete(certificateRankBorderKey(rank));
  };

  const resetAllRanksToShared = async () => {
    await Promise.all(
      CERTIFICATE_RANKS.map((rank) => db.settings.delete(certificateRankBorderKey(rank)))
    );
    addToast({
      type: 'success',
      title: 'ប្រើស៊ុមដូចគ្នាទាំងអស់',
      message: 'ប័ណ្ណសរសើរលេខ ១–៣ ប្រើស៊ុមទូទៅដូចគ្នាវិញហើយ។',
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const format = DOCUMENT_BORDER_FORMAT[borderKey];
      const image = await prepareDocumentBorderImage(
        file,
        DOCUMENT_BORDER_ORIENTATION[borderKey],
        format.maxLongSide,
        0.9,
        format.transparent
      );
      await setSetting<StoredDocumentBorder>(activeSettingKey, image);
      if (!allowPerRank || target === 'all') {
        setOpen(false);
      }
      addToast({
        type: 'success',
        title:
          allowPerRank && target !== 'all'
            ? `បានប្ដូរស៊ុមសម្រាប់លេខ ${toKhmerNumerals(target)}`
            : 'បានប្ដូរស៊ុម',
        message: 'រូបរបស់អ្នករក្សាទុកក្នុងកម្មវិធីនេះ (និងក្នុង Backup)។',
      });
    } catch {
      addToast({
        type: 'error',
        title: 'មិនអាចប្រើរូបនេះបានទេ',
        message: 'សូមជ្រើសរូបភាព JPG ឬ PNG។',
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // Thumbnails keep the page's shape: portrait pages show the landscape frame turned.
  const thumbBox = isPlaque
    ? 'aspect-[3.46/1]'
    : portrait
      ? 'aspect-[210/297]'
      : 'aspect-[297/210]';
  const renderThumb = (src: string, rotate: boolean) => (
    <div className={`w-full ${thumbBox} relative bg-white`}>
      <img
        src={src}
        alt=""
        className="absolute max-w-none"
        style={
          rotate
            ? {
                width: `${(297 / 210) * 100}%`,
                height: `${(210 / 297) * 100}%`,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%) rotate(90deg)',
                objectFit: 'fill',
              }
            : { inset: 0, width: '100%', height: '100%', objectFit: 'fill' }
        }
      />
    </div>
  );

  const tile = (
    key: string,
    selected: boolean,
    onClick: () => void,
    body: React.ReactNode,
    name: string
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`${tileBase} ${
        selected
          ? 'border-[#0071e3]'
          : 'border-black/[0.08] dark:border-white/[0.12] hover:border-[#0071e3]/50'
      }`}
      aria-pressed={selected}
    >
      {body}
      <div className="px-2 py-1 text-[11px] text-left text-[#1d1d1f] bg-[#f5f5f7] truncate">
        {name}
      </div>
      {selected && (
        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#0071e3] text-white flex items-center justify-center">
          <Check size={12} />
        </span>
      )}
    </button>
  );

  const sharedFrame = resolveDocumentBorder('certificateBorder', baseRow?.value);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="បញ្ចូលរូបខ្លួនឯង"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <AppleButton
        variant="secondary"
        size="sm"
        icon={<Frame size={14} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </AppleButton>

      <AppleModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={label}
        subtitle={
          allowPerRank
            ? 'ជ្រើសស៊ុមរួម ឬជ្រើសស៊ុមផ្សេងគ្នាសម្រាប់លេខ ១, លេខ ២ និងលេខ ៣'
            : 'ជ្រើសស៊ុមដែលមានស្រាប់ ឬបញ្ចូលរូបរបស់អ្នក'
        }
        maxWidth="2xl"
        footer={
          <>
            <AppleButton variant="secondary" size="sm" onClick={() => setOpen(false)}>
              បិទ
            </AppleButton>
            <AppleButton
              variant="primary"
              size="sm"
              icon={<Upload size={14} />}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? 'កំពុងដាក់...' : 'បញ្ចូលរូបខ្លួនឯង'}
            </AppleButton>
          </>
        }
      >
        <div className="space-y-3">
          {allowPerRank && (
            <div className="space-y-2">
              <div
                role="tablist"
                aria-label="ជ្រើសចំណាត់ថ្នាក់សម្រាប់ស៊ុមប័ណ្ណសរសើរ"
                className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.06]"
              >
                {(
                  [
                    { id: 'all' as const, text: 'ទូទៅ (ដូចគ្នាទាំងអស់)' },
                    { id: 1 as const, text: 'លេខ ១' },
                    { id: 2 as const, text: 'លេខ ២' },
                    { id: 3 as const, text: 'លេខ ៣' },
                  ]
                ).map((tab) => {
                  const isActive = target === tab.id;
                  const hasCustom =
                    tab.id !== 'all' && customRanks.includes(tab.id);
                  return (
                    <button
                      key={String(tab.id)}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setTarget(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-white dark:bg-[#2c2c2e] text-[#0071e3] shadow-sm'
                          : 'text-[#6e6e73] dark:text-[#98989d] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
                      }`}
                    >
                      <span>{tab.text}</span>
                      {hasCustom && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[#0071e3]"
                          title="មានស៊ុមផ្ទាល់ខ្លួន"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {target === 'all' && customRanks.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50/80 dark:bg-blue-500/10 border border-blue-200/70 dark:border-blue-500/25 text-[11px] text-[#1d1d1f] dark:text-blue-100">
                  <span>
                    កំពុងប្រើស៊ុមផ្សេងគ្នាសម្រាប់{' '}
                    <strong>
                      {customRanks.map((r) => `លេខ ${toKhmerNumerals(r)}`).join(', ')}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => void resetAllRanksToShared()}
                    className="inline-flex items-center gap-1 font-semibold text-[#0071e3] hover:underline"
                  >
                    <RotateCcw size={12} />
                    <span>ប្រើស៊ុមដូចគ្នាទាំងអស់</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div
            className={`grid gap-3 ${
              isPlaque
                ? 'grid-cols-1 sm:grid-cols-2'
                : portrait
                  ? 'grid-cols-3 sm:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            {allowPerRank &&
              target !== 'all' &&
              tile(
                'inherit',
                selection === 'inherit',
                () => void resetRankToShared(target),
                sharedFrame ? (
                  renderThumb(sharedFrame.dataUrl, false)
                ) : (
                  <div className={`w-full ${thumbBox} bg-[#f5f5f7]`} />
                ),
                `តាមស៊ុមទូទៅ (${sharedFrame?.fileName ?? 'ដើម'})`
              )}
            {!allowPerRank &&
              defaultId === null &&
              tile(
                'drawn',
                selection === null,
                () => void choose(null),
                <div className={`w-full ${thumbBox} bg-white p-1.5`}>
                  <div className="w-full h-full border-[3px] border-[#3b2aa0] outline outline-1 outline-black outline-offset-1" />
                </div>,
                'ស៊ុមដើម (ខៀវស្វាយ)'
              )}
            {frames.map((f) =>
              tile(
                f.id,
                selection === f.id,
                () => void choose(f.id),
                renderThumb(getAssetUrl(f.path), portrait && f.width >= f.height),
                f.id === defaultId && (!allowPerRank || target === 'all')
                  ? `${f.label} (ដើម)`
                  : f.label
              )
            )}
            {uploaded &&
              tile(
                'upload',
                selection === 'upload',
                () => {
                  if (!allowPerRank || target === 'all') setOpen(false);
                },
                renderThumb(uploaded.dataUrl, false),
                uploaded.fileName ? `រូបរបស់អ្នក · ${uploaded.fileName}` : 'រូបរបស់អ្នក'
              )}
          </div>
        </div>
      </AppleModal>
    </>
  );
};
