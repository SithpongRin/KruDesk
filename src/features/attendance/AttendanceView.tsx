import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarCheck,
  Download,
  GraduationCap,
  Smartphone,
  Table2,
  Settings as SettingsIcon,
} from 'lucide-react';
import { db } from '../../db/database';
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
  cycleAbsenceCode,
  getActiveStudentsOrdered,
  getMonthDayInfos,
  type MonthDayInfo,
} from '../../lib/attendance';
import {
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

type ViewTab = 'grid' | 'today';

const EMPTY_STUDENT_MAP = new Map<string, AbsenceCode>();

interface ContextPickerState {
  studentRef: number;
  studentName: string;
  dateKey: string;
  x: number;
  y: number;
}

interface AttendanceRowProps {
  student: Student;
  rowIdx: number;
  dayInfos: MonthDayInfo[];
  studentLookup: Map<string, AbsenceCode>;
  useKhmerNumerals: boolean;
  onCellClick: (studentRef: number, dateKey: string) => void;
  onCellSet: (studentRef: number, dateKey: string, code: AbsenceCode | null) => void;
  onOpenContextPicker: (
    e: React.MouseEvent | { clientX: number; clientY: number },
    student: Student,
    dateKey: string
  ) => void;
  onNavigateCell: (rowIdx: number, colIdx: number, key: string) => void;
}

const AttendanceRow = memo<AttendanceRowProps>(
  ({
    student,
    rowIdx,
    dayInfos,
    studentLookup,
    useKhmerNumerals,
    onCellClick,
    onCellSet,
    onOpenContextPicker,
    onNavigateCell,
  }) => {
    const fmt = (v: number | string) =>
      useKhmerNumerals ? toKhmerNumerals(v) : toArabicNumerals(String(v));

    const studentRef = student.id!;

    let excused = 0;
    let unexcused = 0;
    for (const d of dayInfos) {
      if (!d.isCountable) continue;
      const c = studentLookup.get(d.dateKey);
      if (c === 'ច្ប' || c === 'ឈ') excused++;
      else if (c === 'អច្ប') unexcused++;
    }
    const total = excused + unexcused;

    const longPressTimer = useRef<number | null>(null);

    return (
      <tr className="hover:bg-[#f5f5f7]/40 dark:hover:bg-white/[0.02] transition-colors">
        <td className="sticky left-0 z-10 bg-white dark:bg-[#1c1c1e] border-b border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] w-10">
          {fmt(rowIdx + 1)}
        </td>
        <td className="sticky left-10 z-10 bg-white dark:bg-[#1c1c1e] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-1.5 font-medium text-[#1d1d1f] dark:text-[#f5f5f7] whitespace-nowrap min-w-[155px] max-w-[190px] truncate shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
          {student.nameKm}
        </td>

        {dayInfos.map((d, colIdx) => {
          const code = studentLookup.get(d.dateKey);

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
              className={`border-b border-r border-black/[0.05] dark:border-white/[0.06] p-0.5 text-center ${
                d.isFuture ? 'opacity-45' : ''
              }`}
            >
              <button
                type="button"
                data-att-cell={`${rowIdx}-${colIdx}`}
                title={d.isFuture ? 'ថ្ងៃខាងមុខ (មិនទាន់រាប់)' : `${student.nameKm} (${d.dateKey})`}
                onClick={() => onCellClick(studentRef, d.dateKey)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenContextPicker(e, student, d.dateKey);
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  if (!touch) return;
                  const x = touch.clientX;
                  const y = touch.clientY;
                  longPressTimer.current = window.setTimeout(() => {
                    onOpenContextPicker({ clientX: x, clientY: y }, student, d.dateKey);
                  }, 480);
                }}
                onTouchEnd={() => {
                  if (longPressTimer.current !== null) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onTouchMove={() => {
                  if (longPressTimer.current !== null) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onKeyDown={(e) => {
                  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    onNavigateCell(rowIdx, colIdx, e.key);
                  } else if (e.key === '1') {
                    e.preventDefault();
                    onCellSet(studentRef, d.dateKey, 'ច្ប');
                  } else if (e.key === '2') {
                    e.preventDefault();
                    onCellSet(studentRef, d.dateKey, 'អច្ប');
                  } else if (e.key === '3') {
                    e.preventDefault();
                    onCellSet(studentRef, d.dateKey, 'ឈ');
                  } else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    onCellSet(studentRef, d.dateKey, null);
                  }
                }}
                className={`w-8 h-7 rounded-md text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0071e3] ${cellStyle}`}
              >
                {code || '✓'}
              </button>
            </td>
          );
        })}

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

export const AttendanceView: React.FC<AttendanceViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    selectedMonth,
    useKhmerNumerals,
    setActiveView,
    addToast,
  } = useAppStore();

  const [tab, setTab] = useState<ViewTab>('grid');
  const [contextPicker, setContextPicker] = useState<ContextPickerState | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

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

  const todayKey = toLocalDateKey(new Date());
  const { year, month } = parseYearMonth(selectedMonth);
  const dayInfos = useMemo(
    () =>
      getMonthDayInfos(year, month, {
        restWeekdays: attendanceConfig.restWeekdays,
        holidayDates,
        todayKey,
      }),
    [year, month, attendanceConfig.restWeekdays, holidayDates, todayKey]
  );

  // Map<studentRef, Map<dateKey, AbsenceCode>>
  const [byStudent, setByStudent] = useState<Map<number, Map<string, AbsenceCode>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (!currentClass?.id) {
      setByStudent(new Map());
      return;
    }
    const startKey = `${selectedMonth}-01`;
    const endKey = `${selectedMonth}-31`;
    db.attendance
      .where('[classId+date]')
      .between([currentClass.id, startKey], [currentClass.id, endKey], true, true)
      .toArray()
      .then((rows) => {
        if (cancelled) return;
        const next = new Map<number, Map<string, AbsenceCode>>();
        for (const r of rows) {
          let inner = next.get(r.studentRef);
          if (!inner) {
            inner = new Map<string, AbsenceCode>();
            next.set(r.studentRef, inner);
          }
          inner.set(r.date, r.status);
        }
        setByStudent(next);
      });
    return () => {
      cancelled = true;
    };
  }, [currentClass?.id, selectedMonth]);

  // Also load today's attendance separately if Today tab is viewing a different month than selectedMonth
  const [todayMap, setTodayMap] = useState<Map<number, AbsenceCode>>(new Map());
  useEffect(() => {
    let cancelled = false;
    if (!currentClass?.id) {
      setTodayMap(new Map());
      return;
    }
    db.attendance
      .where('[classId+date]')
      .equals([currentClass.id, todayKey])
      .toArray()
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<number, AbsenceCode>();
        for (const r of rows) m.set(r.studentRef, r.status);
        setTodayMap(m);
      });
    return () => {
      cancelled = true;
    };
  }, [currentClass?.id, todayKey]);

  const setCellStatus = useCallback(
    async (studentRef: number, dateKey: string, nextStatus: AbsenceCode | null) => {
      if (!currentClass?.id) return;
      const classId = currentClass.id;

      // Optimistically update only that student's inner Map
      if (dateKey.startsWith(selectedMonth)) {
        setByStudent((prev) => {
          const next = new Map(prev);
          const prevInner = prev.get(studentRef);
          const nextInner = new Map(prevInner || []);
          if (nextStatus === null) nextInner.delete(dateKey);
          else nextInner.set(dateKey, nextStatus);
          next.set(studentRef, nextInner);
          return next;
        });
      }

      if (dateKey === todayKey) {
        setTodayMap((prev) => {
          const next = new Map(prev);
          if (nextStatus === null) next.delete(studentRef);
          else next.set(studentRef, nextStatus);
          return next;
        });
      }

      if (nextStatus === null) {
        await db.attendance.delete([classId, dateKey, studentRef]);
      } else {
        await db.attendance.put({ classId, studentRef, date: dateKey, status: nextStatus });
      }
    },
    [currentClass?.id, selectedMonth, todayKey]
  );

  const handleCellClick = useCallback(
    (studentRef: number, dateKey: string) => {
      setByStudent((prev) => {
        const curr = prev.get(studentRef)?.get(dateKey) ?? null;
        const nextStatus = cycleAbsenceCode(curr);
        const next = new Map(prev);
        const nextInner = new Map(prev.get(studentRef) || []);
        if (nextStatus === null) nextInner.delete(dateKey);
        else nextInner.set(dateKey, nextStatus);
        next.set(studentRef, nextInner);

        if (currentClass?.id) {
          if (nextStatus === null) {
            db.attendance.delete([currentClass.id, dateKey, studentRef]).catch(console.error);
          } else {
            db.attendance
              .put({ classId: currentClass.id, studentRef, date: dateKey, status: nextStatus })
              .catch(console.error);
          }
          if (dateKey === todayKey) {
            setTodayMap((tPrev) => {
              const tNext = new Map(tPrev);
              if (nextStatus === null) tNext.delete(studentRef);
              else tNext.set(studentRef, nextStatus);
              return tNext;
            });
          }
        }
        return next;
      });
    },
    [currentClass?.id, todayKey]
  );

  const handleOpenContextPicker = useCallback(
    (
      e: React.MouseEvent | { clientX: number; clientY: number },
      student: Student,
      dateKey: string
    ) => {
      if (student.id === undefined) return;
      setContextPicker({
        studentRef: student.id,
        studentName: student.nameKm,
        dateKey,
        x: Math.min(window.innerWidth - 190, Math.max(12, e.clientX)),
        y: Math.min(window.innerHeight - 180, Math.max(12, e.clientY)),
      });
    },
    []
  );

  const handleNavigateCell = useCallback(
    (rowIdx: number, colIdx: number, key: string) => {
      let dr = 0;
      let dc = 0;
      if (key === 'ArrowUp') dr = -1;
      else if (key === 'ArrowDown') dr = 1;
      else if (key === 'ArrowLeft') dc = -1;
      else if (key === 'ArrowRight') dc = 1;

      let nr = rowIdx + dr;
      let nc = colIdx + dc;
      // Skip non-school days horizontally
      while (dc !== 0 && nc >= 0 && nc < dayInfos.length && dayInfos[nc].isNonSchoolDay) {
        nc += dc;
      }
      if (nr < 0 || nr >= activeStudents.length || nc < 0 || nc >= dayInfos.length) return;
      const target = document.querySelector<HTMLButtonElement>(
        `[data-att-cell="${nr}-${nc}"]`
      );
      target?.focus();
    },
    [dayInfos, activeStudents.length]
  );

  useEffect(() => {
    if (!contextPicker) return;
    const close = () => setContextPicker(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextPicker]);

  // Daily footer counts & grand totals
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
    for (const s of activeStudents) {
      if (s.id === undefined) continue;
      const sMap = byStudent.get(s.id);
      if (!sMap) continue;
      for (const d of dayInfos) {
        if (!d.isCountable) continue;
        const c = sMap.get(d.dateKey);
        if (c === 'ច្ប' || c === 'ឈ') excused++;
        else if (c === 'អច្ប') unexcused++;
      }
    }
    return { excused, unexcused, total: excused + unexcused };
  }, [activeStudents, byStudent, dayInfos]);

  // Print / PDF stage
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const [printData, setPrintData] = useState<{
    cls: SchoolClass;
    students: Student[];
    monthsData: AttendanceMonthRenderData[];
  } | null>(null);

  const fmtNum = (val: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));

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
      const rows = await db.attendance
        .where('[classId+date]')
        .between([classId, `${m}-01`], [classId, `${m}-31`], true, true)
        .toArray();
      const lookup = new Map<string, AbsenceCode>();
      for (const r of rows) {
        lookup.set(`${r.studentRef}|${r.date}`, r.status);
      }
      monthsData.push({ month: m, lookup });
    }

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
              document: 'បញ្ជីហៅឈ្មោះ',
              className: cls.name,
              month: months[0],
              ext: 'pdf',
              useKhmerDigits: useKhmerNumerals,
            })
          : buildExportFileName({
              document: 'បញ្ជីហៅឈ្មោះ',
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
      setPrintData(null);
      addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
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

  const todayDate = new Date();
  const todayIsRest = attendanceConfig.restWeekdays.includes(todayDate.getDay());
  const todayHolidayLabel = holidayMap.get(todayKey);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
            បញ្ជីហៅឈ្មោះ — ថ្នាក់ទី {currentClass.name}
          </h1>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            {formatKhmerMonthYear(selectedMonth, useKhmerNumerals)} · សិស្សកំពុងរៀន{' '}
            {fmtNum(activeStudents.length)} នាក់
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <AppleSegmentedControl<ViewTab>
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'grid', label: 'តារាងប្រចាំខែ', icon: <Table2 size={13} /> },
              { value: 'today', label: 'ថ្ងៃនេះ', icon: <Smartphone size={13} /> },
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
        <AppleBadge variant="blue" size="sm">ច្ប មានច្បាប់ (១)</AppleBadge>
        <AppleBadge variant="red" size="sm">អច្ប អត់ច្បាប់ (២)</AppleBadge>
        <AppleBadge variant="orange" size="sm">ឈ ឈឺ — រាប់ក្នុង ច្ប (៣)</AppleBadge>
        <span className="hide-on-touch">
          <AppleBadge variant="gray" size="sm">0 / Backspace = មក</AppleBadge>
        </span>
      </div>

      {activeStudents.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={28} />}
          title={`គ្មានសិស្សកំពុងរៀនក្នុងថ្នាក់ទី ${currentClass.name}`}
          hint="សូមបន្ថែមសិស្សក្នុងម៉ូឌុល «សិស្ស» ជាមុនសិន។"
          actionLabel="ទៅបន្ថែមសិស្ស"
          onAction={() => setActiveView('students')}
        />
      ) : tab === 'today' ? (
        /* Today Quick Tap Mode */
        <AppleCard
          title={`វត្តមានថ្ងៃនេះ (${todayKey})`}
          subtitle={
            todayHolidayLabel
              ? `ថ្ងៃបុណ្យ៖ ${todayHolidayLabel}`
              : todayIsRest
              ? 'ថ្ងៃឈប់សម្រាកប្រចាំសប្ដាហ៍'
              : 'ចុចជ្រើសស្ថានភាពសម្រាប់សិស្សម្នាក់ៗ'
          }
        >
          {(todayIsRest || todayHolidayLabel) && (
            <div className="mb-4 p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] text-xs text-[#6e6e73] dark:text-[#98989d]">
              សម្គាល់៖ ថ្ងៃនេះជាថ្ងៃឈប់សម្រាក ដូច្នេះវត្តមាននឹងមិនត្រូវបានរាប់ចូលក្នុងចំនួនអវត្តមានប្រចាំខែឡើយ។
            </div>
          )}

          <div className="space-y-2">
            {activeStudents.map((s, idx) => {
              const sid = s.id!;
              const curr = todayMap.get(sid) ?? null;
              return (
                <div
                  key={sid}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#f5f5f7]/70 dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-white dark:bg-white/[0.08] text-xs font-bold flex items-center justify-center shrink-0">
                      {fmtNum(idx + 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                        {s.nameKm}
                      </div>
                      <div className="text-[11px] text-[#86868b] font-mono">{s.studentId}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                    {(
                      [
                        { code: null, label: '✓ មក', activeCls: 'bg-[#34c759] text-white' },
                        { code: 'ច្ប' as const, label: 'ច្ប', activeCls: 'bg-[#0071e3] text-white' },
                        { code: 'អច្ប' as const, label: 'អច្ប', activeCls: 'bg-[#ff3b30] text-white' },
                        { code: 'ឈ' as const, label: 'ឈ', activeCls: 'bg-[#ff9500] text-white' },
                      ] as const
                    ).map((btn) => {
                      const active = curr === btn.code;
                      return (
                        <button
                          key={String(btn.code)}
                          type="button"
                          onClick={() => setCellStatus(sid, todayKey, btn.code)}
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
            })}
          </div>
        </AppleCard>
      ) : (
        /* Monthly Spreadsheet Grid */
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
                  {dayInfos.map((d) => (
                    <th
                      key={d.dateKey}
                      rowSpan={2}
                      title={
                        d.isHoliday
                          ? holidayMap.get(d.dateKey)
                          : d.isRestDay
                          ? 'ថ្ងៃឈប់ប្រចាំសប្ដាហ៍'
                          : d.dateKey
                      }
                      className={`border-b border-r border-black/[0.06] dark:border-white/[0.08] px-1 py-2 text-center font-semibold min-w-[34px] ${
                        d.isNonSchoolDay
                          ? 'bg-slate-200/90 dark:bg-white/[0.08] text-[#86868b]'
                          : d.dateKey === todayKey
                          ? 'bg-[#e8f2ff] dark:bg-blue-500/20 text-[#0071e3]'
                          : d.isFuture
                          ? 'opacity-50'
                          : ''
                      }`}
                    >
                      {fmtNum(d.day)}
                    </th>
                  ))}
                  <th
                    colSpan={3}
                    className="border-b border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center font-semibold"
                  >
                    ចំនួនអវត្តមាន
                  </th>
                </tr>
                <tr>
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
                    onCellClick={handleCellClick}
                    onCellSet={setCellStatus}
                    onOpenContextPicker={handleOpenContextPicker}
                    onNavigateCell={handleNavigateCell}
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
                        d.isNonSchoolDay ? 'bg-slate-200/80 dark:bg-white/[0.06]' : ''
                      }`}
                    >
                      {dailyTotals[di] !== null && dailyTotals[di]! > 0
                        ? fmtNum(dailyTotals[di]!)
                        : ''}
                    </td>
                  ))}
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
      )}

      {/* Right-click / Long-press Quick Picker */}
      {contextPicker && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: contextPicker.x, top: contextPicker.y }}
          className="fixed z-50 w-44 bg-white dark:bg-[#2c2c2e] rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.2)] border border-black/[0.08] dark:border-white/[0.12] p-1.5 space-y-1"
        >
          <div className="px-2.5 py-1 text-[11px] font-semibold text-[#86868b] truncate border-b border-black/[0.05] dark:border-white/[0.08]">
            {contextPicker.studentName}
          </div>
          {(
            [
              { code: null, label: '✓ មករៀន', color: 'text-[#34c759]' },
              { code: 'ច្ប' as const, label: 'ច្ប — មានច្បាប់', color: 'text-[#0071e3]' },
              { code: 'អច្ប' as const, label: 'អច្ប — អត់ច្បាប់', color: 'text-[#ff3b30]' },
              { code: 'ឈ' as const, label: 'ឈ — ឈឺ', color: 'text-[#ff9500]' },
            ] as const
          ).map((item) => (
            <button
              key={String(item.code)}
              type="button"
              onClick={() => {
                setCellStatus(contextPicker.studentRef, contextPicker.dateKey, item.code);
                setContextPicker(null);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-[#f5f5f7] dark:hover:bg-white/[0.08] ${item.color}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="នាំចេញបញ្ជីហៅឈ្មោះ"
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
