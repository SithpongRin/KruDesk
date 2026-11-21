import React from 'react';
import { KruDeskWordmark } from '../../components/common/KruDeskWordmark';
import { Clock, Ban, ShieldAlert, RefreshCw, LogOut, AlertCircle, Send } from 'lucide-react';
import { ADMIN_TELEGRAM_HANDLE, ADMIN_TELEGRAM_URL, TELEGRAM_BLUE } from '../../lib/contact';
import { AppleButton } from '../../components/common/AppleButton';
import type { UserApprovalStatus } from './authCache';
import { useAuthStore } from './useAuthStore';

interface AuthStatusScreenProps {
  status: Exclude<UserApprovalStatus, 'approved'>;
}

export const AuthStatusScreen: React.FC<AuthStatusScreenProps> = ({ status }) => {
  const { user, isChecking, authError, recheckStatus, signOut } = useAuthStore();

  const statusConfig = {
    pending: {
      icon: <Clock size={26} className="text-[#ff9500]" />,
      badgeBg: 'bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30',
      title: 'គណនីរបស់អ្នកកំពុងរង់ចាំការអនុញ្ញាតពី Admin',
      description:
        'សំណើចូលប្រើប្រាស់របស់អ្នកត្រូវបានបញ្ជូនរួចរាល់។ សូមរង់ចាំ Admin អនុញ្ញាត រួចចុច «ពិនិត្យម្ដងទៀត»។',
    },
    rejected: {
      icon: <Ban size={26} className="text-[#ff3b30]" />,
      badgeBg: 'bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/30',
      title: 'សំណើរបស់អ្នកមិនត្រូវបានអនុញ្ញាតទេ',
      description: 'សំណើចូលប្រើប្រាស់គណនីនេះត្រូវបានបដិសេធ។ សូមទាក់ទង Admin សម្រាប់ព័ត៌មានបន្ថែម។',
    },
    disabled: {
      icon: <ShieldAlert size={26} className="text-[#ff3b30]" />,
      badgeBg: 'bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/30',
      title: 'គណនីរបស់អ្នកត្រូវបានផ្អាក សូមទាក់ទង Admin',
      description: 'ការចូលប្រើប្រាស់របស់គណនីនេះត្រូវបានផ្អាកជាបណ្ដោះអាសន្ន។',
    },
  }[status];

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#111214] p-4 font-battambang">
      <div className="w-full max-w-md bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-black/[0.06] dark:border-white/[0.08] p-7 sm:p-8 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-5">
          <KruDeskWordmark className="text-2xl" />
        </div>

        <div
          className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center mb-4 ${statusConfig.badgeBg}`}
        >
          {statusConfig.icon}
        </div>

        <h1 className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] leading-snug">
          {statusConfig.title}
        </h1>
        <p className="text-xs text-[#6e6e73] dark:text-[#98989d] mt-2 leading-relaxed">
          {statusConfig.description}
        </p>

        {user && (
          <div className="mt-5 p-3.5 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08] flex items-center gap-3 text-left">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || user.email}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-black/[0.08] dark:border-white/[0.1]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#0071e3]/15 text-[#0071e3] font-bold text-sm flex items-center justify-center shrink-0">
                {(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {user.displayName && (
                <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                  {user.displayName}
                </div>
              )}
              <div className="text-xs text-[#6e6e73] dark:text-[#98989d] truncate">
                {user.email}
              </div>
            </div>
          </div>
        )}

        {authError && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 flex items-start gap-2 text-left text-xs text-red-700 dark:text-red-200"
          >
            <AlertCircle size={15} className="text-[#ff3b30] shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
          {status === 'pending' && (
            <AppleButton
              variant="primary"
              size="sm"
              icon={<RefreshCw size={15} className={isChecking ? 'animate-spin' : ''} />}
              onClick={() => void recheckStatus()}
              disabled={isChecking}
            >
              {isChecking ? 'កំពុងពិនិត្យ...' : 'ពិនិត្យម្ដងទៀត'}
            </AppleButton>
          )}

          <AppleButton
            variant="secondary"
            size="sm"
            icon={<LogOut size={15} />}
            onClick={() => void signOut()}
          >
            ចាកចេញ
          </AppleButton>
        </div>

        <a
          href={ADMIN_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-admin-telegram"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
          style={{ backgroundColor: TELEGRAM_BLUE }}
        >
          <Send size={15} />
          <span>ទាក់ទង Admin តាម Telegram ({ADMIN_TELEGRAM_HANDLE})</span>
        </a>
      </div>
    </div>
  );
};
