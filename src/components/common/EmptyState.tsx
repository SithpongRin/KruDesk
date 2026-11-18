import React from 'react';
import { AppleButton } from './AppleButton';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  hint,
  actionLabel,
  actionIcon,
  onAction,
}) => {
  return (
    <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-10 text-center flex flex-col items-center justify-center">
      <div className="w-14 h-14 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.06] text-[#0071e3] flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{title}</h3>
      <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1 max-w-md">{hint}</p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <AppleButton variant="primary" size="sm" icon={actionIcon} onClick={onAction}>
            {actionLabel}
          </AppleButton>
        </div>
      )}
    </div>
  );
};
