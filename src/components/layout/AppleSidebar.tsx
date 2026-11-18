import React from 'react';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  Settings,
  WifiOff,
  Check,
  X,
} from 'lucide-react';
import { useAppStore, type ActiveView } from '../../store/useAppStore';
import type { Profile } from '../../types/domain';
import { MOEYS_EMBLEM_DATA_URI } from '../../utils/moeysEmblemDataUri';

interface AppleSidebarProps {
  profile: Profile;
}

interface NavItem {
  id: ActiveView;
  label: string;
  icon: React.ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'ផ្ទាំងដើម', icon: <LayoutDashboard size={18} /> },
  { id: 'students', label: 'សិស្ស', icon: <Users size={18} /> },
  { id: 'attendance', label: 'បញ្ជីហៅឈ្មោះ', icon: <CalendarCheck size={18} /> },
  { id: 'scores', label: 'បញ្ជីពិន្ទុ', icon: <ClipboardList size={18} /> },
  { id: 'cards', label: 'កាតសិស្ស', icon: <CreditCard size={18} /> },
  { id: 'settings', label: 'ការកំណត់', icon: <Settings size={18} /> },
];

export const AppleSidebar: React.FC<AppleSidebarProps> = ({ profile }) => {
  const { activeView, setActiveView, isMobileSidebarOpen, setIsMobileSidebarOpen } = useAppStore();

  const renderNavContent = (isMobile = false) => (
    <>
      <div>
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#2c2c2e] shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.08] flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                <img
                  src={MOEYS_EMBLEM_DATA_URI}
                  alt="MoEYS Emblem"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-moul text-sm text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight truncate">
                  KruDesk
                </h1>
                <p className="text-[11px] font-medium text-[#86868b] truncate">
                  ជំនួយការគ្រូបន្ទុកថ្នាក់
                </p>
              </div>
            </div>

            {isMobile && (
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.1] hover:bg-black/[0.1] flex items-center justify-center text-[#6e6e73] dark:text-[#e5e5ea] active:scale-95 transition-all"
                aria-label="បិទម៉ឺនុយរុករក"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <nav className="px-3 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all duration-150 group text-left active:scale-[0.98]',
                  isActive
                    ? 'bg-[#0071e3] text-white shadow-[0_2px_8px_rgba(0,113,227,0.25)]'
                    : 'text-[#1d1d1f] dark:text-[#e5e5ea] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                )}
              >
                <span
                  className={clsx(
                    'transition-colors shrink-0',
                    isActive
                      ? 'text-white'
                      : 'text-[#6e6e73] dark:text-[#98989d] group-hover:text-[#1d1d1f] dark:group-hover:text-white'
                  )}
                >
                  {item.icon}
                </span>
                <span className="font-battambang leading-tight text-[13px] truncate">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer: Teacher name + School name + Offline ✓ badge */}
      <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
        <div className="bg-white/80 dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.08] rounded-2xl p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                {profile.teacherName}
              </div>
              <div className="text-[11px] text-[#86868b] dark:text-[#98989d] truncate mt-0.5">
                {profile.schoolName}
              </div>
            </div>
            <WifiOff size={13} className="text-[#86868b] shrink-0 mt-0.5" />
          </div>

          <div className="mt-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#34c759]">
              <span className="w-2 h-2 rounded-full bg-[#34c759]" />
              <span>Offline</span>
              <Check size={12} strokeWidth={2.5} />
            </span>
            <span className="text-[10px] text-[#86868b] truncate">
              {profile.academicYear}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden md:flex w-64 h-screen bg-[#f5f5f7]/90 dark:bg-[#161618]/95 backdrop-blur-2xl border-r border-black/[0.06] dark:border-white/[0.08] flex-col justify-between shrink-0 select-none z-20 print:hidden">
        {renderNavContent(false)}
      </aside>

      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-200"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-72 h-full bg-[#f5f5f7] dark:bg-[#161618] border-r border-black/[0.08] dark:border-white/[0.1] shadow-2xl flex flex-col justify-between select-none transition-transform duration-200 ease-out md:hidden overflow-y-auto print:hidden',
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {renderNavContent(true)}
      </aside>
    </>
  );
};
