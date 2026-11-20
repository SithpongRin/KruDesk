import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Trophy } from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  resolveScoreConfig,
  type Profile,
  type SchoolClass,
  type ScoreConfig,
} from '../../types/domain';
import { formatKhmerMonthYear, resolveAcademicMonthKey } from '../../lib/khmerDate';
import { buildExportFileName } from '../../lib/exportFilename';
import {
  computeMonthlyResults,
  selectHonorRollStudents,
} from '../../lib/monthlyResults';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import {
  DocumentBorderButton,
  useDocumentBorder,
} from '../../components/common/DocumentBorderButton';
import { EmptyState } from '../../components/common/EmptyState';
import { DocumentSignDialog } from '../../components/common/DocumentSignDialog';
import {
  createDefaultSignOptions,
  type DocumentSignOptions,
} from '../../print/DocumentSignature';
import { HonorRollSheet } from '../../print/HonorRollSheet';
import { ensurePrintFontsReady, exportPrintNodesToPdf, nextPaint } from '../../services/pdfExport';

interface HonorRollViewProps {
  profile: Profile;
}

export const HonorRollView: React.FC<HonorRollViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    setSelectedClassId,
    selectedMonth,
    setSelectedMonth,
    useKhmerNumerals,
    setActiveView,
    addToast,
  } = useAppStore();
  const honorRollNameBanner = useDocumentBorder('honorRollNameBanner');

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
    () => (resolveScoreConfig(scoreCfgRow?.value as Partial<ScoreConfig> | undefined)),
    [scoreCfgRow]
  );

  const monthData = useLiveQuery(async () => {
    if (!currentClass?.id) return null;
    const classId = currentClass.id;
    const [students, scoreRows] = await Promise.all([
      db.students.where('classId').equals(classId).toArray(),
      db.monthlyScores.where('[classId+month]').equals([classId, selectedMonth]).toArray(),
    ]);
    const scoresByStudent = new Map<number, Record<string, number | null>>();
    for (const r of scoreRows) {
      scoresByStudent.set(r.studentRef, r.scores);
    }
    return { students, scoresByStudent };
  }, [currentClass?.id, selectedMonth]);

  const honor = useMemo(() => {
    if (!currentClass || !monthData) return { items: [], overflowCount: 0 };
    const summary = computeMonthlyResults({
      students: monthData.students,
      subjects: currentClass.subjects,
      month: selectedMonth,
      scoresByStudent: monthData.scoresByStudent,
      attendanceLookup: new Map(),
      takenDates: new Set(),
      scoreConfig,
    });
    return selectHonorRollStudents(summary.rows, 5, 6);
  }, [currentClass, monthData, selectedMonth, scoreConfig]);

  useEffect(() => {
    if (honor.overflowCount > 0) {
      addToast({
        type: 'info',
        title: `មានសិស្សលើស ${fmt(6)} នាក់នៅចំណាត់ថ្នាក់លេខ ១–៥`,
        message: 'តារាងកិត្តិយសបង្ហាញតែ ៦ នាក់ដំបូងប៉ុណ្ណោះ។',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [honor.overflowCount, currentClass?.id, selectedMonth]);

  const academicMonthOptions = useMemo(() => {
    const yearStr = currentClass?.academicYear || profile.academicYear || '2026-2027';
    const order = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return order.map((m) => resolveAcademicMonthKey(yearStr, m));
  }, [currentClass?.academicYear, profile.academicYear]);

  const savedPlaceRow = useLiveQuery(() => db.settings.get('documentPlace'), []);
  const savedLunarRow = useLiveQuery(() => db.settings.get('documentLunarDate'), []);

  const [isSignOpen, setIsSignOpen] = useState(false);
  const [printSignOptions, setPrintSignOptions] = useState<DocumentSignOptions | null>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);

  const previewSignOptions = useMemo(
    () => ({
      ...createDefaultSignOptions(selectedMonth, (savedPlaceRow?.value as string) ?? ''),
      lunarDate: (savedLunarRow?.value as string) ?? '',
    }),
    [selectedMonth, savedPlaceRow, savedLunarRow]
  );

  const handleConfirmExport = async (signOptions: DocumentSignOptions) => {
    if (!currentClass) return;
    setIsSignOpen(false);
    try {
      setPrintSignOptions(signOptions);
      await new Promise((r) => setTimeout(r, 80));
      await nextPaint();
      await ensurePrintFontsReady();
      const stage = pdfStageRef.current;
      if (!stage) return;
      const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
      const fileName = buildExportFileName({
        document: 'តារាងកិត្តិយស',
        className: currentClass.name,
        month: selectedMonth,
        ext: 'pdf',
        useKhmerDigits: useKhmerNumerals,
      });
      const exported = await exportPrintNodesToPdf(pageNodes, {
        fileName,
        orientation: 'portrait',
        pixelRatio: 3,
      });
      if (exported) addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
    } catch (err) {
      console.error('HonorRoll export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : 'មានបញ្ហាក្នុងការបង្កើត PDF',
      });
    } finally {
      setPrintSignOptions(null);
    }
  };

  if (!classes || classes.length === 0 || !currentClass) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<Trophy size={28} />}
          title="មិនទាន់មានថ្នាក់រៀននៅឡើយទេ"
          hint="សូមបង្កើតថ្នាក់រៀន និងបញ្ចូលពិន្ទុប្រចាំខែជាមុនសិន។"
          actionLabel="ទៅកាន់ សិស្ស"
          onAction={() => setActiveView('students')}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
            តារាងកិត្តិយស — ថ្នាក់ទី {currentClass.name}
          </h1>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            {formatKhmerMonthYear(selectedMonth, useKhmerNumerals)} · សិស្សលេខ ១ ដល់ ៥ ({fmt(honor.items.length)} នាក់)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <DocumentBorderButton
            borderKey="honorRollNameBanner"
            current={honorRollNameBanner}
            label="ប្ដូរស៊ុមឈ្មោះ"
            resetLabel="ស៊ុមឈ្មោះដើម"
          />

          <AppleButton
            variant="primary"
            size="sm"
            icon={<Download size={14} />}
            disabled={honor.items.length === 0}
            onClick={() => setIsSignOpen(true)}
          >
            នាំចេញ PDF
          </AppleButton>
        </div>
      </div>

      {honor.items.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} />}
          title="មិនទាន់មានទិន្នន័យចំណាត់ថ្នាក់សម្រាប់ខែនេះទេ"
          hint="សូមបញ្ចូលពិន្ទុប្រចាំខែជាមុនសិន ដើម្បីបង្ហាញតារាងកិត្តិយស។"
          actionLabel="ទៅកាន់ បញ្ជីពិន្ទុ"
          onAction={() => setActiveView('scores')}
        />
      ) : (
        <AppleCard className="overflow-x-auto flex justify-center bg-[#f5f5f7] dark:bg-white/[0.02]">
          <div className="shadow-lg origin-top scale-[0.72] sm:scale-[0.85] lg:scale-100">
            <HonorRollSheet
              nameBanner={honorRollNameBanner}
              cls={currentClass}
              profile={profile}
              month={selectedMonth}
              items={honor.items}
              signOptions={previewSignOptions}
            />
          </div>
        </AppleCard>
      )}

      <DocumentSignDialog
        isOpen={isSignOpen}
        onClose={() => setIsSignOpen(false)}
        title="នាំចេញតារាងកិត្តិយស (PDF)"
        month={selectedMonth}
        onConfirm={handleConfirmExport}
      />

      {printSignOptions && (
        <div
          ref={pdfStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <HonorRollSheet
            nameBanner={honorRollNameBanner}
            cls={currentClass}
            profile={profile}
            month={selectedMonth}
            items={honor.items}
            signOptions={printSignOptions}
          />
        </div>
      )}
    </div>
  );
};
