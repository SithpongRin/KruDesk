import React from 'react';
import clsx from 'clsx';

interface AppleBadgeProps {
  children: React.ReactNode;
  variant?: 'blue' | 'green' | 'orange' | 'red' | 'gray';
  size?: 'sm' | 'md';
  className?: string;
}

export const AppleBadge: React.FC<AppleBadgeProps> = ({
  children,
  variant = 'blue',
  size = 'md',
  className,
}) => {
  const variantClasses = {
    blue: 'bg-[#e8f2ff] text-[#0071e3] border-[#cce4ff] dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    green: 'bg-[#edf9f0] text-[#34c759] border-[#c8eed0] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    orange: 'bg-[#fff5e9] text-[#ff9500] border-[#ffe4c2] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    red: 'bg-[#ffefef] text-[#ff3b30] border-[#ffd4d1] dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
    gray: 'bg-[#f5f5f7] text-[#6e6e73] border-[#e5e5ea] dark:bg-white/[0.08] dark:text-[#a1a1a6] dark:border-white/[0.1]',
  };

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 rounded-full font-medium border',
    md: 'text-xs px-2.5 py-1 rounded-full font-medium border',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 select-none',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
