import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Award, Download } from 'lucide-react';
import { db, setSetting } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  resolveScoreConfig,
  type Profile,
  type SchoolClass,
  type ScoreConfig,
} from '../../types/domain';
import type { ScoreGrade } from '../../lib/grading';
import { formatKhmerMonthYear, resolveAcademicMonthKey } from '../../lib/khmerDate';
import { buildExportFileName } from '../../lib/exportFilename';
import {
  computeMonthlyResults,
  DEFAULT_GRADE_WORDS,
  getGradeWord,
  GRADE_ORDER,
  selectTopRankStudents,
  type MonthlyResultRow,
} from '../../lib/monthlyResults';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { DocumentSignDialog } from '../../components/common/DocumentSignDialog';
import {
  createDefaultSignOptions,
  type DocumentSignOptions,
} from '../../print/DocumentSignature';
import { CertificateSheet } from '../../print/CertificateSheet';
import { ensurePrintFontsReady, exportPrintNodesToPdf, nextPaint } from '../../services/pdfExport';

interface CertificatesViewProps {
  profile: Profile;
}

export const CertificatesView: React.FC<CertificatesViewProps> = ({ profile }) => {
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
    () => (resolveScoreConfig(scoreCfgRow?.value as Partial<ScoreConfig> | undefined)),
    [scoreCfgRow]
  );

  const gradeWordsRow = useLiveQuery(() => db.settings.get('certificateGradeWords'), []);
  const [gradeWords, setGradeWords] = useState<Record<ScoreGrade, string>>({
    ...DEFAULT_GRADE_WORDS,
  });

  useEffect(() => {
    const saved = gradeWordsRow?.value as Partial<Record<ScoreGrade, string>> | undefined;
    if (saved) {
      setGradeWords({ ...DEFAULT_GRADE_WORDS, ...saved });
    }
  }, [gradeWordsRow]);

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

  const top3 = useMemo(() => {
    if (!currentClass || !monthData) return [] as MonthlyResultRow[];
    const summary = computeMonthlyResults({
      students: monthData.students,
      subjects: currentClass.subjects,
      month: selectedMonth,
      scoresByStudent: monthData.scoresByStudent,
      attendanceLookup: new Map(),
      takenDates: new Set(),
      scoreConfig,
    });
    return selectTopRankStudents(summary.rows, 3);
  }, [currentClass, monthData, selectedMonth, scoreConfig]);

  const [previewIdx, setPreviewIdx] = useState(0);
  const safePreviewItem = top3[Math.min(previewIdx, Math.max(0, top3.length - 1))];

  const academicMonthOptions = useMemo(() => {
    const yearStr = currentClass?.academicYear || profile.academicYear || '2026-2027';
    const order = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return order.map((m) => resolveAcademicMonthKey(yearStr, m));
  }, [currentClass?.academicYear, profile.academicYear]);

  const savedPlaceRow = useLiveQuery(() => db.settings.get('documentPlace'), []);
  const savedLunarRow = useLiveQuery(() => db.settings.get('documentLunarDate'), []);

  const [pendingTarget, setPendingTarget] = useState<'all' | MonthlyResultRow | null>(null);
  const [printPayload, setPrintPayload] = useState<{
    items: MonthlyResultRow[];
    signOptions: DocumentSignOptions;
  } | null>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.62);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const CERT_W_PX = 1122.52; // 297mm at 96dpi
    const updateScale = () => {
      const avail = Math.max(240, el.clientWidth - 24);
      setPreviewScale(Math.min(0.85, avail / CERT_W_PX));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [top3.length]);

  const previewSignOptions = useMemo(
    () => ({
      ...createDefaultSignOptions(selectedMonth, (savedPlaceRow?.value as string) ?? ''),
      lunarDate: (savedLunarRow?.value as string) ?? '',
    }),
    [selectedMonth, savedPlaceRow, savedLunarRow]
  );

  const handleConfirmExport = async (signOptions: DocumentSignOptions) => {
    if (!currentClass) return;
    const target = pendingTarget;
    setPendingTarget(null);
    if (!target) return;

    try {
      await setSetting('certificateGradeWords', gradeWords).catch(() => {});
      const items = target === 'all' ? top3 : [target];
      setPrintPayload({ items, signOptions });
      await new Promise((r) => setTimeout(r, 80));
      await nextPaint();
      await ensurePrintFontsReady();
      const stage = pdfStageRef.current;
      if (!stage) return;
      const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
      const fileName =
        target === 'all'
          ? buildExportFileName({
              document: 'ប័ណ្ណសរសើរ',
              className: currentClass.name,
              month: selectedMonth,
              ext: 'pdf',
              useKhmerDigits: useKhmerNumerals,
            })
          : `ប័ណ្ណសរសើរ_${target.student.nameKm}_${selectedMonth}.pdf`;

      const exported = await exportPrintNodesToPdf(pageNodes, {
        fileName,
        orientation: 'landscape',
        pixelRatio: 3,
      });
      if (exported) addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
    } catch (err) {
      console.error('Certificates export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : 'មានបញ្ហាក្នុងការបង្កើត PDF',
      });
    } finally {
      setPrintPayload(null);
    }
  };

  if (!classes || classes.length === 0 || !currentClass) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<Award size={28} />}
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
            ប័ណ្ណសរសើរ — ថ្នាក់ទី {currentClass.name}
          </h1>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            {formatKhmerMonthYear(selectedMonth, useKhmerNumerals)} · សិស្សចំណាត់ថ្នាក់លេខ ១ ដល់ ៣ ({fmt(top3.length)} នាក់)
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

          <AppleButton
            variant="primary"
            size="sm"
            icon={<Download size={14} />}
            disabled={top3.length === 0}
            onClick={() => setPendingTarget('all')}
          >
            ទាញយកទាំងអស់
          </AppleButton>
        </div>
      </div>

      {top3.length === 0 ? (
        <EmptyState
          icon={<Award size={28} />}
          title="មិនទាន់មានសិស្សលេខ ១–៣ សម្រាប់ខែនេះទេ"
          hint="សូមបញ្ចូលពិន្ទុប្រចាំខែជាមុនសិន ដើម្បីបង្កើតប័ណ្ណសរសើរ។"
          actionLabel="ទៅកាន់ បញ្ជីពិន្ទុ"
          onAction={() => setActiveView('scores')}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <AppleCard title="បញ្ជីសិស្សលេខ ១–៣" noPadding>
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
              {top3.map((row, idx) => (
                <div
                  key={row.student.id ?? idx}
                  onClick={() => setPreviewIdx(idx)}
                  className={`px-4 py-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    idx === previewIdx
                      ? 'bg-[#eef5ff] dark:bg-blue-500/15'
                      : 'hover:bg-[#f5f5f7]/70 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AppleBadge variant="red" size="sm">
                        លេខ {fmt(row.rank ?? '')}
                      </AppleBadge>
                      <span className="text-xs font-semibold truncate">{row.student.nameKm}</span>
                    </div>
                    <div className="text-[11px] text-[#86868b] mt-0.5">
                      និទ្ទេស {row.grade ?? '—'} ({getGradeWord(row.grade, gradeWords)})
                    </div>
                  </div>
                  <AppleButton
                    variant="ghost"
                    size="sm"
                    icon={<Download size={13} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingTarget(row);
                    }}
                  >
                    ទាញយក
                  </AppleButton>
                </div>
              ))}
            </div>
          </AppleCard>

          <AppleCard className="lg:col-span-2 bg-[#f5f5f7] dark:bg-white/[0.02]">
            <div ref={previewWrapRef} className="w-full overflow-hidden flex justify-center">
              {safePreviewItem && (
                <div
                  style={{
                    width: `${Math.round(1122.52 * previewScale)}px`,
                    height: `${Math.round(793.7 * previewScale)}px`,
                    position: 'relative',
                  }}
                >
                  <div
                    className="shadow-lg origin-top-left"
                    style={{
                      width: '297mm',
                      height: '210mm',
                      transform: `scale(${previewScale})`,
                    }}
                  >
                    <CertificateSheet
                      cls={currentClass}
                      profile={profile}
                      month={selectedMonth}
                      items={[safePreviewItem]}
                      signOptions={previewSignOptions}
                      gradeWords={gradeWords}
                    />
                  </div>
                </div>
              )}
            </div>
          </AppleCard>
        </div>
      )}

      <DocumentSignDialog
        isOpen={pendingTarget !== null}
        onClose={() => setPendingTarget(null)}
        title={
          pendingTarget === 'all'
            ? 'ទាញយកប័ណ្ណសរសើរទាំងអស់ (PDF)'
            : `ប័ណ្ណសរសើរ — ${pendingTarget?.student.nameKm ?? ''}`
        }
        month={selectedMonth}
        onConfirm={handleConfirmExport}
      >
        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
            ពាក្យនិទ្ទេសលើប័ណ្ណសរសើរ
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GRADE_ORDER.map((g) => (
              <div key={g} className="flex items-center gap-1.5">
                <span className="text-xs font-bold w-4">{g}</span>
                <input
                  type="text"
                  aria-label={`ពាក្យនិទ្ទេស ${g}`}
                  value={gradeWords[g]}
                  onChange={(e) =>
                    setGradeWords((prev) => ({ ...prev, [g]: e.target.value }))
                  }
                  className="w-full px-2 py-1 rounded-lg text-xs bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1]"
                />
              </div>
            ))}
          </div>
        </div>
      </DocumentSignDialog>

      {printPayload && (
        <div
          ref={pdfStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <CertificateSheet
            cls={currentClass}
            profile={profile}
            month={selectedMonth}
            items={printPayload.items}
            signOptions={printPayload.signOptions}
            gradeWords={gradeWords}
          />
        </div>
      )}
    </div>
  );
};
