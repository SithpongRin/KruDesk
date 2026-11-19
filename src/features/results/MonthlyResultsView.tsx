import React, { useEffect, useMemo, useRef, useState } from 'react';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  DEFAULT_SCORE_CONFIG,
  type AbsenceCode,
  type Profile,
  type SchoolClass,
  type ScoreConfig,
} from '../../types/domain';
import { buildTakenDatesSet } from '../../lib/attendance';
import { formatAverage } from '../../lib/grading';
import { formatKhmerMonthYear, resolveAcademicMonthKey } from '../../lib/khmerDate';
import { buildExportFileName } from '../../lib/exportFilename';
import {
  computeMonthlyResults,
  computeSemesterResults,
  GRADE_COLOR_CLASSES,
  GRADE_ORDER,
  orderReportRows,
  type MonthlyResultRow,
  type ReportOrderMode,
  type SemesterResultRow,
} from '../../lib/monthlyResults';
import { compareKhmerNames } from '../../lib/khmerSort';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleSegmentedControl } from '../../components/common/AppleSegmentedControl';
import { EmptyState } from '../../components/common/EmptyState';
import { DocumentSignDialog } from '../../components/common/DocumentSignDialog';
import type { DocumentSignOptions } from '../../print/DocumentSignature';
import { MonthlyResultsSheet } from '../../print/MonthlyResultsSheet';
import {
  StudentReportSheet,
  type StudentReportEntry,
} from '../../print/StudentReportSheet';
import { SemesterResultsSheet } from '../../print/SemesterResultsSheet';
import { SemesterReportSheet } from '../../print/SemesterReportSheet';
import {
  exportMonthlyResultsExcel,
  exportSemesterResultsExcel,
} from '../../services/excelExport';
import { ensurePrintFontsReady, exportPrintNodesToPdf, nextPaint } from '../../services/pdfExport';

interface MonthlyResultsViewProps {
  profile: Profile;
}

type PeriodMode = 'monthly' | 'sem1' | 'sem2';

