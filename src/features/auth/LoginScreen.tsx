import React from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { isEmulatorEnabled } from '../../services/firebase/client';
import { MOEYS_EMBLEM_DATA_URI } from '../../utils/moeysEmblemDataUri';
import { signInWithEmulatorGoogle } from './authService';
import { useAuthStore } from './useAuthStore';

export const LoginScreen: React.FC = () => {
  const { signIn, isSigningIn, authError } = useAuthStore();
  const showEmulatorButtons = isEmulatorEnabled();

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#111214] p-4 font-battambang">
      <div className="w-full max-w-md bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-black/[0.06] dark:border-white/[0.08] p-7 sm:p-9 text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-[#f5f5f7] dark:bg-[#2c2c2e] shadow-sm p-3.5 flex items-center justify-center mb-5 border border-black/[0.04] dark:border-white/[0.08]">
          <img
            src={MOEYS_EMBLEM_DATA_URI}
            alt="MoEYS Emblem"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
          KruDesk
        </h1>
        <p className="text-xs text-[#6e6e73] dark:text-[#98989d] mt-1.5">
          ជំនួយការគ្រូបន្ទុកថ្នាក់ — គ្រប់គ្រងសិស្ស បញ្ជីវត្តមាន បញ្ជីពិន្ទុ និងកាតសិស្ស
        </p>

        <div className="mt-7 space-y-4">
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold shadow-[0_4px_14px_rgba(0,113,227,0.3)] transition-all"
          >
            <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </span>
            <span>{isSigningIn ? 'កំពុងភ្ជាប់គណនី Google...' : 'ចូលប្រើដោយ Google'}</span>
          </button>

          <div className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#f5f5f7] dark:bg-white/[0.06] text-[11px] font-medium text-[#6e6e73] dark:text-[#98989d]">
            <ShieldCheck size={13} className="text-[#0071e3] shrink-0" />
            <span>ត្រូវការការអនុញ្ញាតពី Admin</span>
          </div>

          {showEmulatorButtons && (
            <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] space-y-2">
              <div className="text-[11px] font-semibold text-[#86868b]">
                សាកល្បងជាមួយ Firebase Emulator
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void signInWithEmulatorGoogle({
                      email: 'teacher@example.com',
                      displayName: 'គ្រូ សុខា',
                    })
                  }
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1]"
                >
                  គ្រូថ្មី (teacher@example.com)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void signInWithEmulatorGoogle({
                      email: 'admin@example.com',
                      displayName: 'Admin KruDesk',
                    })
                  }
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-[#e8f2ff] dark:bg-blue-500/20 hover:bg-blue-100 text-[#0071e3] dark:text-blue-300 border border-[#0071e3]/30"
                >
                  គណនី Admin (admin@example.com)
                </button>
              </div>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 flex items-start gap-2.5 text-left text-xs text-red-700 dark:text-red-200"
            >
              <AlertCircle size={16} className="text-[#ff3b30] shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
