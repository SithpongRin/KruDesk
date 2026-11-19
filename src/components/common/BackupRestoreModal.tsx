import React, { useEffect, useState } from 'react';
import { HardDriveUpload, CheckCircle2, Layers, RefreshCw } from 'lucide-react';
import { AppleModal } from '../common/AppleModal';
import { AppleButton } from '../common/AppleButton';
import { AppleBadge } from '../common/AppleBadge';
import {
  type KruDeskBackupPayload,
  type RestoreMode,
  summarizeBackup,
} from '../../services/backup';
import { formatDateTimeKm } from '../../lib/khmerDate';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { useAppStore } from '../../store/useAppStore';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: KruDeskBackupPayload | null;
  fileName: string;
  onConfirmRestore: (mode: RestoreMode) => Promise<void>;
  allowMerge?: boolean;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  payload,
  fileName,
  onConfirmRestore,
  allowMerge = true,
}) => {
  // When the app already has data (merge allowed), default to the safe «បញ្ចូលបន្ថែម» so a
  // teacher who just presses «ស្ដារ» never wipes their classes by accident.
  const defaultMode: RestoreMode = allowMerge ? 'merge' : 'replace';
  const [mode, setMode] = useState<RestoreMode>(defaultMode);
  const [isRestoring, setIsRestoring] = useState(false);

  // Reset to the safe default every time a new backup file is opened.
  useEffect(() => {
    setMode(defaultMode);
  }, [payload, defaultMode]);
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const fmtNum = (v: number | string) => (useKhmerNumerals ? toKhmerNumerals(v) : String(v));

  if (!payload) return null;

  const summary = summarizeBackup(payload);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await onConfirmRestore(mode);
      onClose();
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title="ផ្ទៀងផ្ទាត់ឯកសារ Backup មុនពេលស្ដារ"
      subtitle={fileName}
      maxWidth="lg"
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={onClose} disabled={isRestoring}>
            បោះបង់
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            icon={<HardDriveUpload size={15} />}
            onClick={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? 'កំពុងស្ដារ...' : 'ស្ដារទិន្នន័យឥឡូវនេះ'}
          </AppleButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-[#edf9f0] dark:bg-emerald-500/10 border border-[#c8eed0] dark:border-emerald-500/20">
          <div className="flex items-center gap-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
            <CheckCircle2 size={16} className="text-[#34c759] shrink-0" />
            <span>ឯកសារ Backup ត្រឹមត្រូវតាមទម្រង់ KruDesk</span>
          </div>
          <div className="flex items-center gap-2">
            <AppleBadge variant="blue" size="sm">
              v{fmtNum(payload.schemaVersion)}
            </AppleBadge>
            <span className="text-[11px] text-[#6e6e73] dark:text-[#98989d]">
              {formatDateTimeKm(payload.exportedAt)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06]">
            <div className="text-[#86868b] text-[11px]">ថ្នាក់រៀន</div>
            <div className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-0.5">
              {fmtNum(summary.classesCount)} ថ្នាក់
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06]">
            <div className="text-[#86868b] text-[11px]">សិស្ស</div>
            <div className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-0.5">
              {fmtNum(summary.studentsCount)} នាក់
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06]">
            <div className="text-[#86868b] text-[11px]">កំណត់ត្រាអវត្តមាន</div>
            <div className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-0.5">
              {fmtNum(summary.attendanceCount)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06]">
            <div className="text-[#86868b] text-[11px]">ពិន្ទុប្រចាំខែ</div>
            <div className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-0.5">
              {fmtNum(summary.monthlyScoresCount)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06]">
            <div className="text-[#86868b] text-[11px]">ប្រឡងឆមាស</div>
            <div className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-0.5">
              {fmtNum(summary.semesterExamsCount)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06]">
            <div className="text-[#86868b] text-[11px]">ថ្ងៃឈប់សម្រាក</div>
            <div className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-0.5">
              {fmtNum(summary.holidaysCount)}
            </div>
          </div>
        </div>

        {allowMerge && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              ជម្រើសនៃការស្ដារទិន្នន័យ
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  mode === 'replace'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15'
                    : 'border-black/[0.08] dark:border-white/[0.1] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  <RefreshCw size={14} className="text-[#0071e3]" />
                  <span>ជំនួសទិន្នន័យទាំងអស់</span>
                </div>
                <p className="text-[11px] text-[#86868b] mt-1">
                  លុបទិន្នន័យបច្ចុប្បន្ន ហើយដាក់ជំនួសដោយទិន្នន័យក្នុង Backup ទាំងស្រុង
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('merge')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  mode === 'merge'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15'
                    : 'border-black/[0.08] dark:border-white/[0.1] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  <Layers size={14} className="text-[#34c759]" />
                  <span>បញ្ចូលបន្ថែម (Merge)</span>
                </div>
                <p className="text-[11px] text-[#86868b] mt-1">
                  រក្សាទុកទិន្នន័យមានស្រាប់ និងបន្ថែមថ្នាក់/សិស្សថ្មីពី Backup
                </p>
              </button>
            </div>
          </div>
        )}
      </div>
    </AppleModal>
  );
};
