import React from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import { NAV_ITEMS } from './AppleSidebar';

export const MobileBottomNav: React.FC = () => {
  const { activeView, setActiveView } = useAppStore();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border-t border-black/[0.08] dark:border-white/[0.08] px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0.5rem))] flex items-center justify-around select-none shadow-[0_-4px_20px_rgba(0,0,0,0.04)] print:hidden"
      aria-label="Mobile Navigation"
    >
      {NAV_ITEMS.map((tab) => {
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
                'text-[10px] font-battambang mt-1 leading-tight truncate max-w-[56px]',
                isActive ? 'font-bold text-[#0071e3]' : 'font-medium'
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
