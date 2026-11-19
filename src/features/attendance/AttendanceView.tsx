import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GraduationCap,
  Save,
  Settings as SettingsIcon,
  Table2,
  Trash2,
} from 'lucide-react';
import { db } from '../../db/database';
import { deleteAttendanceSession, saveAttendanceSession } from '../../db/attendanceRepo';
import { useAppStore } from '../../store/useAppStore';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  type AbsenceCode,
  type AttendanceConfig,
  type Profile,
  type SchoolClass,
  type Student,
} from '../../types/domain';
import {
  buildTakenDatesSet,
  canTakeRollCallDate,
  computeStudentMonthlyAttendance,
  getActiveStudentsOrdered,
  getMonthDayInfos,
  type MonthDayInfo,
} from '../../lib/attendance';
import {
  formatDateKhmer,
  formatDateTimeKm,
  formatKhmerMonthYear,
  parseYearMonth,
  toLocalDateKey,
} from '../../lib/khmerDate';
import { buildExportFileName } from '../../lib/exportFilename';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleSegmentedControl } from '../../components/common/AppleSegmentedControl';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ExportDialog, type ExportFormat } from '../../components/common/ExportDialog';
import {
  AttendanceSheet,
  type AttendanceMonthRenderData,
} from '../../print/AttendanceSheet';
import { exportAttendanceExcel } from '../../services/excelExport';
import { ensurePrintFontsReady, exportPrintNodesToPdf, nextPaint } from '../../services/pdfExport';

interface AttendanceViewProps {
  profile: Profile;
}

type ViewTab = 'rollcall' | 'grid';

const EMPTY_STUDENT_MAP = new Map<string, AbsenceCode>();

function shiftLocalDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return toLocalDateKey(new Date(y, m - 1, d + deltaDays));
}

