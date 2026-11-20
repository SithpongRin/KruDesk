import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Stamp, Trash2, Upload } from 'lucide-react';
import { db, setSetting } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { ImageCropModal } from '../../components/common/ImageCropModal';
import { DocumentSignature } from '../../print/DocumentSignature';
import type { Profile } from '../../types/domain';
import { isSealImage, type DirectorSealKey, type SealImage } from '../../utils/directorSeal';

const SLOTS: Array<{ key: DirectorSealKey; title: string; hint: string }> = [
  {
    key: 'directorStamp',
    title: 'ត្រាសាលា',
    hint: 'រូបថត ឬ scan ត្រាលើក្រដាសស។ បើត្រា និងហត្ថលេខានៅក្នុងរូបតែមួយ ដាក់វានៅទីនេះ ហើយទុកប្រអប់ «ហត្ថលេខានាយក» ទទេ',
  },
  {
    key: 'directorSignature',
    title: 'ហត្ថលេខានាយក',
    hint: 'ហត្ថលេខាលើក្រដាសស ឬរូប PNG ថ្លា',
  },
  {
    key: 'teacherSignature',
    title: 'ហត្ថលេខាគ្រូ',
    hint: 'ហត្ថលេខារបស់អ្នកលើក្រដាសស ឬរូប PNG ថ្លា',
  },
];

const SealSlot: React.FC<{ slot: (typeof SLOTS)[number] }> = ({ slot }) => {
  const { addToast } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  // The picked photo waits here while the teacher turns / crops it.
  const [pending, setPending] = useState<File | null>(null);
  const row = useLiveQuery(() => db.settings.get(slot.key), [slot.key]);
  const image: SealImage | undefined = isSealImage(row?.value) ? row.value : undefined;
  // For the preview: the signature block exactly as printed, with the other saved images too.
  const profileRow = useLiveQuery(() => db.settings.get('profile'), []);
  const stampRow = useLiveQuery(() => db.settings.get('directorStamp'), []);
  const directorSignRow = useLiveQuery(() => db.settings.get('directorSignature'), []);
  const profile = (profileRow?.value as Profile | undefined) ?? {
    teacherName: '',
    schoolName: '',
    directorName: '',
    academicYear: '',
  };
  const savedStamp = isSealImage(stampRow?.value) ? stampRow.value : undefined;
  const savedDirectorSign = isSealImage(directorSignRow?.value) ? directorSignRow.value : undefined;
  const renderPreview = (candidate: SealImage, widthPx: number) => {
    const seal =
      slot.key === 'directorStamp'
        ? { directorStamp: candidate, directorSignature: savedDirectorSign }
        : slot.key === 'directorSignature'
          ? { directorStamp: savedStamp, directorSignature: candidate }
          : { teacherSignature: candidate };
    return (
      // Real size (mm) scaled to the dialog: the same block and spacing as on the documents.
      <div
        style={{ zoom: Math.max(0.3, Math.min(0.6, widthPx / ((180 * 96) / 25.4))) }}
        className="w-[180mm] pt-[14mm] pb-[10mm] text-black"
      >
        <DocumentSignature
          profile={profile}
          signOptions={{ month: '', lunarDate: '', place: '', gregorianDate: '', ...seal }}
          gapMm={13}
          fontSizePt={11}
        />
      </div>
    );
  };

  const handleCropped = async (cleaned: SealImage) => {
    setPending(null);
    await setSetting<SealImage>(slot.key, cleaned);
    addToast({ type: 'success', title: `បានរក្សាទុក${slot.title}` });
  };

  return (
    <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-3 flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{slot.title}</div>
        <div className="text-[11px] text-[#86868b]">{slot.hint}</div>
      </div>
      <div className="h-28 rounded-xl bg-white border border-dashed border-black/[0.12] flex items-center justify-center overflow-hidden">
        {image ? (
          <img
            src={image.dataUrl}
            alt={slot.title}
            className="max-h-24 max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-[#86868b]">មិនទាន់មាន</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={`បញ្ចូល${slot.title}`}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) setPending(picked);
          e.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <AppleButton
          type="button"
          variant="secondary"
          size="sm"
          icon={<Upload size={14} />}
          onClick={() => inputRef.current?.click()}
        >
          {image ? 'ប្ដូររូប' : 'បញ្ចូលរូប'}
        </AppleButton>
        {image && (
          <AppleButton
            type="button"
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => void db.settings.delete(slot.key)}
          >
            លុប
          </AppleButton>
        )}
      </div>
      <ImageCropModal
        file={pending}
        title={`កាត់រូប — ${slot.title}`}
        onCancel={() => setPending(null)}
        onConfirm={handleCropped}
        renderPreview={renderPreview}
      />
    </div>
  );
};

/** Settings → «ត្រា និងហត្ថលេខា» (optional): director's stamp and signature, teacher's signature. */
export const DirectorSealCard: React.FC = () => (
  <AppleCard
    title={
      <span className="flex items-center gap-2">
        <Stamp size={17} className="text-[#dc2626]" />
        <span>ត្រា និងហត្ថលេខា (មិនចាំបាច់)</span>
      </span>
    }
    subtitle="ដាក់លើឯកសារតែពេលអ្នកធីកក្នុងប្រអប់ «បង្កើតឯកសារ» — ត្រា និងហត្ថលេខានាយកប្រើតែពេលនាយកអនុញ្ញាត។ រូបរក្សាទុកតែក្នុងកម្មវិធីនេះ (និងក្នុង Backup)។"
  >
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {SLOTS.map((slot) => (
        <SealSlot key={slot.key} slot={slot} />
      ))}
    </div>
  </AppleCard>
);
