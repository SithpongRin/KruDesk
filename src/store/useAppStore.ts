import { create } from 'zustand';
import type { ThemeMode } from '../types/domain';
import { getSetting, setSetting } from '../db/database';
import { formatYearMonth, toLocalDateKey } from '../lib/khmerDate';

export type ActiveView =
  | 'dashboard'
  | 'students'
  | 'attendance'
  | 'scores'
  | 'cards'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

export function applyThemeToHtml(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
}

interface AppState {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  selectedClassId: number | null;
  setSelectedClassId: (classId: number | null) => void;

  selectedMonth: string; // YYYY-MM
  setSelectedMonth: (month: string) => void;

  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  useKhmerNumerals: boolean;
  setUseKhmerNumerals: (enabled: boolean) => void;

  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;

  pendingOpenCreateClass: boolean;
  requestOpenCreateClass: () => void;
  clearPendingOpenCreateClass: () => void;

  pendingRollCallDate: string | null;
  requestOpenRollCall: (dateKey?: string) => void;
  clearPendingRollCallDate: () => void;

  hasUnsavedAttendance: boolean;
  setHasUnsavedAttendance: (dirty: boolean) => void;
  pendingViewAfterLeaveConfirm: ActiveView | null;
  confirmLeaveUnsavedAttendance: () => void;
  cancelLeaveUnsavedAttendance: () => void;

  hydratePreferences: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'dashboard',
  setActiveView: (view) =>
    set((state) => {
      if (state.activeView === 'attendance' && view !== 'attendance' && state.hasUnsavedAttendance) {
        return { pendingViewAfterLeaveConfirm: view, isMobileSidebarOpen: false };
      }
      return { activeView: view, isMobileSidebarOpen: false };
    }),

  selectedClassId: null,
  setSelectedClassId: (classId) => {
    set({ selectedClassId: classId });
    setSetting('selectedClassId', classId).catch(() => {});
  },

  selectedMonth: formatYearMonth(),
  setSelectedMonth: (month) => {
    set({ selectedMonth: month });
    setSetting('selectedMonth', month).catch(() => {});
  },

  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    applyThemeToHtml(theme);
    setSetting('theme', theme).catch(() => {});
  },

  useKhmerNumerals: false,
  setUseKhmerNumerals: (enabled) => {
    set({ useKhmerNumerals: enabled });
    setSetting('useKhmerNumerals', enabled).catch(() => {});
  },

  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (toast.duration !== 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, toast.duration ?? 4000);
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setIsOnline: (online) => set({ isOnline: online }),

  isMobileSidebarOpen: false,
  setIsMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),
  toggleMobileSidebar: () =>
    set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),

  pendingOpenCreateClass: false,
  requestOpenCreateClass: () =>
    set({ activeView: 'students', pendingOpenCreateClass: true, isMobileSidebarOpen: false }),
  clearPendingOpenCreateClass: () => set({ pendingOpenCreateClass: false }),

  pendingRollCallDate: null,
  requestOpenRollCall: (dateKey) =>
    set({
      activeView: 'attendance',
      pendingRollCallDate: dateKey ?? toLocalDateKey(),
      isMobileSidebarOpen: false,
    }),
  clearPendingRollCallDate: () => set({ pendingRollCallDate: null }),

  hasUnsavedAttendance: false,
  setHasUnsavedAttendance: (dirty) => set({ hasUnsavedAttendance: dirty }),
  pendingViewAfterLeaveConfirm: null,
  confirmLeaveUnsavedAttendance: () =>
    set((state) => ({
      activeView: state.pendingViewAfterLeaveConfirm ?? state.activeView,
      pendingViewAfterLeaveConfirm: null,
      hasUnsavedAttendance: false,
    })),
  cancelLeaveUnsavedAttendance: () => set({ pendingViewAfterLeaveConfirm: null }),

  hydratePreferences: async () => {
    const [savedClassId, savedMonth, savedTheme, savedKhmerNumerals] = await Promise.all([
      getSetting<number | null>('selectedClassId'),
      getSetting<string>('selectedMonth'),
      getSetting<ThemeMode>('theme'),
      getSetting<boolean>('useKhmerNumerals'),
    ]);

    const theme: ThemeMode = savedTheme ?? 'system';
    applyThemeToHtml(theme);

    set({
      selectedClassId: savedClassId ?? null,
      selectedMonth: savedMonth || formatYearMonth(),
      theme,
      useKhmerNumerals: savedKhmerNumerals ?? false,
    });
  },
}));
