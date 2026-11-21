import React, { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileSpreadsheet, FileText, ListOrdered, Users } from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import type { Profile, SchoolClass, Student } from '../../types/domain';
import { getActiveStudentsOrdered } from '../../lib/attendance';
import { buildExportFileName } from '../../lib/exportFilename';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { RosterSheet } from '../../print/RosterSheet';
import { exportRosterExcel } from '../../services/excelExport';
import { ensurePrintFontsReady, exportPrintNodesToPdf, nextPaint } from '../../services/pdfExport';

interface RosterViewProps {
  profile: Profile;
}

export const RosterView: React.FC<RosterViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    setSelectedClassId,
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

  const rawStudents = useLiveQuery(async () => {
    if (!currentClass?.id) return [] as Student[];
    return db.students.where('classId').equals(currentClass.id).toArray();
  }, [currentClass?.id]);

  const activeStudents = useMemo(
    () => (rawStudents ? getActiveStudentsOrdered(rawStudents) : []),
    [rawStudents]
  );

  const maleCount = useMemo(
    () => activeStudents.filter((s) => s.gender === 'ប្រុស').length,
    [activeStudents]
  );
  const femaleCount = useMemo(
    () => activeStudents.filter((s) => s.gender === 'ស្រី').length,
    [activeStudents]
  );

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [printData, setPrintData] = useState<{
    cls: SchoolClass;
    students: Student[];
  } | null>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = async () => {
    if (!currentClass) return;
    setIsExportMenuOpen(false);
    setIsExporting(true);
    try {
      setPrintData({ cls: currentClass, students: activeStudents });
      await new Promise((r) => setTimeout(r, 80));
      await nextPaint();
      await ensurePrintFontsReady();
      const stage = pdfStageRef.current;
      if (!stage) return;
      const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
      const fileName = buildExportFileName({
        document: 'បញ្ជីហៅឈ្មោះ',
        className: currentClass.name,
        year: currentClass.academicYear,
        ext: 'pdf',
        useKhmerDigits: useKhmerNumerals,
      });
      const exported = await exportPrintNodesToPdf(pageNodes, {
        fileName,
        orientation: 'landscape',
        pixelRatio: 3,
      });
      if (exported) addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
    } catch (err) {
      console.error('Roster PDF export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPrintData(null);
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentClass) return;
    setIsExportMenuOpen(false);
    setIsExporting(true);
    try {
      const fileName = await exportRosterExcel(
        currentClass,
        activeStudents,
        profile,
        useKhmerNumerals
      );
      addToast({ type: 'success', title: 'នាំចេញ Excel ជោគជ័យ!', message: fileName });
    } catch (err) {
      console.error('Roster Excel export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!classes || classes.length === 0 || !currentClass) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<ListOrdered size={28} />}
          title="មិនទាន់មានថ្នាក់រៀននៅឡើយទេ"
          hint="សូមបង្កើតថ្នាក់រៀន និងបញ្ចូលឈ្មោះសិស្សជាមុនសិន។"
          actionLabel="ទៅកាន់ សិស្ស"
          onAction={() => setActiveView('students')}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
            បញ្ជីហៅឈ្មោះ — ថ្នាក់ទី {currentClass.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-xs text-[#86868b] dark:text-[#98989d]">
              ឆ្នាំសិក្សា {fmt(currentClass.academicYear)}
            </span>
            <AppleBadge variant="blue" size="sm">
              ប្រុស {fmt(maleCount)}
            </AppleBadge>
            <AppleBadge variant="orange" size="sm">
              ស្រី {fmt(femaleCount)}
            </AppleBadge>
            <AppleBadge variant="green" size="sm">
              សរុប {fmt(activeStudents.length)}
            </AppleBadge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {classes.length > 1 && (
            <select
              aria-label="ជ្រើសរើសថ្នាក់"
              value={currentClass.id ?? ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id} className="dark:bg-[#1c1c1e]">
                  ថ្នាក់ {cls.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <AppleButton
              variant="primary"
              size="sm"
              icon={<Download size={14} />}
              disabled={activeStudents.length === 0 || isExporting}
              onClick={() => setIsExportMenuOpen((v) => !v)}
            >
              {isExporting ? 'កំពុងនាំចេញ...' : 'នាំចេញ'}
            </AppleButton>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-white dark:bg-[#2c2c2e] border border-black/[0.08] dark:border-white/[0.12] shadow-xl py-1.5 z-30">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  className="w-full px-3.5 py-2 text-left text-xs text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <FileText size={14} className="text-[#ff3b30]" />
                  <span>នាំចេញ PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportExcel()}
                  className="w-full px-3.5 py-2 text-left text-xs text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <FileSpreadsheet size={14} className="text-[#34c759]" />
                  <span>នាំចេញ Excel</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeStudents.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={`គ្មានសិស្សកំពុងរៀនក្នុងថ្នាក់ទី ${currentClass.name}`}
          hint="សូមបន្ថែមសិស្សក្នុងម៉ូឌុល «សិស្ស» ជាមុនសិន។"
          actionLabel="ទៅកាន់ សិស្ស"
          onAction={() => setActiveView('students')}
        />
      ) : (
        <AppleCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7]">
                  <th className="sticky left-0 z-20 bg-[#f5f5f7] dark:bg-[#242426] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2.5 text-center w-11">
                    ល.រ
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2.5 text-center whitespace-nowrap">
                    អត្តលេខ
                  </th>
                  <th className="sticky left-11 z-20 bg-[#f5f5f7] dark:bg-[#242426] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2.5 text-left min-w-[160px] whitespace-nowrap">
                    គោត្តនាម និងនាម
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2.5 text-center whitespace-nowrap">
                    ភេទ
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2.5 text-center whitespace-nowrap">
                    ថ្ងៃខែឆ្នាំកំណើត
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2.5 text-left whitespace-nowrap">
                    ឈ្មោះឪពុក
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2.5 text-left whitespace-nowrap">
                    មុខរបរ (ឪពុក)
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2.5 text-left whitespace-nowrap">
                    ឈ្មោះម្ដាយ
                  </th>
                  <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-3 py-2.5 text-left whitespace-nowrap">
                    មុខរបរ (ម្ដាយ)
                  </th>
                  <th className="border-b border-black/[0.08] dark:border-white/[0.1] px-3 py-2.5 text-left min-w-[180px] whitespace-nowrap">
                    ទីកន្លែងរស់នៅបច្ចុប្បន្ន
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeStudents.map((s, idx) => (
                  <tr
                    key={s.id ?? s.studentId}
                    className="border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0 hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03]"
                  >
                    <td className="sticky left-0 z-10 bg-white dark:bg-[#1c1c1e] border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center text-[#86868b]">
                      {fmt(idx + 1)}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center font-mono text-[11px] whitespace-nowrap">
                      {s.studentId || '—'}
                    </td>
                    <td className="sticky left-11 z-10 bg-white dark:bg-[#1c1c1e] border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 font-medium text-[#1d1d1f] dark:text-[#f5f5f7] whitespace-nowrap">
                      {s.nameKm}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center">
                      {s.gender}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2 text-center whitespace-nowrap">
                      {s.dateOfBirth ? fmt(s.dateOfBirth) : '—'}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 whitespace-nowrap">
                      {s.fatherName || '—'}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 whitespace-nowrap">
                      {s.fatherOccupation || '—'}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 whitespace-nowrap">
                      {s.motherName || '—'}
                    </td>
                    <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-3 py-2 whitespace-nowrap">
                      {s.motherOccupation || '—'}
                    </td>
                    <td className="px-3 py-2">{s.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AppleCard>
      )}

      {/* Offscreen PDF Print Stage */}
      {printData && (
        <div
          ref={pdfStageRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}
        >
          <RosterSheet
            cls={printData.cls}
            students={printData.students}
            profile={profile}
            useKhmerDigits={useKhmerNumerals}
          />
        </div>
      )}
    </div>
  );
};
