import React, { useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal, X } from 'lucide-react';
import { useAppStore, type ActiveView } from '../../store/useAppStore';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { getNavItems } from './AppleSidebar';

const PRIMARY_MOBILE_IDS = new Set<ActiveView>(['dashboard', 'students', 'attendance', 'scores']);

export const MobileBottomNav: React.FC = () => {
  const { activeView, setActiveView, useKhmerNumerals } = useAppStore();
  const { isAdmin, pendingUsersCount } = useAuthStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems = getNavItems(isAdmin);
  const primaryItems = navItems.filter((item) => PRIMARY_MOBILE_IDS.has(item.id));
  const moreItems = navItems.filter((item) => !PRIMARY_MOBILE_IDS.has(item.id));
  const isMoreActive = moreItems.some((item) => item.id === activeView);

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 print:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-x-0 bottom-0 bg-white dark:bg-[#1c1c1e] rounded-t-3xl border-t border-black/[0.08] dark:border-white/[0.1] shadow-2xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] z-50">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                ម៉ឺនុយផ្សេងទៀត
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="បិទ"
                className="p-1.5 rounded-full bg-[#f5f5f7] dark:bg-white/[0.08] text-[#6e6e73] dark:text-[#e5e5ea]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMoreOpen(false);
                    }}
                    className={clsx(
                      'relative flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border text-center transition-all active:scale-95',
                      isActive
                        ? 'bg-[#0071e3] text-white border-[#0071e3]'
                        : 'bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border-black/[0.04] dark:border-white/[0.08]'
                    )}
                  >
                    <span>{item.icon}</span>
                    <span className="text-[11px] font-battambang leading-tight">
                      {item.label}
                    </span>
                    {item.id === 'adminUsers' && isAdmin && pendingUsersCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-[#ff9500] text-white text-[10px] font-bold leading-none">
                        {useKhmerNumerals ? toKhmerNumerals(pendingUsersCount) : pendingUsersCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border-t border-black/[0.08] dark:border-white/[0.08] px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))] flex items-center justify-around select-none shadow-[0_-4px_20px_rgba(0,0,0,0.04)] print:hidden"
        aria-label="Mobile Navigation"
      >
        {primaryItems.map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id)}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all duration-150 active:scale-90 min-w-0',
                isActive
                  ? 'text-[#0071e3] font-bold'
                  : 'text-[#86868b] dark:text-[#98989d] hover:text-[#1d1d1f] dark:hover:text-white'
              )}
            >
              <div className="relative">
                {tab.icon}
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#0071e3]" />
                )}
              </div>
              <span
                className={clsx(
                  'text-[10px] font-battambang mt-1 leading-tight truncate max-w-[64px]',
                  isActive ? 'font-bold text-[#0071e3]' : 'font-medium'
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={clsx(
            'flex-1 flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all duration-150 active:scale-90 min-w-0',
            isMoreActive
              ? 'text-[#0071e3] font-bold'
              : 'text-[#86868b] dark:text-[#98989d] hover:text-[#1d1d1f] dark:hover:text-white'
          )}
        >
          <div className="relative">
            <MoreHorizontal size={18} />
            {isAdmin && pendingUsersCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full bg-[#ff9500] text-white text-[9px] font-bold leading-tight">
                {useKhmerNumerals ? toKhmerNumerals(pendingUsersCount) : pendingUsersCount}
              </span>
            )}
            {isMoreActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#0071e3]" />
            )}
          </div>
          <span
            className={clsx(
              'text-[10px] font-battambang mt-1 leading-tight truncate max-w-[64px]',
              isMoreActive ? 'font-bold text-[#0071e3]' : 'font-medium'
            )}
          >
            ច្រើនទៀត
          </span>
        </button>
      </nav>
    </>
  );
};
