import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Frame, RotateCcw } from 'lucide-react';
import { db, setSetting } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  DOCUMENT_BORDER_FORMAT,
  DOCUMENT_BORDER_ORIENTATION,
  isDocumentBorderImage,
  prepareDocumentBorderImage,
  type DocumentBorderImage,
  type DocumentBorderKey,
} from '../../utils/documentBorder';
import { AppleButton } from './AppleButton';

/** The border image the teacher chose for a document, or undefined for the built-in frame. */
export function useDocumentBorder(key: DocumentBorderKey): DocumentBorderImage | undefined {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return isDocumentBorderImage(row?.value) ? row.value : undefined;
}

interface DocumentBorderButtonProps {
  borderKey: DocumentBorderKey;
  current?: DocumentBorderImage;
  /** Button text (default «ប្ដូរស៊ុម»). */
  label?: string;
  /** Text of the reset button (default «ស៊ុមដើម»). */
  resetLabel?: string;
}

/** «ប្ដូរស៊ុម» (pick an image file) + «ស៊ុមដើម» (back to the built-in frame). */
export const DocumentBorderButton: React.FC<DocumentBorderButtonProps> = ({
  borderKey,
  current,
  label = 'ប្ដូរស៊ុម',
  resetLabel = 'ស៊ុមដើម',
}) => {
  const { addToast } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
      await setSetting(borderKey, image);
      addToast({
        type: 'success',
        title: `បាន${label}`,
        message: 'រូបស៊ុមរក្សាទុកតែក្នុងកម្មវិធីនេះ (និងក្នុង Backup)។',
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

  const handleReset = async () => {
    await db.settings.delete(borderKey);
    addToast({ type: 'success', title: `បានប្រើ${resetLabel}វិញ` });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={label}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <AppleButton
        variant="secondary"
        size="sm"
        icon={<Frame size={14} />}
        disabled={busy}
        title={current?.fileName ? `ស៊ុមបច្ចុប្បន្ន៖ ${current.fileName}` : 'ជ្រើសរូបស៊ុម (JPG/PNG)'}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </AppleButton>
      {current && (
        <AppleButton
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={() => void handleReset()}
        >
          {resetLabel}
        </AppleButton>
      )}
    </>
  );
};
