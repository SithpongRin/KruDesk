import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface AppleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
}

export const AppleModal: React.FC<AppleModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
}) => {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-md transition-opacity duration-200"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative w-full bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-black/[0.08] dark:border-white/[0.1] overflow-hidden flex flex-col z-10 max-h-[90vh]',
          maxWidthClasses[maxWidth]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#1c1c1e]/90 backdrop-blur-md shrink-0">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] flex items-center justify-center text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#98989d] dark:hover:text-white transition-colors"
            aria-label="បិទ"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-[#fafafc] dark:bg-[#161618] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
