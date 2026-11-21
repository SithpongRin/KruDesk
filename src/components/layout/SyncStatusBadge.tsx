import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Loader2,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react';
import { useSyncStore } from '../../services/sync/useSyncStore';
import { useAppStore } from '../../store/useAppStore';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';

export const SyncStatusBadge: React.FC = () => {
  const { enabled, status, firstSignInPhase, triggerManualSync } = useSyncStore();
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);

  if (!enabled) return null;

  const fmtCount = (n: number) =>
    useKhmerNumerals ? toKhmerNumerals(n) : toArabicNumerals(String(n));

  if (firstSignInPhase === 'awaiting-first-sync') {
    const label = 'មិនទាន់ sync — រង់ចាំអ៊ីនធឺណិត';
    return (
      <button
        type="button"
        onClick={() => void triggerManualSync()}
        title="ចុចដើម្បីព្យាយាមភ្ជាប់ និង sync លើកដំបូងម្ដងទៀត"
        aria-label={label}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
      >
        <WifiOff size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span>{label}</span>
      </button>
    );
  }

  let icon: React.ReactNode;
  let label: string;
  let badgeClass: string;
  let titleText: string;

  switch (status.state) {
    case 'syncing':
      icon = <Loader2 size={13} className="animate-spin text-[#0071e3] shrink-0" />;
      label = 'កំពុង sync…';
      badgeClass =
        'bg-[#e8f2ff] dark:bg-blue-500/15 text-[#0071e3] dark:text-blue-300 border-[#b8d8ff] dark:border-blue-500/30';
      titleText = 'កំពុងធ្វើបច្ចុប្បន្នភាពទិន្នន័យជាមួយ Cloud…';
      break;

    case 'offline':
      icon = <WifiOff size={13} className="text-[#6e6e73] dark:text-[#98989d] shrink-0" />;
      label = 'គ្មានអ៊ីនធឺណិត';
      badgeClass =
        'bg-[#f5f5f7] dark:bg-white/[0.08] text-[#6e6e73] dark:text-[#98989d] border-black/[0.08] dark:border-white/[0.1]';
      titleText =
        status.pendingCount > 0
          ? `គ្មានអ៊ីនធឺណិត — មានទិន្នន័យមិនទាន់ sync (${fmtCount(status.pendingCount)})`
          : 'គ្មានអ៊ីនធឺណិត — ការកែប្រែនឹង sync ពេលមានអ៊ីនធឺណិតវិញ';
      break;

    case 'error':
      icon = <AlertTriangle size={13} className="text-[#ff3b30] shrink-0" />;
      label =
        status.pendingCount > 0
          ? `មិនទាន់ sync (${fmtCount(status.pendingCount)})`
          : 'បញ្ហា sync';
      badgeClass =
        'bg-red-50 dark:bg-red-500/15 text-[#ff3b30] dark:text-red-300 border-red-200 dark:border-red-500/30';
      titleText = status.errorMessage || 'មានបញ្ហាក្នុងការ sync — ចុចដើម្បីសាកល្បងម្ដងទៀត';
      break;

    case 'pending':
      icon = <CloudUpload size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />;
      label = `មិនទាន់ sync (${fmtCount(status.pendingCount)})`;
      badgeClass =
        'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30';
      titleText = 'ចុចដើម្បី sync ទៅ Cloud ឥឡូវនេះ';
      break;

    case 'synced':
    default:
      icon = <CheckCircle2 size={13} className="text-[#34c759] shrink-0" />;
      label = 'បាន sync';
      badgeClass =
        'bg-[#edf9f0] dark:bg-emerald-500/15 text-[#1b7a34] dark:text-emerald-300 border-[#c8eed0] dark:border-emerald-500/30';
      titleText = 'ទិន្នន័យបាន sync ជាមួយ Cloud រួចរាល់ — ចុចដើម្បីពិនិត្យម្ដងទៀត';
      break;
  }

  return (
    <button
      type="button"
      onClick={() => void triggerManualSync()}
      disabled={status.state === 'syncing' || status.state === 'offline'}
      title={titleText}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors disabled:cursor-default ${badgeClass}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export const SyncErrorBanner: React.FC = () => {
  const { enabled, status, errorDismissed, dismissError, triggerManualSync } = useSyncStore();

  if (!enabled || !status.errorMessage || errorDismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="px-4 sm:px-6 lg:px-8 py-2.5 bg-red-50 dark:bg-red-500/15 border-b border-red-200 dark:border-red-500/30 flex items-center justify-between gap-3 text-xs text-red-900 dark:text-red-200 shrink-0 print:hidden"
    >
      <div className="flex items-start sm:items-center gap-2 min-w-0">
        <AlertTriangle size={15} className="text-[#ff3b30] shrink-0 mt-0.5 sm:mt-0" />
        <span className="leading-snug break-words">{status.errorMessage}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => void triggerManualSync()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-white/10 border border-red-200 dark:border-red-500/30 text-[11px] font-semibold text-red-800 dark:text-red-100 hover:bg-red-100 dark:hover:bg-white/15 transition-colors"
        >
          <RefreshCw size={11} />
          <span>សាកល្បងម្ដងទៀត</span>
        </button>
        <button
          type="button"
          onClick={dismissError}
          aria-label="បិទសារកំហុស sync"
          className="p-1 rounded-lg text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-white/10"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
