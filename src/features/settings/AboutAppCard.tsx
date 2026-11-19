import React, { useState } from 'react';
import { CheckCircle2, Download, Info, RefreshCw } from 'lucide-react';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { useAppStore } from '../../store/useAppStore';
import { applyAppUpdate, checkForAppUpdate, type UpdateCheckResult } from '../../lib/appUpdate';
import { APP_BUILD_TIME, APP_COMMIT, APP_VERSION } from '../../lib/appVersion';
import { formatDateTimeKm } from '../../lib/khmerDate';
import { toKhmerNumerals } from '../../utils/khmerNumerals';

const RESULT_TEXT: Record<Exclude<UpdateCheckResult, 'update-ready' | 'skipped'>, string> = {
  'up-to-date': 'អ្នកកំពុងប្រើកំណែចុងក្រោយ',
  unavailable: 'មិនអាចពិនិត្យបានទេ (កម្មវិធីមិនទាន់បានដំឡើងជា App ឬកំពុងប្រើក្នុងម៉ូដអភិវឌ្ឍន៍)',
  error: 'ពិនិត្យមិនបានសម្រេច — សូមភ្ជាប់អ៊ីនធឺណិត ហើយសាកម្ដងទៀត',
};

/** Settings → «អំពីកម្មវិធី»: version info and a manual «ពិនិត្យរកកំណែថ្មី» button. */
export const AboutAppCard: React.FC = () => {
  const appUpdateReady = useAppStore((s) => s.appUpdateReady);
  const setAppUpdateReady = useAppStore((s) => s.setAppUpdateReady);
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const addToast = useAppStore((s) => s.addToast);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  const fmt = (v: string) => (useKhmerNumerals ? toKhmerNumerals(v) : v);
  const buildTs = APP_BUILD_TIME ? Date.parse(APP_BUILD_TIME) : NaN;

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await checkForAppUpdate({ force: true });
      if (result === 'update-ready') {
        setAppUpdateReady(true);
      } else if (result !== 'skipped') {
        addToast({
          type: result === 'up-to-date' ? 'success' : 'error',
          title: RESULT_TEXT[result],
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await applyAppUpdate();
    } catch (err) {
      console.error('Apply app update failed', err);
      addToast({ type: 'error', title: 'ធ្វើបច្ចុប្បន្នភាពមិនបានសម្រេច — សូមបិទ ហើយបើកកម្មវិធីឡើងវិញ' });
      setApplying(false);
    }
  };

  return (
    <AppleCard
      title="អំពីកម្មវិធី"
      subtitle="កំណែដែលកំពុងប្រើ និងការពិនិត្យរកកំណែថ្មី"
      headerAction={
        appUpdateReady ? (
          <AppleBadge variant="orange" size="sm">
            មានកំណែថ្មី
          </AppleBadge>
        ) : (
          <AppleBadge variant="green" size="sm">
            <CheckCircle2 size={12} />
            <span>KruDesk</span>
          </AppleBadge>
        )
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-[#86868b] dark:text-[#98989d]">កំណែ</dt>
          <dd className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]" data-testid="app-version">
            {fmt(APP_VERSION)} <span className="font-mono text-[#86868b]">({APP_COMMIT})</span>
          </dd>
          <dt className="text-[#86868b] dark:text-[#98989d]">បង្កើតនៅ</dt>
          <dd className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
            {Number.isFinite(buildTs) ? formatDateTimeKm(buildTs, useKhmerNumerals) : '—'}
          </dd>
        </dl>

        {appUpdateReady && (
          <div className="p-3.5 rounded-2xl border bg-orange-50/80 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/25 flex items-start gap-2.5 text-xs text-[#1d1d1f] dark:text-orange-100">
            <Info size={18} className="text-[#ff9500] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              កំណែថ្មីបានទាញយករួច។ ចុច «ធ្វើបច្ចុប្បន្នភាពឥឡូវ» ដើម្បីប្រើវា។ ទិន្នន័យរបស់អ្នកមិនបាត់ទេ។
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {appUpdateReady ? (
            <AppleButton
              variant="primary"
              icon={<Download size={16} />}
              onClick={() => void handleApply()}
              disabled={applying}
            >
              {applying ? 'កំពុងធ្វើបច្ចុប្បន្នភាព...' : 'ធ្វើបច្ចុប្បន្នភាពឥឡូវ'}
            </AppleButton>
          ) : (
            <AppleButton
              variant="secondary"
              icon={<RefreshCw size={16} className={checking ? 'animate-spin' : undefined} />}
              onClick={() => void handleCheck()}
              disabled={checking}
            >
              {checking ? 'កំពុងពិនិត្យ...' : 'ពិនិត្យរកកំណែថ្មី'}
            </AppleButton>
          )}
        </div>
      </div>
    </AppleCard>
  );
};
