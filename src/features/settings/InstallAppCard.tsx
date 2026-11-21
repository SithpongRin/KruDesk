import React, { useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { useAppStore } from '../../store/useAppStore';
import { usePwaInstallStore } from '../../store/usePwaInstallStore';

/**
 * Settings card prompting the teacher to install KruDesk as a PWA.
 * Completely hidden once installed (or when Chrome suppresses the prompt because it's already installed).
 */
export const InstallAppCard: React.FC = () => {
  const { isInstalled, isIos, deferredPrompt, promptInstall } = usePwaInstallStore();
  const addToast = useAppStore((s) => s.addToast);
  const [isInstalling, setIsInstalling] = useState(false);

  if (isInstalled) return null;
  if (!deferredPrompt && !isIos) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        addToast({
          type: 'success',
          title: 'ដំឡើងកម្មវិធី KruDesk ជោគជ័យ!',
          message: 'អ្នកអាចបើក KruDesk ផ្ទាល់ពីអេក្រង់ដើមបានហើយ។',
        });
      }
    } catch {
      addToast({
        type: 'error',
        title: 'មិនអាចដំឡើងកម្មវិធីបានទេ',
        message: 'សូមសាកល្បងម្ដងទៀត ឬដំឡើងតាមម៉ឺនុយ Browser។',
      });
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <AppleCard
      title="ដំឡើងកម្មវិធី (Install App)"
      subtitle="ដំឡើង KruDesk លើឧបករណ៍របស់អ្នក ដើម្បីបើកប្រើលឿន និងប្រើបានពេលអស់អ៊ីនធឺណិត"
    >
      <div
        data-testid="install-app-card"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-[#0071e3] flex items-center justify-center shrink-0">
            <Smartphone size={20} />
          </div>
          <div className="text-xs text-[#6e6e73] dark:text-[#d1d1d6] leading-relaxed">
            {deferredPrompt ? (
              <>
                <div className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  កម្មវិធី KruDesk មិនទាន់បានដំឡើងលើឧបករណ៍នេះទេ
                </div>
                <p className="mt-0.5">
                  ចុចប៊ូតុងខាងស្ដាំដើម្បីដំឡើងកម្មវិធីទុកលើអេក្រង់ដើម ឬ Desktop ងាយស្រួលបើកប្រើប្រាស់ប្រចាំថ្ងៃ។
                </p>
              </>
            ) : (
              <>
                <div className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  របៀបដំឡើងលើ iPhone / iPad (Safari)
                </div>
                <p className="mt-0.5 flex items-center gap-1 flex-wrap">
                  <span>១. ចុចប៊ូតុង Share</span>
                  <Share size={13} className="inline text-[#0071e3]" />
                  <span>→ ២. ជ្រើស «Add to Home Screen» → ៣. ចុច «Add»</span>
                </p>
              </>
            )}
          </div>
        </div>

        {deferredPrompt && (
          <AppleButton
            variant="primary"
            size="sm"
            icon={<Download size={15} />}
            onClick={() => void handleInstall()}
            disabled={isInstalling}
            className="shrink-0"
          >
            {isInstalling ? 'កំពុងដំឡើង...' : 'ដំឡើងកម្មវិធី'}
          </AppleButton>
        )}
      </div>
    </AppleCard>
  );
};