export const MonthlyResultsView: React.FC<MonthlyResultsViewProps> = ({ profile }) => {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const {
    selectedClassId,
    setSelectedClassId,
    selectedMonth,
    setSelectedMonth,
    useKhmerNumerals,
    setActiveView,
    addToast,
  } = useAppStore();

  const fmt = (val: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const currentClass: SchoolClass | undefined = useMemo(() => {
    if (!classes || classes.length === 0) return undefined;
    return classes.find((c) => c.id === selectedClassId) ?? classes[0];
  }, [classes, selectedClassId]);

  const scoreCfgRow = useLiveQuery(() => db.settings.get('scoreConfig'), []);
  const scoreConfig: ScoreConfig = useMemo(
    () => ({
      ...DEFAULT_SCORE_CONFIG,
      ...((scoreCfgRow?.value as Partial<ScoreConfig> | undefined) ?? {}),
    }),
    [scoreCfgRow]
  );

  const monthData = useLiveQuery(async () => {
    if (!currentClass?.id) return null;
    const classId = currentClass.id;
    const [students, scoreRows, attRows, attSessions] = await Promise.all([
      db.students.where('classId').equals(classId).toArray(),
      db.monthlyScores.where('[classId+month]').equals([classId, selectedMonth]).toArray(),
      db.attendance
        .where('[classId+date]')
        .between([classId, `${selectedMonth}-01`], [classId, `${selectedMonth}-31`], true, true)
        .toArray(),
      db.attendanceSessions
        .where('[classId+date]')
        .between([classId, `${selectedMonth}-01`], [classId, `${selectedMonth}-31`], true, true)
        .toArray(),
    ]);

    const scoresByStudent = new Map<number, Record<string, number | null>>();
    const notesByStudent = new Map<number, string>();
    for (const r of scoreRows) {
      scoresByStudent.set(r.studentRef, r.scores);
      if (r.note) notesByStudent.set(r.studentRef, r.note);
    }

    const attendanceLookup = new Map<string, AbsenceCode>();
    for (const a of attRows) {
      attendanceLookup.set(`${a.studentRef}|${a.date}`, a.status);
    }

    return {
      students,
      scoresByStudent,
      notesByStudent,
      attendanceLookup,
      takenDates: buildTakenDatesSet(attSessions),
    };
  }, [currentClass?.id, selectedMonth]);

  const summary = useMemo(() => {
    if (!currentClass || !monthData) return null;
    return computeMonthlyResults({
      students: monthData.students,
      subjects: currentClass.subjects,
      month: selectedMonth,
      scoresByStudent: monthData.scoresByStudent,
      notesByStudent: monthData.notesByStudent,
      attendanceLookup: monthData.attendanceLookup,
      takenDates: monthData.takenDates,
      scoreConfig,
    });
  }, [currentClass, monthData, selectedMonth, scoreConfig]);

  const academicMonthOptions = useMemo(() => {
    const yearStr = currentClass?.academicYear || profile.academicYear || '2026-2027';
    const order = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return order.map((m) => resolveAcademicMonthKey(yearStr, m));
  }, [currentClass?.academicYear, profile.academicYear]);

  // If the current month is outside the class academic year, pick the latest month with scores
  useEffect(() => {
    if (!currentClass?.id) return;
    if (academicMonthOptions.includes(selectedMonth)) return;
    let cancelled = false;
    db.monthlyScores
      .where('[classId+month]')
      .between([currentClass.id, Dexie.minKey], [currentClass.id, Dexie.maxKey])
      .toArray()
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        const latest = rows
          .map((r) => r.month)
          .sort()
          .pop();
        if (latest) setSelectedMonth(latest);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentClass?.id, academicMonthOptions, selectedMonth, setSelectedMonth]);

  const semesterData = useLiveQuery(async () => {
    if (!currentClass?.id || periodMode === 'monthly') return null;
    const classId = currentClass.id;
    const [students, monthlyRecords, semesterExams, attendanceRows, attendanceSessions] =
      await Promise.all([
        db.students.where('classId').equals(classId).toArray(),
        db.monthlyScores
          .where('[classId+month]')
          .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
          .toArray(),
        db.semesterExams
          .where('[classId+semester]')
          .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
          .toArray(),
        db.attendance.where('classId').equals(classId).toArray(),
        db.attendanceSessions.where('classId').equals(classId).toArray(),
      ]);
    return { students, monthlyRecords, semesterExams, attendanceRows, attendanceSessions };
  }, [currentClass?.id, periodMode]);

  const semesterSummary = useMemo(() => {
    if (!currentClass || !semesterData || periodMode === 'monthly') return null;
    return computeSemesterResults({
      students: semesterData.students,
      subjects: currentClass.subjects,
      academicYear: currentClass.academicYear,
      semester: periodMode === 'sem1' ? 1 : 2,
      monthlyRecords: semesterData.monthlyRecords,
      semesterExams: semesterData.semesterExams,
      attendanceRows: semesterData.attendanceRows,
      attendanceSessions: semesterData.attendanceSessions,
      scoreConfig,
    });
  }, [currentClass, semesterData, periodMode, scoreConfig]);

  const [pendingExportType, setPendingExportType] = useState<
    | 'pdf'
    | 'excel'
    | 'report-all'
    | 'report-one'
    | 'sem-pdf'
    | 'sem-excel'
    | 'sem-report-all'
    | 'sem-report-one'
    | null
  >(null);
  const [targetReportRow, setTargetReportRow] = useState<MonthlyResultRow | null>(null);
  const [targetSemReportRow, setTargetSemReportRow] = useState<SemesterResultRow | null>(null);
  const [reportOrder, setReportOrder] = useState<ReportOrderMode>('rank');
  const [printSignOptions, setPrintSignOptions] = useState<DocumentSignOptions | null>(null);
  const [printReportData, setPrintReportData] = useState<{
    entries: StudentReportEntry[];
    signOptions: DocumentSignOptions;
  } | null>(null);
  const [printSemSignOptions, setPrintSemSignOptions] = useState<DocumentSignOptions | null>(null);
  const [printSemReportData, setPrintSemReportData] = useState<{
    rows: SemesterResultRow[];
    signOptions: DocumentSignOptions;
  } | null>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const reportStageRef = useRef<HTMLDivElement>(null);
  const semStageRef = useRef<HTMLDivElement>(null);
  const semReportStageRef = useRef<HTMLDivElement>(null);

  const handleConfirmExport = async (signOptions: DocumentSignOptions) => {
    if (!currentClass) return;
    const mode = pendingExportType;
    const singleRow = targetReportRow;
    const singleSemRow = targetSemReportRow;
    setPendingExportType(null);
    setTargetReportRow(null);
    setTargetSemReportRow(null);
    if (!mode) return;

    try {
      if (mode === 'sem-excel' && semesterSummary) {
        const fileName = await exportSemesterResultsExcel({
          cls: currentClass,
          profile,
          summary: semesterSummary,
          scoreConfig,
          signOptions,
          useKhmerDigits: useKhmerNumerals,
        });
        addToast({ type: 'success', title: 'នាំចេញ Excel ជោគជ័យ!', message: fileName });
        return;
      }

      if (mode === 'sem-pdf' && semesterSummary) {
        setPrintSemSignOptions(signOptions);
        await new Promise((r) => setTimeout(r, 80));
        await nextPaint();
        await ensurePrintFontsReady();
        const stage = semStageRef.current;
        if (!stage) return;
        const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
        const fileName = buildExportFileName({
          document: `លទ្ធផលឆមាសទី_${semesterSummary.semester}`,
          className: currentClass.name,
          year: currentClass.academicYear,
          ext: 'pdf',
          useKhmerDigits: useKhmerNumerals,
        });
        await exportPrintNodesToPdf(pageNodes, {
          fileName,
          orientation: 'portrait',
          pixelRatio: 3,
        });
        addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
        return;
      }

      if ((mode === 'sem-report-one' || mode === 'sem-report-all') && semesterSummary) {
        const rankedRows = semesterSummary.rows.filter((r) => r.rank !== null);
        const selectedRows =
          mode === 'sem-report-one'
            ? singleSemRow
              ? [singleSemRow]
              : []
            : reportOrder === 'rank'
              ? rankedRows
              : [...rankedRows].sort(
                  (a, b) =>
                    a.student.order - b.student.order ||
                    compareKhmerNames(a.student.nameKm, b.student.nameKm)
                );
        if (selectedRows.length === 0) {
          addToast({
            type: 'error',
            title: 'គ្មានទិន្នន័យពិន្ទុ',
            message: 'មិនទាន់មានសិស្សដែលមានពិន្ទុសម្រាប់បង្កើតលទ្ធផលឆមាសទេ។',
          });
          return;
        }
        setPrintSemReportData({ rows: selectedRows, signOptions });
        await new Promise((r) => setTimeout(r, 80));
        await nextPaint();
        await ensurePrintFontsReady();
        const stage = semReportStageRef.current;
        if (!stage) return;
        const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
        const fileName =
          mode === 'sem-report-one' && singleSemRow
            ? `លទ្ធផលឆមាសទី_${semesterSummary.semester}_${singleSemRow.student.nameKm}.pdf`
            : buildExportFileName({
                document: `លទ្ធផលសិក្សាឆមាសទី_${semesterSummary.semester}`,
                className: currentClass.name,
                year: currentClass.academicYear,
                ext: 'pdf',
                useKhmerDigits: useKhmerNumerals,
              });
        await exportPrintNodesToPdf(pageNodes, {
          fileName,
          orientation: 'portrait',
          pixelRatio: 3,
        });
        addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
        return;
      }

      if (!summary || !monthData) return;

      if (mode === 'excel') {
        const fileName = await exportMonthlyResultsExcel({
          cls: currentClass,
          profile,
          month: selectedMonth,
          summary,
          scoreConfig,
          signOptions,
          useKhmerDigits: useKhmerNumerals,
        });
        addToast({ type: 'success', title: 'នាំចេញ Excel ជោគជ័យ!', message: fileName });
        return;
      }

      if (mode === 'report-one' || mode === 'report-all') {
        const selectedRows =
          mode === 'report-one'
            ? singleRow
              ? [singleRow]
              : []
            : orderReportRows(summary.rows, reportOrder);
        if (selectedRows.length === 0) {
          addToast({
            type: 'error',
            title: 'គ្មានទិន្នន័យពិន្ទុ',
            message: 'មិនទាន់មានសិស្សដែលមានពិន្ទុសម្រាប់បង្កើតលទ្ធផលសិក្សាទេ។',
          });
          return;
        }
        const entries: StudentReportEntry[] = selectedRows.map((row) => ({
          row,
          scores:
            (row.student.id !== undefined && monthData.scoresByStudent.get(row.student.id)) || {},
        }));

        setPrintReportData({ entries, signOptions });
        await new Promise((r) => setTimeout(r, 80));
        await nextPaint();
        await ensurePrintFontsReady();
        const stage = reportStageRef.current;
        if (!stage) return;
        const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
        const fileName =
          mode === 'report-one' && singleRow
            ? `លទ្ធផលសិក្សា_${singleRow.student.nameKm}_${selectedMonth}.pdf`
            : buildExportFileName({
                document: 'លទ្ធផលសិក្សា',
                className: currentClass.name,
                month: selectedMonth,
                ext: 'pdf',
                useKhmerDigits: useKhmerNumerals,
              });
        await exportPrintNodesToPdf(pageNodes, {
          fileName,
          orientation: 'portrait',
          pixelRatio: 3,
        });
        addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
        return;
      }

      setPrintSignOptions(signOptions);
      await new Promise((r) => setTimeout(r, 80));
      await nextPaint();
      await ensurePrintFontsReady();
      const stage = pdfStageRef.current;
      if (!stage) return;
      const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
      const fileName = buildExportFileName({
        document: 'លទ្ធផលប្រចាំខែ',
        className: currentClass.name,
        month: selectedMonth,
        ext: 'pdf',
        useKhmerDigits: useKhmerNumerals,
      });
      await exportPrintNodesToPdf(pageNodes, {
        fileName,
        orientation: 'portrait',
        pixelRatio: 3,
      });
      addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
    } catch (err) {
      console.error('MonthlyResults export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : 'មានបញ្ហាក្នុងការបង្កើតឯកសារ',
      });
    } finally {
      setPrintSignOptions(null);
      setPrintReportData(null);
      setPrintSemSignOptions(null);
      setPrintSemReportData(null);
    }
  };

  if (!classes || classes.length === 0 || !currentClass) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="មិនទាន់មានថ្នាក់រៀននៅឡើយទេ"
          hint="សូមបង្កើតថ្នាក់រៀន និងបញ្ចូលពិន្ទុជាមុនសិន។"
          actionLabel="ទៅកាន់ សិស្ស"
          onAction={() => setActiveView('students')}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
            លទ្ធផលប្រចាំខែ — ថ្នាក់ទី {currentClass.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-xs text-[#86868b] dark:text-[#98989d]">
              {formatKhmerMonthYear(selectedMonth, useKhmerNumerals)} · ឆ្នាំសិក្សា{' '}
              {fmt(currentClass.academicYear)}
            </span>
            {summary && (
              <>
                <AppleBadge variant="gray" size="sm">
                  សិស្ស {fmt(summary.totalStudents)} (ស្រី {fmt(summary.femaleStudents)})
                </AppleBadge>
                <AppleBadge variant="red" size="sm">
                  អវត្តមានពេញខែ {fmt(summary.absentAllMonth.total)}
                </AppleBadge>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AppleSegmentedControl<PeriodMode>
            size="sm"
            value={periodMode}
            onChange={setPeriodMode}
            options={[
              { value: 'monthly', label: 'ប្រចាំខែ' },
              { value: 'sem1', label: `ឆមាសទី ${fmt(1)}` },
              { value: 'sem2', label: `ឆមាសទី ${fmt(2)}` },
            ]}
          />

          {classes.length > 1 && (
            <select
              aria-label="ជ្រើសរើសថ្នាក់"
              value={currentClass.id ?? ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.12]"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id} className="dark:bg-[#1c1c1e]">
                  ថ្នាក់ {cls.name}
                </option>
              ))}
            </select>
          )}

          {periodMode === 'monthly' && (
            <select
              aria-label="ជ្រើសរើសខែ"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.12]"
            >
              {(academicMonthOptions.includes(selectedMonth)
                ? academicMonthOptions
                : [selectedMonth, ...academicMonthOptions]
              ).map((ym) => (
                <option key={ym} value={ym} className="dark:bg-[#1c1c1e]">
                  {formatKhmerMonthYear(ym, useKhmerNumerals)}
                </option>
              ))}
            </select>
          )}

          <AppleButton
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            disabled={
              periodMode === 'monthly'
                ? !summary || summary.rows.every((r) => r.rank === null)
                : !semesterSummary || semesterSummary.rows.every((r) => r.rank === null)
            }
            onClick={() =>
              setPendingExportType(periodMode === 'monthly' ? 'report-all' : 'sem-report-all')
            }
          >
            ទាញយកទាំងអស់
          </AppleButton>
          <AppleButton
            variant="secondary"
            size="sm"
            icon={<FileSpreadsheet size={14} />}
            disabled={
              periodMode === 'monthly'
                ? !summary || summary.rows.length === 0
                : !semesterSummary || semesterSummary.rows.length === 0
            }
            onClick={() =>
              setPendingExportType(periodMode === 'monthly' ? 'excel' : 'sem-excel')
            }
          >
            Excel
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            icon={<FileText size={14} />}
            disabled={
              periodMode === 'monthly'
                ? !summary || summary.rows.length === 0
                : !semesterSummary || semesterSummary.rows.length === 0
            }
            onClick={() => setPendingExportType(periodMode === 'monthly' ? 'pdf' : 'sem-pdf')}
          >
            PDF
          </AppleButton>
        </div>
      </div>

      {periodMode !== 'monthly' ? (
        !semesterSummary || semesterSummary.rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={28} />}
            title="មិនទាន់មានសិស្សសកម្មសម្រាប់ឆមាសនេះទេ"
            hint="សូមពិនិត្យបញ្ជីសិស្ស ឬបញ្ចូលពិន្ទុប្រឡងឆមាសជាមុនសិន។"
            actionLabel="ទៅកាន់ បញ្ជីពិន្ទុ"
            onAction={() => setActiveView('scores')}
          />
        ) : (
          <AppleCard noPadding>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7]">
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center w-10">
                      ល.រ
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2 text-left min-w-[160px]">
                      គោត្តនាម-នាម
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center">
                      ភេទ
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      មធ្យមប្រលង
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      មធ្យមខែ
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      មធ្យមឆមាស
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      ចំណាត់ថ្នាក់
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      និទ្ទេស
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      លទ្ធផល
                    </th>
                    <th colSpan={3} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">
                      ចំនួនអវត្តមាន
                    </th>
                    <th rowSpan={2} className="border-b border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      សិក្សាប័ត្រ
                    </th>
                  </tr>
                  <tr className="bg-[#fafafa] dark:bg-white/[0.04] text-[11px]">
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">ច្ប</th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">អ.ច្ប</th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">សរុប</th>
                  </tr>
                </thead>
                <tbody>
                  {semesterSummary.rows.map((r, idx) => (
                    <tr
                      key={r.student.id ?? idx}
                      className="border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0 hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03]"
                    >
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center text-[#86868b]">
                        {fmt(idx + 1)}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 font-medium whitespace-nowrap">
                        {r.student.nameKm}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                        {r.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center">
                        {r.examAvg !== null ? fmt(formatAverage(r.examAvg, scoreConfig.averageDecimalMode)) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center">
                        {r.monthlyAvg !== null ? fmt(formatAverage(r.monthlyAvg, scoreConfig.averageDecimalMode)) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-semibold">
                        {r.semesterAvg !== null ? fmt(formatAverage(r.semesterAvg, scoreConfig.averageDecimalMode)) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-bold text-[#ff3b30]">
                        {r.rank !== null ? fmt(r.rank) : '—'}
                      </td>
                      <td
                        className={`border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-bold ${
                          r.grade ? GRADE_COLOR_CLASSES[r.grade] : ''
                        }`}
                      >
                        {r.grade ?? '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center">
                        {r.passed === true ? (
                          <AppleBadge variant="green" size="sm">ជាប់</AppleBadge>
                        ) : r.passed === false ? (
                          <AppleBadge variant="red" size="sm">ធ្លាក់</AppleBadge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                        {r.attendance.excused > 0 ? fmt(r.attendance.excused) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                        {r.attendance.unexcused > 0 ? fmt(r.attendance.unexcused) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center font-medium">
                        {r.attendance.total > 0 ? fmt(r.attendance.total) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <AppleButton
                          variant="ghost"
                          size="sm"
                          icon={<Download size={13} />}
                          disabled={r.rank === null}
                          onClick={() => {
                            setTargetSemReportRow(r);
                            setPendingExportType('sem-report-one');
                          }}
                        >
                          ទាញយក
                        </AppleButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AppleCard>
        )
      ) : !summary || summary.rows.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="មិនទាន់មានសិស្សសកម្មក្នុងខែនេះទេ"
          hint="សូមពិនិត្យបញ្ជីសិស្ស ឬបញ្ចូលពិន្ទុប្រចាំខែជាមុនសិន។"
          actionLabel="ទៅកាន់ បញ្ជីពិន្ទុ"
          onAction={() => setActiveView('scores')}
        />
      ) : (
        <>
          <AppleCard noPadding>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7]">
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center w-10">
                      ល.រ
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2 text-left min-w-[160px]">
                      គោត្តនាម-នាម
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center">
                      ភេទ
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      ពិន្ទុសរុប
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      មធ្យម
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      ចំណាត់ថ្នាក់
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      និទ្ទេស
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      លទ្ធផល
                    </th>
                    <th colSpan={3} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">
                      ចំនួនអវត្តមាន
                    </th>
                    <th rowSpan={2} className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2 text-left">
                      ផ្សេងៗ
                    </th>
                    <th rowSpan={2} className="border-b border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center">
                      សិក្សាប័ត្រ
                    </th>
                  </tr>
                  <tr className="bg-[#fafafa] dark:bg-white/[0.04] text-[11px]">
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">
                      ច្ប
                    </th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">
                      អ.ច្ប
                    </th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1 text-center">
                      សរុប
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r, idx) => (
                    <tr
                      key={r.student.id ?? idx}
                      className="border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0 hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03]"
                    >
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center text-[#86868b]">
                        {fmt(idx + 1)}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 font-medium whitespace-nowrap">
                        {r.student.nameKm}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                        {r.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center">
                        {r.total !== null
                          ? fmt(Number.isInteger(r.total) ? r.total : r.total.toFixed(1))
                          : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-semibold">
                        {r.average !== null
                          ? fmt(formatAverage(r.average, scoreConfig.averageDecimalMode))
                          : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-bold text-[#ff3b30]">
                        {r.rank !== null ? fmt(r.rank) : '—'}
                      </td>
                      <td
                        className={`border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-bold ${
                          r.grade ? GRADE_COLOR_CLASSES[r.grade] : ''
                        }`}
                      >
                        {r.grade ?? '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center">
                        {r.passed === true ? (
                          <AppleBadge variant="green" size="sm">ជាប់</AppleBadge>
                        ) : r.passed === false ? (
                          <AppleBadge variant="red" size="sm">ធ្លាក់</AppleBadge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                        {r.attendance.excused > 0 ? fmt(r.attendance.excused) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center">
                        {r.attendance.unexcused > 0 ? fmt(r.attendance.unexcused) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-2 text-center font-medium">
                        {r.attendance.total > 0 ? fmt(r.attendance.total) : '—'}
                      </td>
                      <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 text-[#6e6e73] dark:text-[#98989d]">
                        {r.note || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <AppleButton
                          variant="ghost"
                          size="sm"
                          icon={<Download size={13} />}
                          disabled={r.rank === null}
                          onClick={() => {
                            setTargetReportRow(r);
                            setPendingExportType('report-one');
                          }}
                        >
                          ទាញយក
                        </AppleButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AppleCard>

          {/* Grade summary footer card */}
          <AppleCard>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              {GRADE_ORDER.map((g) => (
                <div
                  key={g}
                  className="px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.04] flex items-center justify-between"
                >
                  <span className={`font-bold ${GRADE_COLOR_CLASSES[g]}`}>និទ្ទេស {g}</span>
                  <span>
                    {fmt(summary.gradeCounts[g].total)} (ស {fmt(summary.gradeCounts[g].female)})
                  </span>
                </div>
              ))}
            </div>
          </AppleCard>
        </>
      )}

      <DocumentSignDialog
        isOpen={pendingExportType !== null}
        onClose={() => {
          setPendingExportType(null);
          setTargetReportRow(null);
          setTargetSemReportRow(null);
        }}
        title={
          pendingExportType === 'excel' || pendingExportType === 'sem-excel'
            ? 'នាំចេញលទ្ធផល (Excel)'
            : pendingExportType === 'report-one'
              ? `លទ្ធផលសិក្សា — ${targetReportRow?.student.nameKm ?? ''}`
              : pendingExportType === 'sem-report-one'
                ? `លទ្ធផលឆមាស — ${targetSemReportRow?.student.nameKm ?? ''}`
                : pendingExportType === 'report-all' || pendingExportType === 'sem-report-all'
                  ? 'ទាញយកលទ្ធផលសិក្សាទាំងអស់ (PDF)'
                  : 'នាំចេញលទ្ធផល (PDF)'
        }
        month={selectedMonth}
        onConfirm={handleConfirmExport}
      >
        {(pendingExportType === 'report-all' || pendingExportType === 'sem-report-all') && (
          <div>
            <label
              htmlFor="report-order-select"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              លំដាប់ទំព័រ
            </label>
            <select
              id="report-order-select"
              value={reportOrder}
              onChange={(e) => setReportOrder(e.target.value as ReportOrderMode)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1]"
            >
              <option value="rank" className="dark:bg-[#1c1c1e]">
                តាមចំណាត់ថ្នាក់ (លេខ ១ ដល់ចុងក្រោយ)
              </option>
              <option value="class" className="dark:bg-[#1c1c1e]">
                តាមបញ្ជីឈ្មោះថ្នាក់ (ក–អ)
              </option>
            </select>
          </div>
        )}
      </DocumentSignDialog>

      {printSemSignOptions && semesterSummary && (
        <div
          ref={semStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <SemesterResultsSheet
            cls={currentClass}
            profile={profile}
            summary={semesterSummary}
            scoreConfig={scoreConfig}
            signOptions={printSemSignOptions}
            useKhmerDigits={useKhmerNumerals}
          />
        </div>
      )}

      {printSemReportData && semesterSummary && (
        <div
          ref={semReportStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <SemesterReportSheet
            cls={currentClass}
            profile={profile}
            semester={semesterSummary.semester}
            subjects={currentClass.subjects}
            rows={printSemReportData.rows}
            totalStudents={semesterSummary.totalStudents}
            scoreConfig={scoreConfig}
            signOptions={printSemReportData.signOptions}
            useKhmerDigits={useKhmerNumerals}
          />
        </div>
      )}

      {printSignOptions && summary && (
        <div
          ref={pdfStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <MonthlyResultsSheet
            cls={currentClass}
            profile={profile}
            month={selectedMonth}
            summary={summary}
            scoreConfig={scoreConfig}
            signOptions={printSignOptions}
            useKhmerDigits={useKhmerNumerals}
          />
        </div>
      )}

      {printReportData && summary && (
        <div
          ref={reportStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <StudentReportSheet
            cls={currentClass}
            profile={profile}
            month={selectedMonth}
            subjects={currentClass.subjects}
            entries={printReportData.entries}
            totalStudents={summary.totalStudents}
            scoreConfig={scoreConfig}
            signOptions={printReportData.signOptions}
            useKhmerDigits={useKhmerNumerals}
          />
        </div>
      )}
    </div>
  );
};
