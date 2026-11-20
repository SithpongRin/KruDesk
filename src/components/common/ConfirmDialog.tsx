import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppleModal } from './AppleModal';
import { AppleButton } from './AppleButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'បញ្ជាក់',
  cancelLabel = 'បោះបង់',
  variant = 'danger',
  isLoading = false,
  children,
}) => {
  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {variant === 'danger' && <AlertTriangle size={18} className="text-[#ff3b30]" />}
          <span>{title}</span>
        </span>
      }
      maxWidth="sm"
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </AppleButton>
          <AppleButton
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {confirmLabel}
          </AppleButton>
        </>
      }
    >
      <p className="text-sm text-[#1d1d1f] dark:text-[#e5e5ea] leading-relaxed">{message}</p>
      {children}
    </AppleModal>
  );
};
