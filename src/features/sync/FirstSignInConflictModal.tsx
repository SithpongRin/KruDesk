import React, { useState } from 'react';

import { AlertTriangle, Cloud, HardDrive, Loader2, ShieldCheck } from 'lucide-react';
import { AppleButton } from '../../components/common/AppleButton';
import { useSyncStore } from '../../services/sync/useSyncStore';
import type { FirstSignInConflictChoice } from '../../services/sync/firstSignIn';

export const FirstSignInConflictModal: React.FC = () => {
  const { firstSignInPhase, conflictSummary, conflictError, resolveConflict } = useSyncStore();
  // Default = Cloud (§1.6 / Step 4c)
  const [choice, setChoice] = useState<FirstSignInConflictChoice>('cloud');

  if (firstSignInPhase !== 'conflict' && firstSignInPhase !== 'resolving') {
    return null;
  }

  const isResolving = firstSignInPhase === 'resolving';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-signin-conflict-title"
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl border border-black/[0.08] dark:border-white/[0.1] overflow-hidden"
      >
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <h2
                id="first-signin-conflict-title"
                className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] leading-snug"
              >
                រកឃើញទិន្នន័យទាំងនៅលើឧបករណ៍ និងនៅលើ Cloud
              </h2>
              <p className="text-xs text-[#6e6e73] dark:text-[#98989d] mt-1 leading-relaxed">
                {conflictSummary
                  ? `ឧបករណ៍នេះមាន ${conflictSummary.deviceClassesCount} ថ្នាក់ និងសិស្ស ${conflictSummary.deviceStudentsCount} នាក់ ហើយគណនី Cloud របស់អ្នកក៏មានទិន្នន័យរួចហើយដែរ។ សូមជ្រើសរើសប្រភពទិន្នន័យដែលត្រូវប្រើ៖`
                  : 'ឧបករណ៍នេះ និងគណនី Cloud របស់អ្នកសុទ្ធតែមានទិន្នន័យ។ សូមជ្រើសរើសប្រភពទិន្នន័យដែលត្រូវប្រើ៖'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#edf9f0] dark:bg-emerald-500/10 border border-[#c8eed0] dark:border-emerald-500/20 text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
            <ShieldCheck size={16} className="text-[#34c759] shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              ដើម្បីសុវត្ថិភាព មុនពេលជំនួសទិន្នន័យ កម្មវិធីនឹង <strong>រក្សាទុក Cloud Snapshot ទាំងទិន្នន័យឧបករណ៍ និងទិន្នន័យ Cloud</strong>{' '}
              ព្រមទាំង <strong>ទាញយកឯកសារ Backup (.json)</strong> ដោយស្វ័យប្រវត្តិជាមុនសិន។
            </span>
          </div>

          <div className="space-y-3" role="radiogroup" aria-label="ជម្រើសប្រភពទិន្នន័យ">
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'cloud'}
              disabled={isResolving}
              onClick={() => setChoice('cloud')}
              className={`w-full p-4 rounded-2xl border text-left transition-all ${
                choice === 'cloud'
                  ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 ring-1 ring-[#0071e3]'
                  : 'border-black/[0.08] dark:border-white/[0.1] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                <Cloud size={17} className="text-[#0071e3] shrink-0" />
                <span>ប្រើទិន្នន័យពី Cloud (ជំនួសទិន្នន័យក្នុងឧបករណ៍នេះ)</span>
              </div>
              <p className="text-[11px] text-[#6e6e73] dark:text-[#98989d] mt-1.5 pl-6">
                ណែនាំ — ទាញយកទិន្នន័យពី Cloud មកជំនួសទិន្នន័យក្នុងឧបករណ៍នេះ (ទិន្នន័យលើ Cloud និងឧបករណ៍ផ្សេងទៀតនៅដដែល)។
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={choice === 'device'}
              disabled={isResolving}
              onClick={() => setChoice('device')}
              className={`w-full p-4 rounded-2xl border text-left transition-all ${
                choice === 'device'
                  ? 'border-[#ff3b30] bg-red-50/70 dark:bg-red-500/15 ring-1 ring-[#ff3b30]'
                  : 'border-black/[0.08] dark:border-white/[0.1] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                <HardDrive size={17} className="text-[#ff3b30] shrink-0" />
                <span>ប្រើទិន្នន័យឧបករណ៍នេះ (ជំនួសទិន្នន័យនៅលើ Cloud និងឧបករណ៍ទាំងអស់)</span>
              </div>
              <p className="text-[11px] text-[#6e6e73] dark:text-[#98989d] mt-1.5 pl-6">
                ផ្ទុកទិន្នន័យក្នុងឧបករណ៍នេះឡើងទៅ Cloud ហើយជំនួសទិន្នន័យនៅលើឧបករណ៍ទាំងអស់ដែលចូលគណនីនេះ។
              </p>
            </button>
          </div>

          {conflictError && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-xs text-red-800 dark:text-red-200"
            >
              <AlertTriangle size={15} className="text-[#ff3b30] shrink-0 mt-0.5" />
              <span>{conflictError}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <AppleButton
              variant={choice === 'device' ? 'danger' : 'primary'}
              size="md"
              disabled={isResolving}
              icon={isResolving ? <Loader2 size={15} className="animate-spin" /> : undefined}
              onClick={() => void resolveConflict(choice)}
            >
              {isResolving
                ? 'កំពុងបម្រុងទុក និងជំនួសទិន្នន័យ…'
                : 'បម្រុងទុក និងបន្តជំនួសទិន្នន័យ'}
            </AppleButton>
          </div>
        </div>
      </div>
    </div>
  );
};
