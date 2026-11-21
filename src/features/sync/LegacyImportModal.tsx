import React from 'react';
import { AlertTriangle, Database, Loader2, ShieldCheck } from 'lucide-react';
import { AppleButton } from '../../components/common/AppleButton';
import { useSyncStore } from '../../services/sync/useSyncStore';

export const LegacyImportModal: React.FC = () => {
  const {
    firstSignInPhase,
    legacyImportSummary,
    legacyImportError,
    resolveLegacyImport,
  } = useSyncStore();

  if (
    (firstSignInPhase !== 'legacy-import' && firstSignInPhase !== 'importing-legacy') ||
    !legacyImportSummary
  ) {
    return null;
  }

  const isImporting = firstSignInPhase === 'importing-legacy';
  const { classesCount, studentsCount } = legacyImportSummary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-import-title"
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl border border-black/[0.08] dark:border-white/[0.1] overflow-hidden"
      >
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#e8f2ff] dark:bg-blue-500/15 text-[#0071e3] flex items-center justify-center shrink-0">
              <Database size={20} />
            </div>
            <div className="min-w-0">
              <h2
                id="legacy-import-title"
                className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] leading-snug"
              >
                រកឃើញទិន្នន័យចាស់ ({classesCount} ថ្នាក់, {studentsCount} សិស្ស)។ តើជាទិន្នន័យរបស់អ្នកទេ?
              </h2>
              <p className="text-xs text-[#6e6e73] dark:text-[#98989d] mt-1.5 leading-relaxed">
                ប្រសិនបើជាទិន្នន័យរបស់អ្នក កម្មវិធីនឹងចម្លងវាចូលគណនី Google របស់អ្នក
                ហើយបន្ត Sync ទៅ Cloud ដោយស្វ័យប្រវត្តិ។
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#edf9f0] dark:bg-emerald-500/10 border border-[#c8eed0] dark:border-emerald-500/20 text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
            <ShieldCheck size={16} className="text-[#34c759] shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              ទិន្នន័យចាស់ក្នុងឧបករណ៍នឹង <strong>មិនត្រូវបានលុប ឬកែប្រែទេ</strong> — មានតែច្បាប់ចម្លងប៉ុណ្ណោះដែលត្រូវបាននាំចូល។
            </span>
          </div>

          {legacyImportError && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-xs text-red-800 dark:text-red-200"
            >
              <AlertTriangle size={15} className="text-[#ff3b30] shrink-0 mt-0.5" />
              <span>{legacyImportError}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-1">
            <AppleButton
              variant="secondary"
              size="md"
              disabled={isImporting}
              onClick={() => void resolveLegacyImport('decline')}
            >
              ទេ មិនមែនរបស់ខ្ញុំទេ
            </AppleButton>
            <AppleButton
              variant="primary"
              size="md"
              disabled={isImporting}
              icon={isImporting ? <Loader2 size={15} className="animate-spin" /> : undefined}
              onClick={() => void resolveLegacyImport('import')}
            >
              {isImporting ? 'កំពុងនាំចូលទិន្នន័យ…' : 'បាទ/ចាស នាំចូលទិន្នន័យនេះ'}
            </AppleButton>
          </div>
        </div>
      </div>
    </div>
  );
};
