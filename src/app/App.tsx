import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { db, saveProfile } from '../db/database';
import { applyThemeToHtml, useAppStore } from '../store/useAppStore';
import type { Profile } from '../types/domain';
import { CAMBODIA_PROVINCES } from '../lib/provinces';
import { AppleSidebar } from '../components/layout/AppleSidebar';
import { AppleHeader } from '../components/layout/AppleHeader';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
import { OnboardingView } from '../components/layout/OnboardingView';
import { AppleModal } from '../components/common/AppleModal';
import { AppleButton } from '../components/common/AppleButton';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { MOEYS_EMBLEM_DATA_URI } from '../utils/moeysEmblemDataUri';

const DashboardView = lazy(() =>
  import('../features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const SettingsView = lazy(() =>
  import('../features/settings/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const StudentsView = lazy(() =>
  import('../features/students/StudentsView').then((m) => ({ default: m.StudentsView }))
);
const RosterView = lazy(() =>
  import('../features/roster/RosterView').then((m) => ({ default: m.RosterView }))
);
const AttendanceView = lazy(() =>
  import('../features/attendance/AttendanceView').then((m) => ({ default: m.AttendanceView }))
);
const ScoresView = lazy(() =>
  import('../features/scores/ScoresView').then((m) => ({ default: m.ScoresView }))
);
const CardsView = lazy(() =>
  import('../features/cards/CardsView').then((m) => ({ default: m.CardsView }))
);

export const App: React.FC = () => {
  const { activeView, toasts, removeToast, theme, hydratePreferences, setIsOnline } =
    useAppStore();
  const [isReady, setIsReady] = useState(false);

  const profileQuery = useLiveQuery(async () => {
    const row = await db.settings.get('profile');
    return { loaded: true, profile: row?.value as Profile | undefined };
  }, []);
  const isProfileLoaded = profileQuery?.loaded === true;
  const profile = profileQuery?.profile;

  useEffect(() => {
    hydratePreferences()
      .catch((e) => console.error('Failed to hydrate preferences:', e))
      .finally(() => setIsReady(true));
  }, [hydratePreferences]);

  // Keep system dark-mode listener active when theme === 'system'
  useEffect(() => {
    applyThemeToHtml(theme);
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeToHtml('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setIsOnline]);

  const toastPortal = (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 p-4 bg-white/95 dark:bg-[#2c2c2e]/95 backdrop-blur-xl rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.14)] border border-black/[0.06] dark:border-white/[0.1]"
        >
          {toast.type === 'success' && (
            <CheckCircle2 size={18} className="text-[#34c759] shrink-0 mt-0.5" />
          )}
          {toast.type === 'error' && (
            <AlertCircle size={18} className="text-[#ff3b30] shrink-0 mt-0.5" />
          )}
          {toast.type === 'info' && (
            <Info size={18} className="text-[#0071e3] shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              {toast.title}
            </div>
            {toast.message && (
              <div className="text-[11px] text-[#86868b] dark:text-[#98989d] mt-0.5 leading-snug">
                {toast.message}
              </div>
            )}
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  const fn = toast.onAction;
                  removeToast(toast.id);
                  if (fn) void fn();
                }}
                className="mt-2 px-3 py-1 rounded-full bg-[#0071e3] text-white text-[11px] font-semibold hover:bg-[#0077ed] transition-colors"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            aria-label="បិទការជូនដំណឹង"
            className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-white shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <AppInner
      isReady={isReady && isProfileLoaded}
      profile={profile}
      activeView={activeView}
      toastPortal={toastPortal}
    />
  );
};

const AppInner: React.FC<{
  isReady: boolean;
  profile: Profile | undefined;
  activeView: ReturnType<typeof useAppStore.getState>['activeView'];
  toastPortal: React.ReactNode;
}> = ({ isReady, profile, activeView, toastPortal }) => {
  const [provinceDismissed, setProvinceDismissed] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState('កណ្ដាល');
  const [savingProvince, setSavingProvince] = useState(false);
  const {
    pendingViewAfterLeaveConfirm,
    confirmLeaveUnsavedAttendance,
    cancelLeaveUnsavedAttendance,
  } = useAppStore();

  if (!isReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#111214]">
        <div className="w-16 h-16 rounded-3xl bg-white dark:bg-[#1c1c1e] shadow-md p-3 flex items-center justify-center mb-4 border border-black/[0.04] dark:border-white/[0.08] animate-pulse">
          <img
            src={MOEYS_EMBLEM_DATA_URI}
            alt="MoEYS Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
          KruDesk
        </h2>
        <p className="text-xs text-[#86868b] mt-1 font-battambang">
          កំពុងរៀបចំប្រព័ន្ធ និងទិន្នន័យក្នុងម៉ាស៊ីន (IndexedDB)...
        </p>
      </div>
    );
  }

  const hasValidProfile =
    profile &&
    profile.teacherName?.trim() &&
    profile.schoolName?.trim() &&
    profile.directorName?.trim();

  if (!hasValidProfile) {
    return (
      <>
        <OnboardingView />
        {toastPortal}
      </>
    );
  }

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView profile={profile} />;
      case 'students':
        return <StudentsView profile={profile} />;
      case 'roster':
        return <RosterView profile={profile} />;
      case 'attendance':
        return <AttendanceView profile={profile} />;
      case 'scores':
        return <ScoresView profile={profile} />;
      case 'cards':
        return <CardsView profile={profile} />;
      case 'settings':
        return <SettingsView profile={profile} />;
      default:
        return <DashboardView profile={profile} />;
    }
  };

  const showProvincePrompt = !profile.province?.trim() && !provinceDismissed;

  const handleSaveMissingProvince = async () => {
    if (!selectedProvince.trim()) return;
    setSavingProvince(true);
    try {
      await saveProfile({ ...profile, province: selectedProvince.trim() });
      setProvinceDismissed(true);
    } finally {
      setSavingProvince(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#111214] print:block print:h-auto print:overflow-visible print:bg-white">
      <AppleSidebar profile={profile} />

      <div className="flex-1 flex flex-col h-screen overflow-hidden print:block print:h-auto print:overflow-visible">
        <AppleHeader />

        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-6 print:overflow-visible print:pb-0">
          <Suspense
            fallback={
              <div className="p-8 text-center text-xs text-[#86868b]">កំពុងផ្ទុក...</div>
            }
          >
            {renderActiveView()}
          </Suspense>
        </main>
      </div>

      <MobileBottomNav />
      {toastPortal}

      {/* One-time prompt for existing profiles created before province field existed */}
      <AppleModal
        isOpen={showProvincePrompt}
        onClose={() => setProvinceDismissed(true)}
        title="ជ្រើសរើសខេត្ត / រាជធានី"
        subtitle="ប្រើសម្រាប់ក្បាលកាតសិស្ស (មន្ទីរអប់រំ យុវជន និងកីឡា...)"
        maxWidth="sm"
        footer={
          <>
            <AppleButton
              variant="secondary"
              size="sm"
              onClick={() => setProvinceDismissed(true)}
            >
              ពេលក្រោយ
            </AppleButton>
            <AppleButton
              variant="primary"
              size="sm"
              onClick={() => void handleSaveMissingProvince()}
              disabled={!selectedProvince.trim() || savingProvince}
            >
              រក្សាទុក
            </AppleButton>
          </>
        }
      >
        <div className="space-y-3">
          <label
            htmlFor="prompt-province-select"
            className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]"
          >
            ខេត្ត ឬរាជធានី
          </label>
          <select
            id="prompt-province-select"
            value={selectedProvince}
            onChange={(e) => setSelectedProvince(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1]"
          >
            {CAMBODIA_PROVINCES.map((prov) => (
              <option key={prov} value={prov} className="dark:bg-[#1c1c1e]">
                {prov}
              </option>
            ))}
          </select>
        </div>
      </AppleModal>

      <ConfirmDialog
        isOpen={pendingViewAfterLeaveConfirm !== null}
        onClose={cancelLeaveUnsavedAttendance}
        onConfirm={confirmLeaveUnsavedAttendance}
        title="មិនទាន់បានរក្សាទុកការហៅឈ្មោះ"
        message="អ្នកមានការកែប្រែវត្តមានដែលមិនទាន់បានចុច «រក្សាទុក» ទេ។ តើអ្នកពិតជាចង់ចាកចេញដោយបោះបង់ការកែប្រែទាំងនោះមែនទេ?"
        confirmLabel="ចាកចេញដោយមិនរក្សាទុក"
        cancelLabel="ត្រឡប់ក្រោយ"
        variant="danger"
      />
    </div>
  );
};

export default App;