function mapsEqual(a: Map<number, AbsenceCode>, b: Map<number, AbsenceCode>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

interface AttendanceRowProps {
  student: Student;
  rowIdx: number;
  dayInfos: MonthDayInfo[];
  studentLookup: Map<string, AbsenceCode>;
  useKhmerNumerals: boolean;
  onOpenDateRollCall: (dateKey: string) => void;
}

const AttendanceRow = memo<AttendanceRowProps>(
  ({
    student,
    rowIdx,
    dayInfos,
    studentLookup,
    useKhmerNumerals,
    onOpenDateRollCall,
  }) => {
    const fmt = (v: number | string) =>
      useKhmerNumerals ? toKhmerNumerals(v) : toArabicNumerals(String(v));

    let excusedLeave = 0;
    let sickCount = 0;
    let unexcused = 0;
    let takenDaysCount = 0;

    for (const d of dayInfos) {
      if (!d.isCountable) continue;
      takenDaysCount++;
      const c = studentLookup.get(d.dateKey);
      if (c === 'ច្ប') excusedLeave++;
      else if (c === 'ឈ') sickCount++;
      else if (c === 'អច្ប') unexcused++;
    }
    const excused = excusedLeave + sickCount;
    const total = excused + unexcused;
    const present = Math.max(0, takenDaysCount - total);

    return (
      <tr className="hover:bg-[#f5f5f7]/40 dark:hover:bg-white/[0.02] transition-colors">
        <td className="sticky left-0 z-10 bg-white dark:bg-[#1c1c1e] border-b border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] w-10">
          {fmt(rowIdx + 1)}
        </td>
        <td className="sticky left-10 z-10 bg-white dark:bg-[#1c1c1e] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-1.5 font-medium text-[#1d1d1f] dark:text-[#f5f5f7] whitespace-nowrap min-w-[155px] max-w-[190px] truncate shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
          {student.nameKm}
        </td>

        {dayInfos.map((d, colIdx) => {
          if (d.isNonSchoolDay) {
            return (
              <td
                key={d.dateKey}
                title={d.isHoliday ? 'ថ្ងៃឈប់សម្រាក' : 'ថ្ងៃឈប់ប្រចាំសប្ដាហ៍'}
                className="border-b border-r border-black/[0.05] dark:border-white/[0.06] bg-slate-200/80 dark:bg-white/[0.06] text-center p-0.5 cursor-not-allowed select-none"
              >
                <span className="inline-block w-7 h-7 leading-7 text-[10px] text-[#86868b]">
                  —
                </span>
              </td>
            );
          }

          if (d.isFuture) {
            return (
              <td
                key={d.dateKey}
                title="ថ្ងៃខាងមុខ (មិនទាន់រាប់)"
                className="border-b border-r border-black/[0.05] dark:border-white/[0.06] p-0.5 text-center opacity-40 select-none"
              >
                <span className="inline-block w-7 h-7 leading-7 text-[10px] text-[#86868b]" />
              </td>
            );
          }

          if (!d.isTaken) {
            return (
              <td
                key={d.dateKey}
                className="border-b border-r border-black/[0.05] dark:border-white/[0.06] bg-slate-100/80 dark:bg-white/[0.03] p-0.5 text-center"
              >
                <button
                  type="button"
                  data-att-cell={`${rowIdx}-${colIdx}`}
                  title={`មិនទាន់ហៅឈ្មោះ (${d.dateKey}) — ចុចដើម្បីហៅឈ្មោះ`}
                  onClick={() => onOpenDateRollCall(d.dateKey)}
                  className="w-8 h-7 rounded-md text-[11px] bg-transparent hover:bg-slate-200/80 dark:hover:bg-white/[0.08] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  aria-label={`ហៅឈ្មោះ ${d.dateKey}`}
                />
              </td>
            );
          }

          const code = studentLookup.get(d.dateKey);
          let cellStyle =
            'bg-[#edf9f0]/70 text-[#34c759] hover:bg-[#d8f3df] dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20';
          if (code === 'ច្ប') {
            cellStyle =
              'bg-[#e8f2ff] text-[#0071e3] font-bold hover:bg-[#d2e6ff] dark:bg-blue-500/20 dark:text-blue-300';
          } else if (code === 'អច្ប') {
            cellStyle =
              'bg-[#ffefef] text-[#ff3b30] font-bold hover:bg-[#ffd8d6] dark:bg-red-500/20 dark:text-red-300';
          } else if (code === 'ឈ') {
            cellStyle =
              'bg-[#fff5e9] text-[#ff9500] font-bold hover:bg-[#ffe5c4] dark:bg-amber-500/20 dark:text-amber-300';
          }

          return (
            <td
              key={d.dateKey}
              className="border-b border-r border-black/[0.05] dark:border-white/[0.06] p-0.5 text-center"
            >
              <button
                type="button"
                data-att-cell={`${rowIdx}-${colIdx}`}
                title={`${student.nameKm} (${d.dateKey}) — ចុចដើម្បីកែសម្រួល`}
                onClick={() => onOpenDateRollCall(d.dateKey)}
                className={`w-8 h-7 rounded-md text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0071e3] ${cellStyle}`}
              >
                {code || '✓'}
              </button>
            </td>
          );
        })}

        <td className="border-b border-r border-black/[0.05] dark:border-white/[0.06] px-2 py-1 text-center font-semibold text-[#34c759]">
          {fmt(present)}
        </td>
        <td className="border-b border-r border-black/[0.05] dark:border-white/[0.06] px-2 py-1 text-center font-semibold text-[#0071e3]">
          {fmt(excused)}
        </td>
        <td className="border-b border-r border-black/[0.05] dark:border-white/[0.06] px-2 py-1 text-center font-semibold text-[#ff3b30]">
          {fmt(unexcused)}
        </td>
        <td className="border-b border-black/[0.05] dark:border-white/[0.06] px-2 py-1 text-center font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
          {fmt(total)}
        </td>
      </tr>
    );
  }
);
AttendanceRow.displayName = 'AttendanceRow';

interface RollCallStudentRowProps {
  student: Student;
  index: number;
  currentStatus: AbsenceCode | null;
  useKhmerNumerals: boolean;
  onSelectStatus: (studentRef: number, nextStatus: AbsenceCode | null) => void;
}

const ROLLCALL_BUTTONS = [
  { code: null, label: '✓ មក', activeCls: 'bg-[#34c759] text-white' },
  { code: 'ច្ប' as const, label: 'ច្ប', activeCls: 'bg-[#0071e3] text-white' },
  { code: 'អច្ប' as const, label: 'អច្ប', activeCls: 'bg-[#ff3b30] text-white' },
  { code: 'ឈ' as const, label: 'ឈ', activeCls: 'bg-[#ff9500] text-white' },
] as const;

const RollCallStudentRow = memo<RollCallStudentRowProps>(
  ({ student, index, currentStatus, useKhmerNumerals, onSelectStatus }) => {
    const sid = student.id!;
    const numLabel = useKhmerNumerals ? toKhmerNumerals(index + 1) : String(index + 1);

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#f5f5f7]/70 dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-7 h-7 rounded-full bg-white dark:bg-white/[0.08] text-xs font-bold flex items-center justify-center shrink-0">
            {numLabel}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
              {student.nameKm}
            </div>
            <div className="text-[11px] text-[#86868b] font-mono">{student.studentId}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
          {ROLLCALL_BUTTONS.map((btn) => {
            const active = currentStatus === btn.code;
            return (
              <button
                key={String(btn.code)}
                type="button"
                data-rollcall-btn={`${sid}-${btn.code ?? 'present'}`}
                onClick={() => onSelectStatus(sid, btn.code)}
                className={`flex-1 sm:flex-initial min-h-[44px] min-w-[56px] px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                  active
                    ? btn.activeCls
                    : 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#e5e5ea] border border-black/[0.06] dark:border-white/[0.1]'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
RollCallStudentRow.displayName = 'RollCallStudentRow';

export const AttendanceView: React.FC<AttendanceViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    selectedMonth,
    useKhmerNumerals,
    setActiveView,
    pendingRollCallDate,
    clearPendingRollCallDate,
    setHasUnsavedAttendance,
    addToast,
  } = useAppStore();

  const todayKey = toLocalDateKey(new Date());
  const [tab, setTab] = useState<ViewTab>('rollcall');
  const [rollCallDate, setRollCallDate] = useState<string>(todayKey);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Consume navigation request from Dashboard ("ហៅឈ្មោះថ្ងៃនេះ")
  useEffect(() => {
    if (pendingRollCallDate) {
      setRollCallDate(pendingRollCallDate);
      setTab('rollcall');
      clearPendingRollCallDate();
    }
  }, [pendingRollCallDate, clearPendingRollCallDate]);

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const currentClass = useMemo(
    () => classes?.find((c) => c.id === selectedClassId) ?? classes?.[0],
    [classes, selectedClassId]
  );

  const classStudentsRaw = useLiveQuery(
    async () => {
      if (!currentClass?.id) return [];
      return db.students.where('classId').equals(currentClass.id).toArray();
    },
    [currentClass?.id]
  );

  const rollCallMonth = rollCallDate.slice(0, 7);
  const rollCallStudents = useMemo(
    () => getActiveStudentsOrdered(classStudentsRaw || [], rollCallMonth),
    [classStudentsRaw, rollCallMonth]
  );

  const activeStudents = useMemo(
    () => getActiveStudentsOrdered(classStudentsRaw || [], selectedMonth),
    [classStudentsRaw, selectedMonth]
  );

  const attendanceCfgRow = useLiveQuery(() => db.settings.get('attendanceConfig'), []);
  const attendanceConfig: AttendanceConfig =
    (attendanceCfgRow?.value as AttendanceConfig) ?? DEFAULT_ATTENDANCE_CONFIG;

  const holidays = useLiveQuery(() => db.holidays.toArray(), []);
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays || []) map.set(h.date, h.label);
    return map;
  }, [holidays]);
  const holidayDates = useMemo(() => new Set(holidayMap.keys()), [holidayMap]);

  // Live session + absence rows for the Roll Call date
  const rollCallSession = useLiveQuery(async () => {
    if (!currentClass?.id) return undefined;
    return db.attendanceSessions.get([currentClass.id, rollCallDate]);
  }, [currentClass?.id, rollCallDate]);

  const rollCallSavedRows = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    return db.attendance
      .where('[classId+date]')
      .equals([currentClass.id, rollCallDate])
      .toArray();
  }, [currentClass?.id, rollCallDate]);

  const savedMap = useMemo(() => {
    const m = new Map<number, AbsenceCode>();
    for (const r of rollCallSavedRows || []) {
      m.set(r.studentRef, r.status);
    }
    return m;
  }, [rollCallSavedRows]);

  const savedSignature = useMemo(() => {
    if (rollCallSavedRows === undefined) return 'loading';
    const entries = rollCallSavedRows
      .map((r) => `${r.studentRef}:${r.status}`)
      .sort()
      .join(',');
    return `${currentClass?.id ?? 'none'}|${rollCallDate}|${rollCallSession?.savedAt ?? 'none'}|${entries}`;
  }, [currentClass?.id, rollCallDate, rollCallSession?.savedAt, rollCallSavedRows]);

  const lastSyncedSigRef = useRef<string>('');
  const [draftMap, setDraftMap] = useState<Map<number, AbsenceCode>>(new Map());
  const [isSavingRollCall, setIsSavingRollCall] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<
    | { kind: 'tab'; tab: ViewTab }
    | { kind: 'date'; dateKey: string }
    | null
  >(null);

  // Sync draft state only when loading completes or persisted session/rows actually change
  useEffect(() => {
    if (savedSignature === 'loading') return;
    if (lastSyncedSigRef.current === savedSignature) return;
    lastSyncedSigRef.current = savedSignature;
    setDraftMap(new Map(savedMap));
  }, [savedSignature, savedMap]);

  const isDirty = useMemo(
    () => tab === 'rollcall' && !mapsEqual(draftMap, savedMap),
    [tab, draftMap, savedMap]
  );

  useEffect(() => {
    setHasUnsavedAttendance(isDirty);
    return () => setHasUnsavedAttendance(false);
  }, [isDirty, setHasUnsavedAttendance]);

  useEffect(() => {
    if (!isDirty || typeof window === 'undefined') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const dateGuard = useMemo(
    () =>
      canTakeRollCallDate(rollCallDate, {
        restWeekdays: attendanceConfig.restWeekdays,
        holidayDates,
        todayKey,
      }),
    [rollCallDate, attendanceConfig.restWeekdays, holidayDates, todayKey]
  );

  const fmtNum = (val: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const dateGuardAllowedRef = useRef(dateGuard.allowed);
  dateGuardAllowedRef.current = dateGuard.allowed;

  const setDraftStatus = useCallback((studentRef: number, nextStatus: AbsenceCode | null) => {
    if (!dateGuardAllowedRef.current) return;
    setDraftMap((prev) => {
      const curr = prev.get(studentRef) ?? null;
      if (curr === nextStatus) return prev;
      const next = new Map(prev);
      if (nextStatus === null) next.delete(studentRef);
      else next.set(studentRef, nextStatus);
      return next;
    });
  }, []);

  const handleSaveRollCall = async () => {
    if (!currentClass?.id || !dateGuard.allowed) return;
    setIsSavingRollCall(true);
    try {
      const activeIds = new Set(rollCallStudents.map((s) => s.id).filter((x): x is number => x !== undefined));
      const absences: Array<{ studentRef: number; status: AbsenceCode }> = [];
      for (const [studentRef, status] of draftMap.entries()) {
        if (activeIds.has(studentRef)) {
          absences.push({ studentRef, status });
        }
      }
      await saveAttendanceSession({
        classId: currentClass.id,
        date: rollCallDate,
        absences,
      });

      const absentCount = absences.length;
      const presentCount = Math.max(0, rollCallStudents.length - absentCount);
      setHasUnsavedAttendance(false);

      addToast({
        type: 'success',
        title: `បានរក្សាទុក ${formatDateKhmer(rollCallDate, useKhmerNumerals)} (មក ${fmtNum(
          presentCount
        )} · អវត្តមាន ${fmtNum(absentCount)})`,
      });
    } finally {
      setIsSavingRollCall(false);
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!currentClass?.id) return;
    await deleteAttendanceSession(currentClass.id, rollCallDate);
    setDraftMap(new Map());
    setHasUnsavedAttendance(false);
    setIsDeleteConfirmOpen(false);
    addToast({
      type: 'info',
      title: `បានលុបការហៅឈ្មោះ ${formatDateKhmer(rollCallDate, useKhmerNumerals)}`,
    });
  };

  const handleRequestTabChange = (nextTab: ViewTab) => {
    if (nextTab === tab) return;
    if (isDirty) {
      setPendingDiscardAction({ kind: 'tab', tab: nextTab });
      return;
    }
    setTab(nextTab);
  };

  const handleRequestDateChange = (nextDate: string) => {
    if (!nextDate || nextDate === rollCallDate) return;
    if (isDirty) {
      setPendingDiscardAction({ kind: 'date', dateKey: nextDate });
      return;
    }
    setRollCallDate(nextDate);
  };

  const handleConfirmDiscard = () => {
    if (!pendingDiscardAction) return;
    setDraftMap(new Map(savedMap));
    setHasUnsavedAttendance(false);
    if (pendingDiscardAction.kind === 'tab') {
      setTab(pendingDiscardAction.tab);
    } else {
      setRollCallDate(pendingDiscardAction.dateKey);
      setTab('rollcall');
    }
    setPendingDiscardAction(null);
  };

  const handleOpenDateRollCallFromGrid = useCallback(
    (dateKey: string) => {
      setRollCallDate(dateKey);
      setTab('rollcall');
    },
    []
  );

  // Monthly grid live data (absences + sessions)
  const monthSessions = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    return db.attendanceSessions
      .where('[classId+date]')
      .between([currentClass.id, `${selectedMonth}-01`], [currentClass.id, `${selectedMonth}-31`], true, true)
      .toArray();
  }, [currentClass?.id, selectedMonth]);

  const monthAttendanceRows = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    return db.attendance
      .where('[classId+date]')
      .between([currentClass.id, `${selectedMonth}-01`], [currentClass.id, `${selectedMonth}-31`], true, true)
      .toArray();
  }, [currentClass?.id, selectedMonth]);

  const takenDates = useMemo(
    () => buildTakenDatesSet(monthSessions || []),
    [monthSessions]
  );

  const byStudent = useMemo(() => {
    const next = new Map<number, Map<string, AbsenceCode>>();
    for (const r of monthAttendanceRows || []) {
      let inner = next.get(r.studentRef);
      if (!inner) {
        inner = new Map<string, AbsenceCode>();
        next.set(r.studentRef, inner);
      }
      inner.set(r.date, r.status);
    }
    return next;
  }, [monthAttendanceRows]);

  const { year, month } = parseYearMonth(selectedMonth);
  const dayInfos = useMemo(
    () =>
      getMonthDayInfos(year, month, {
        restWeekdays: attendanceConfig.restWeekdays,
        holidayDates,
        todayKey,
        takenDates,
      }),
    [year, month, attendanceConfig.restWeekdays, holidayDates, todayKey, takenDates]
  );

  const takenDaysCount = useMemo(
    () => dayInfos.filter((d) => d.isCountable).length,
    [dayInfos]
  );

  // Daily footer counts & grand totals (only taken days)
  const dailyTotals = useMemo(() => {
    return dayInfos.map((d) => {
      if (!d.isCountable) return null;
      let cnt = 0;
      for (const s of activeStudents) {
        if (s.id !== undefined && byStudent.get(s.id)?.has(d.dateKey)) cnt++;
      }
      return cnt;
    });
  }, [dayInfos, activeStudents, byStudent]);

  const grandTotals = useMemo(() => {
    let excused = 0;
    let unexcused = 0;
    let present = 0;
    for (const s of activeStudents) {
      if (s.id === undefined) continue;
      const sMap = byStudent.get(s.id);
      let sAbs = 0;
      for (const d of dayInfos) {
        if (!d.isCountable) continue;
        const c = sMap?.get(d.dateKey);
        if (c === 'ច្ប' || c === 'ឈ') {
          excused++;
          sAbs++;
        } else if (c === 'អច្ប') {
          unexcused++;
          sAbs++;
        }
      }
      present += Math.max(0, takenDaysCount - sAbs);
    }
    return { present, excused, unexcused, total: excused + unexcused };
  }, [activeStudents, byStudent, dayInfos, takenDaysCount]);

  // Print / PDF stage
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const [printData, setPrintData] = useState<{
    cls: SchoolClass;
    students: Student[];
    monthsData: AttendanceMonthRenderData[];
  } | null>(null);

  const handleExport = async ({
    format,
    classId,
    months,
  }: {
    format: ExportFormat;
    classId: number;
    months: string[];
  }) => {
    const cls = classes?.find((c) => c.id === classId);
    if (!cls) return;

    const students = await db.students.where('classId').equals(classId).toArray();
    const monthsData: AttendanceMonthRenderData[] = [];

    for (const m of months) {
      const [rows, sessions] = await Promise.all([
        db.attendance
          .where('[classId+date]')
          .between([classId, `${m}-01`], [classId, `${m}-31`], true, true)
          .toArray(),
        db.attendanceSessions
          .where('[classId+date]')
          .between([classId, `${m}-01`], [classId, `${m}-31`], true, true)
          .toArray(),
      ]);
      const lookup = new Map<string, AbsenceCode>();
      for (const r of rows) {
        lookup.set(`${r.studentRef}|${r.date}`, r.status);
      }
      monthsData.push({
        month: m,
        lookup,
        takenDates: buildTakenDatesSet(sessions),
      });
    }

    try {
      if (format === 'excel') {
        const fileName = await exportAttendanceExcel({
          cls,
          students,
          profile,
          monthsData,
          attendanceConfig,
          holidayDates,
          todayKey,
          useKhmerDigits: useKhmerNumerals,
        });
        addToast({ type: 'success', title: 'នាំចេញ Excel ជោគជ័យ!', message: fileName });
        return;
      }

      setPrintData({ cls, students, monthsData });
      await new Promise((r) => setTimeout(r, 80));
      await nextPaint();

      if (format === 'print') {
        await ensurePrintFontsReady();
        window.print();
        return;
      }

      if (format === 'pdf') {
        const stage = pdfStageRef.current;
        if (!stage) return;
        const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
        const fileName =
          months.length === 1
            ? buildExportFileName({
                document: 'បញ្ជីវត្តមាន',
                className: cls.name,
                month: months[0],
                ext: 'pdf',
                useKhmerDigits: useKhmerNumerals,
              })
            : buildExportFileName({
                document: 'បញ្ជីវត្តមាន',
                className: cls.name,
                month: `${months.length}ខែ`,
                year: cls.academicYear,
                ext: 'pdf',
                useKhmerDigits: useKhmerNumerals,
              });
        await exportPrintNodesToPdf(pageNodes, {
          fileName,
          orientation: 'landscape',
          pixelRatio: 3,
        });
        addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
      }
    } catch (err) {
      console.error('Attendance export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      if (format !== 'print') setPrintData(null);
    }
  };

  if (!classes || classes.length === 0 || !currentClass) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<GraduationCap size={28} />}
          title="មិនទាន់មានថ្នាក់រៀននៅឡើយទេ"
          hint="សូមបង្កើតថ្នាក់រៀន និងបញ្ចូលឈ្មោះសិស្សជាមុនសិន មុននឹងកត់ត្រាវត្តមាន។"
          actionLabel="ទៅកាន់ សិស្ស"
          onAction={() => setActiveView('students')}
        />
      </div>
    );
  }

  const draftAbsentCount = rollCallStudents.reduce(
    (cnt, s) => (s.id !== undefined && draftMap.has(s.id) ? cnt + 1 : cnt),
    0
  );
  const draftPresentCount = Math.max(0, rollCallStudents.length - draftAbsentCount);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
            បញ្ជីវត្តមាន — ថ្នាក់ទី {currentClass.name}
          </h1>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            {formatKhmerMonthYear(selectedMonth, useKhmerNumerals)} · សិស្សកំពុងរៀន{' '}
            {fmtNum(tab === 'rollcall' ? rollCallStudents.length : activeStudents.length)} នាក់
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <AppleSegmentedControl<ViewTab>
            size="sm"
            value={tab}
            onChange={handleRequestTabChange}
            options={[
              { value: 'rollcall', label: 'ហៅឈ្មោះ', icon: <CalendarCheck size={13} /> },
              { value: 'grid', label: 'តារាងប្រចាំខែ', icon: <Table2 size={13} /> },
            ]}
          />

          <AppleButton
            variant="secondary"
            size="sm"
            icon={<SettingsIcon size={14} />}
            onClick={() => setActiveView('settings')}
          >
            ថ្ងៃឈប់សម្រាក
          </AppleButton>

          <AppleButton
            variant="primary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => setIsExportOpen(true)}
            disabled={activeStudents.length === 0}
          >
            នាំចេញ
          </AppleButton>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <AppleBadge variant="green" size="sm">✓ មករៀន</AppleBadge>
        <AppleBadge variant="blue" size="sm">ច្ប មានច្បាប់</AppleBadge>
        <AppleBadge variant="red" size="sm">អច្ប អត់ច្បាប់</AppleBadge>
        <AppleBadge variant="orange" size="sm">ឈ ឈឺ — រាប់ក្នុង ច្ប</AppleBadge>
      </div>

      {tab === 'rollcall' ? (
        /* Main Roll Call Flow */
        <AppleCard
          title={`ហៅឈ្មោះ — ${formatDateKhmer(rollCallDate, useKhmerNumerals)}`}
          subtitle={
            !dateGuard.allowed
              ? undefined
              : rollCallSession
                ? rollCallSession.migrated
                  ? 'បានរក្សាទុក (ពីទិន្នន័យចាស់)'
                  : `បានរក្សាទុកនៅ ${formatDateTimeKm(rollCallSession.savedAt, useKhmerNumerals)}`
                : 'មិនទាន់ហៅឈ្មោះសម្រាប់ថ្ងៃនេះទេ (ព្រាង — មិនទាន់រក្សាទុក)'
          }
          headerAction={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRequestDateChange(shiftLocalDateKey(rollCallDate, -1))}
                  aria-label="ថ្ងៃមុន"
                  className="p-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] text-[#1d1d1f] dark:text-[#f5f5f7] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="date"
                  aria-label="ជ្រើសរើសកាលបរិច្ឆេទហៅឈ្មោះ"
                  max={todayKey}
                  value={rollCallDate}
                  onChange={(e) => handleRequestDateChange(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
                <button
                  type="button"
                  disabled={rollCallDate >= todayKey}
                  onClick={() => handleRequestDateChange(shiftLocalDateKey(rollCallDate, 1))}
                  aria-label="ថ្ងៃបន្ទាប់"
                  className="p-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] text-[#1d1d1f] dark:text-[#f5f5f7] transition-colors disabled:opacity-35"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {rollCallDate !== todayKey && (
                <AppleButton
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRequestDateChange(todayKey)}
                >
                  ថ្ងៃនេះ
                </AppleButton>
              )}
            </div>
          }
        >
          {/* Status bar for session vs draft */}
          {(dateGuard.allowed || rollCallSession) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {rollCallSession ? (
                  <AppleBadge variant="green" size="sm">
                    <CheckCircle2 size={12} className="mr-1 inline" />
                    បានហៅឈ្មោះរួច
                  </AppleBadge>
                ) : dateGuard.allowed ? (
                  <AppleBadge variant="gray" size="sm">
                    មិនទាន់ហៅឈ្មោះ (ព្រាង)
                  </AppleBadge>
                ) : null}
                {dateGuard.allowed && isDirty && (
                  <AppleBadge variant="orange" size="sm">
                    មានការកែប្រែមិនទាន់រក្សាទុក
                  </AppleBadge>
                )}
              </div>

              {rollCallSession && (
                <AppleButton
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => setIsDeleteConfirmOpen(true)}
                >
                  លុបការហៅឈ្មោះថ្ងៃនេះ
                </AppleButton>
              )}
            </div>
          )}

          {!dateGuard.allowed ? (
            <div
              data-testid="rollcall-blocked-banner"
              className="p-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] text-sm text-[#6e6e73] dark:text-[#d1d1d6]"
            >
              {dateGuard.reason === 'future'
                ? 'មិនអាចហៅឈ្មោះសម្រាប់ថ្ងៃខាងមុខបានទេ។ សូមជ្រើសរើសថ្ងៃនេះ ឬថ្ងៃកន្លងមក។'
                : dateGuard.reason === 'holiday'
                  ? `ថ្ងៃបុណ្យ / ថ្ងៃឈប់សម្រាក (${holidayMap.get(rollCallDate) ?? ''}) — មិនអាចហៅឈ្មោះបានទេ។`
                  : 'ថ្ងៃឈប់សម្រាកប្រចាំសប្ដាហ៍ — មិនអាចហៅឈ្មោះបានទេ។'}
            </div>
          ) : rollCallStudents.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck size={28} />}
              title={`គ្មានសិស្សកំពុងរៀនក្នុងថ្នាក់ទី ${currentClass.name}`}
              hint="សូមបន្ថែមសិស្សក្នុងម៉ូឌុល «សិស្ស» ជាមុនសិន។"
              actionLabel="ទៅបន្ថែមសិស្ស"
              onAction={() => setActiveView('students')}
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {rollCallStudents.map((s, idx) => (
                  <RollCallStudentRow
                    key={s.id!}
                    student={s}
                    index={idx}
                    currentStatus={draftMap.get(s.id!) ?? null}
                    useKhmerNumerals={useKhmerNumerals}
                    onSelectStatus={setDraftStatus}
                  />
                ))}
              </div>

              {/* Sticky bottom Save action */}
              <div className="sticky bottom-3 z-20 pt-2">
                <div className="p-3 rounded-2xl bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.12] shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-[#6e6e73] dark:text-[#d1d1d6] font-medium">
                    សិស្សសកម្ម {fmtNum(rollCallStudents.length)} នាក់ ·{' '}
                    <span className="text-[#34c759] font-semibold">មក {fmtNum(draftPresentCount)}</span> ·{' '}
                    <span className="text-[#ff3b30] font-semibold">អវត្តមាន {fmtNum(draftAbsentCount)}</span>
                  </div>
                  <AppleButton
                    variant="primary"
                    size="lg"
                    icon={<Save size={17} />}
                    onClick={() => void handleSaveRollCall()}
                    disabled={isSavingRollCall}
                    className="w-full sm:w-auto min-h-[48px] text-sm font-bold"
                  >
                    {isSavingRollCall ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក'}
                  </AppleButton>
                </div>
              </div>
            </div>
          )}
        </AppleCard>
      ) : activeStudents.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={28} />}
          title={`គ្មានសិស្សកំពុងរៀនក្នុងថ្នាក់ទី ${currentClass.name}`}
          hint="សូមបន្ថែមសិស្សក្នុងម៉ូឌុល «សិស្ស» ជាមុនសិន។"
          actionLabel="ទៅបន្ថែមសិស្ស"
          onAction={() => setActiveView('students')}
        />
      ) : (
        /* Monthly Spreadsheet Grid Overview */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div
              data-testid="taken-days-banner"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#eef5ff] dark:bg-blue-500/15 text-[#0071e3] dark:text-[#64d2ff] text-xs font-semibold"
            >
              <CalendarCheck size={14} />
              <span>ចំនួនថ្ងៃបានហៅឈ្មោះ៖ {fmtNum(takenDaysCount)} ថ្ងៃ</span>
            </div>
            <span className="text-[11px] text-[#86868b]">
              ចុចលើលេខថ្ងៃ ឬប្រអប់ក្នុងថ្ងៃណាមួយដើម្បីបើកការហៅឈ្មោះសម្រាប់ថ្ងៃនោះ
            </span>
          </div>

          <AppleCard noPadding>
            <div className="overflow-auto max-h-[72vh] relative">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-[#f5f5f7] dark:bg-[#252528] text-[#1d1d1f] dark:text-[#f5f5f7]">
                  <tr>
                    <th
                      rowSpan={2}
                      className="sticky left-0 z-30 bg-[#f5f5f7] dark:bg-[#252528] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center font-semibold w-10"
                    >
                      ល.រ
                    </th>
                    <th
                      rowSpan={2}
                      className="sticky left-10 z-30 bg-[#f5f5f7] dark:bg-[#252528] border-b border-r border-black/[0.1] dark:border-white/[0.12] px-2.5 py-2 text-left font-semibold min-w-[155px] shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                    >
                      គោត្តនាម និងនាម
                    </th>
                    {dayInfos.map((d) => {
                      const canOpen = !d.isNonSchoolDay && !d.isFuture;
                      return (
                        <th
                          key={d.dateKey}
                          rowSpan={2}
                          title={
                            d.isHoliday
                              ? holidayMap.get(d.dateKey)
                              : d.isRestDay
                              ? 'ថ្ងៃឈប់ប្រចាំសប្ដាហ៍'
                              : d.isFuture
                              ? 'ថ្ងៃខាងមុខ'
                              : `${d.dateKey} — ចុចដើម្បីហៅឈ្មោះ`
                          }
                          className={`border-b border-r border-black/[0.06] dark:border-white/[0.08] px-0.5 py-1.5 text-center font-semibold min-w-[34px] ${
                            d.isNonSchoolDay
                              ? 'bg-slate-200/90 dark:bg-white/[0.08] text-[#86868b]'
                              : d.dateKey === todayKey
                              ? 'bg-[#e8f2ff] dark:bg-blue-500/20 text-[#0071e3]'
                              : d.isFuture
                              ? 'opacity-45'
                              : d.isTaken
                              ? 'bg-white dark:bg-[#1f1f22]'
                              : 'bg-slate-100/90 dark:bg-white/[0.04] text-[#6e6e73]'
                          }`}
                        >
                          {canOpen ? (
                            <button
                              type="button"
                              onClick={() => handleOpenDateRollCallFromGrid(d.dateKey)}
                              className="w-full py-0.5 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition-colors"
                            >
                              <div>{fmtNum(d.day)}</div>
                              {d.isTaken && (
                                <span className="block mx-auto mt-0.5 w-1 h-1 rounded-full bg-[#34c759]" />
                              )}
                            </button>
                          ) : (
                            <span>{fmtNum(d.day)}</span>
                          )}
                        </th>
                      );
                    })}
                    <th
                      colSpan={4}
                      className="border-b border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center font-semibold"
                    >
                      សង្ខេបវត្តមាន
                    </th>
                  </tr>
                  <tr>
                    <th className="border-b border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-semibold text-[#34c759] min-w-[36px]">
                      មក
                    </th>
                    <th className="border-b border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-semibold text-[#0071e3] min-w-[36px]">
                      ច្ប
                    </th>
                    <th className="border-b border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-semibold text-[#ff3b30] min-w-[36px]">
                      អច្ប
                    </th>
                    <th className="border-b border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-semibold min-w-[38px]">
                      សរុប
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {activeStudents.map((s, idx) => (
                    <AttendanceRow
                      key={s.id}
                      student={s}
                      rowIdx={idx}
                      dayInfos={dayInfos}
                      studentLookup={
                        (s.id !== undefined ? byStudent.get(s.id) : undefined) || EMPTY_STUDENT_MAP
                      }
                      useKhmerNumerals={useKhmerNumerals}
                      onOpenDateRollCall={handleOpenDateRollCallFromGrid}
                    />
                  ))}
                </tbody>

                <tfoot className="sticky bottom-0 z-20 bg-[#fafafc] dark:bg-[#252528] font-bold">
                  <tr>
                    <td
                      colSpan={2}
                      className="sticky left-0 z-30 bg-[#fafafc] dark:bg-[#252528] border-t border-r border-black/[0.1] dark:border-white/[0.12] px-3 py-2 text-right text-[11px]"
                    >
                      អវត្តមានប្រចាំថ្ងៃ
                    </td>
                    {dayInfos.map((d, di) => (
                      <td
                        key={d.dateKey}
                        className={`border-t border-r border-black/[0.06] dark:border-white/[0.08] px-1 py-2 text-center text-[11px] ${
                          d.isNonSchoolDay || (!d.isFuture && !d.isTaken)
                            ? 'bg-slate-200/80 dark:bg-white/[0.06]'
                            : ''
                        }`}
                      >
                        {dailyTotals[di] !== null && dailyTotals[di]! > 0
                          ? fmtNum(dailyTotals[di]!)
                          : ''}
                      </td>
                    ))}
                    <td className="border-t border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center text-[#34c759]">
                      {fmtNum(grandTotals.present)}
                    </td>
                    <td className="border-t border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center text-[#0071e3]">
                      {fmtNum(grandTotals.excused)}
                    </td>
                    <td className="border-t border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center text-[#ff3b30]">
                      {fmtNum(grandTotals.unexcused)}
                    </td>
                    <td className="border-t border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                      {fmtNum(grandTotals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </AppleCard>
        </div>
      )}

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => void handleConfirmDeleteSession()}
        title="លុបការហៅឈ្មោះថ្ងៃនេះ?"
        message={`តើអ្នកពិតជាចង់លុបការហៅឈ្មោះសម្រាប់ ${formatDateKhmer(
          rollCallDate,
          useKhmerNumerals
        )} មែនទេ? កំណត់ត្រាអវត្តមានទាំងអស់ក្នុងថ្ងៃនេះនឹងត្រូវដកចេញ។`}
        confirmLabel="លុបចោល"
        cancelLabel="បោះបង់"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={pendingDiscardAction !== null}
        onClose={() => setPendingDiscardAction(null)}
        onConfirm={handleConfirmDiscard}
        title="មិនទាន់បានរក្សាទុកការហៅឈ្មោះ"
        message="អ្នកមានការកែប្រែវត្តមានដែលមិនទាន់បានចុច «រក្សាទុក» ទេ។ តើអ្នកចង់បោះបង់ការកែប្រែទាំងនោះមែនទេ?"
        confirmLabel="បោះបង់ការកែប្រែ"
        cancelLabel="ត្រឡប់ក្រោយ"
        variant="danger"
      />

      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="នាំចេញបញ្ជីវត្តមាន"
        classes={classes}
        defaultClassId={currentClass.id ?? null}
        showMonthPicker={true}
        defaultMonth={selectedMonth}
        onExport={handleExport}
      />

      {printData && (
        <>
          <div
            ref={pdfStageRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: '-12000px',
              top: 0,
              pointerEvents: 'none',
              zIndex: -1,
            }}
            className="print:hidden"
          >
            <AttendanceSheet
              cls={printData.cls}
              students={printData.students}
              profile={profile}
              monthsData={printData.monthsData}
              attendanceConfig={attendanceConfig}
              holidayDates={holidayDates}
              todayKey={todayKey}
              useKhmerDigits={useKhmerNumerals}
            />
          </div>

          <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
            <AttendanceSheet
              cls={printData.cls}
              students={printData.students}
              profile={profile}
              monthsData={printData.monthsData}
              attendanceConfig={attendanceConfig}
              holidayDates={holidayDates}
              todayKey={todayKey}
              useKhmerDigits={useKhmerNumerals}
            />
          </div>
        </>
      )}
    </div>
  );
};
