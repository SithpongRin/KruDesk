import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Frame, Upload } from 'lucide-react';
import { db, setSetting } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  DOCUMENT_BORDER_FORMAT,
  DOCUMENT_BORDER_ORIENTATION,
  DOCUMENT_FRAME_CHOICES,
  documentBorderSelection,
  isDocumentBorderImage,
  prepareDocumentBorderImage,
  resolveDocumentBorder,
  type DocumentBorderImage,
  type DocumentBorderKey,
  type StoredDocumentBorder,
} from '../../utils/documentBorder';
import { getAssetUrl } from '../../utils/assets';
import { AppleButton } from './AppleButton';
import { AppleModal } from './AppleModal';

/** The frame image to draw for a document, or undefined for the drawn indigo frame. */
export function useDocumentBorder(key: DocumentBorderKey): DocumentBorderImage | undefined {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return resolveDocumentBorder(key, row?.value);
}

interface DocumentBorderButtonProps {
  borderKey: DocumentBorderKey;
  /** Button text (default «ប្ដូរស៊ុម»). */
  label?: string;
}

const tileBase =
  'relative rounded-xl border-2 overflow-hidden bg-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]';

/**
 * «ប្ដូរស៊ុម»: a dialog with the frames shipped with the app (the teacher's templates),
 * the drawn frame where there is one, and «បញ្ចូលរូបខ្លួនឯង» for the teacher's own image.
 */
export const DocumentBorderButton: React.FC<DocumentBorderButtonProps> = ({
  borderKey,
  label = 'ប្ដូរស៊ុម',
}) => {
  const { addToast } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const row = useLiveQuery(() => db.settings.get(borderKey), [borderKey]);
  const selection = documentBorderSelection(borderKey, row?.value);
  const uploaded = isDocumentBorderImage(row?.value) ? row.value : undefined;
  const { frames, defaultId } = DOCUMENT_FRAME_CHOICES[borderKey];
  const isPlaque = borderKey === 'honorRollNameBanner';
  const portrait = DOCUMENT_BORDER_ORIENTATION[borderKey] === 'portrait';

  const choose = async (presetId: string | null) => {
    await setSetting<StoredDocumentBorder>(borderKey, { presetId });
    setOpen(false);
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
      await setSetting<StoredDocumentBorder>(borderKey, image);
      setOpen(false);
      addToast({
        type: 'success',
        title: 'បានប្ដូរស៊ុម',
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
        subtitle="ជ្រើសស៊ុមដែលមានស្រាប់ ឬបញ្ចូលរូបរបស់អ្នក"
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
        <div
          className={`grid gap-3 ${
            isPlaque
              ? 'grid-cols-1 sm:grid-cols-2'
              : portrait
                ? 'grid-cols-3 sm:grid-cols-4'
                : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {defaultId === null &&
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
              f.id === defaultId ? `${f.label} (ដើម)` : f.label
            )
          )}
          {uploaded &&
            tile(
              'upload',
              selection === 'upload',
              () => setOpen(false),
              renderThumb(uploaded.dataUrl, false),
              uploaded.fileName ? `រូបរបស់អ្នក · ${uploaded.fileName}` : 'រូបរបស់អ្នក'
            )}
        </div>
      </AppleModal>
    </>
  );
};
