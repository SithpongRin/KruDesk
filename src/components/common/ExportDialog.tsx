import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { AppleModal } from './AppleModal';
import { AppleButton } from './AppleButton';
import type { SchoolClass } from '../../types/domain';
import type { PageOrientation, PaperSize } from '../../services/pdfExport';
import { formatKhmerMonthYear, parseYearMonth } from '../../lib/khmerDate';
import { useAppStore } from '../../store/useAppStore';

export type ExportFormat = 'excel' | 'pdf' | 'print';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  classes: SchoolClass[];
  defaultClassId: number | null;
  showMonthPicker?: boolean;
  showPaperSizePicker?: boolean;
  showOrientationPicker?: boolean;
  defaultOrientation?: PageOrientation;
  defaultMonth?: string;
  onExport: (params: {
    format: ExportFormat;
    classId: number;
    months: string[];
    paperSize?: PaperSize;
    orientation?: PageOrientation;
  }) => Promise<void>;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  title,
  classes,
  defaultClassId,
  showMonthPicker = false,
  showPaperSizePicker = false,
  showOrientationPicker = false,
  defaultOrientation = 'landscape',
  defaultMonth,
  onExport,
}) => {
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const storeMonth = useAppStore((s) => s.selectedMonth);
  const baseMonth = defaultMonth || storeMonth;

  const [format, setFormat] = useState<ExportFormat>('excel');
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [orientation, setOrientation] = useState<PageOrientation>(defaultOrientation);
  const [classId, setClassId] = useState<number>(defaultClassId ?? classes[0]?.id ?? 0);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([baseMonth]);
  const [isExporting, setIsExporting] = useState(false);

  const monthOptions = useMemo(() => {
    const { year, month } = parseYearMonth(baseMonth);
    // Show academic year span: 12 months centered or starting Nov..Oct around baseMonth's year
    const startYear = month >= 10 ? year : year - 1;
    const list: string[] = [];
    for (let i = 0; i < 12; i++) {
      const m = ((9 + i) % 12) + 1; // Oct..Sep (or Nov..Oct)
      const y = m >= 10 ? startYear : startYear + 1;
      list.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    if (!list.includes(baseMonth)) list.unshift(baseMonth);
    return list;
  }, [baseMonth]);

  React.useEffect(() => {
    if (isOpen) {
      setClassId(defaultClassId ?? classes[0]?.id ?? 0);
      setSelectedMonths([baseMonth]);
      setOrientation(defaultOrientation);
    }
  }, [isOpen, defaultClassId, classes, baseMonth, defaultOrientation]);

  const toggleMonth = (ym: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(ym)) {
        return prev.length > 1 ? prev.filter((m) => m !== ym) : prev;
      }
      return [...prev, ym].sort();
    });
  };

  const handleRun = async () => {
    if (!classId) return;
    setIsExporting(true);
    try {
      await onExport({
        format,
        classId,
        months: showMonthPicker ? selectedMonths : [baseMonth],
        paperSize: showPaperSizePicker ? paperSize : undefined,
        orientation: showOrientationPicker ? orientation : undefined,
      });
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="ជ្រើសរើសទម្រង់ឯកសារ និងថ្នាក់រៀន"
      maxWidth="md"
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={onClose} disabled={isExporting}>
            បោះបង់
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={!classId || isExporting || (showMonthPicker && selectedMonths.length === 0)}
          >
            {isExporting ? 'កំពុងរៀបចំ...' : 'នាំចេញ'}
          </AppleButton>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="export-class-select"
            className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
          >
            ថ្នាក់រៀន
          </label>
          <select
            id="export-class-select"
            value={classId}
            onChange={(e) => setClassId(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id} className="dark:bg-[#1c1c1e]">
                ថ្នាក់ទី {c.name} ({c.academicYear})
              </option>
            ))}
          </select>
        </div>

        {showMonthPicker && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                ជ្រើសរើសខែ (អាចជ្រើសច្រើនខែ)
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonths([baseMonth])}
                className="text-[11px] text-[#0071e3] hover:underline"
              >
                តែខែបច្ចុប្បន្ន
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {monthOptions.map((ym) => {
                const active = selectedMonths.includes(ym);
                return (
                  <button
                    key={ym}
                    type="button"
                    onClick={() => toggleMonth(ym)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                      active
                        ? 'border-[#0071e3] bg-[#e8f2ff] dark:bg-blue-500/20 text-[#0071e3] dark:text-blue-300'
                        : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    {formatKhmerMonthYear(ym, useKhmerNumerals)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
            ទម្រង់ឯកសារ
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setFormat('excel')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 text-xs font-medium transition-all ${
                format === 'excel'
                  ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                  : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
              }`}
            >
              <FileSpreadsheet size={20} />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 text-xs font-medium transition-all ${
                format === 'pdf'
                  ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                  : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
              }`}
            >
              <FileText size={20} />
              <span>PDF (.pdf)</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat('print')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 text-xs font-medium transition-all ${
                format === 'print'
                  ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                  : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
              }`}
            >
              <Printer size={20} />
              <span>បោះពុម្ព</span>
            </button>
          </div>
        </div>

        {showOrientationPicker && format !== 'excel' && (
          <div>
            <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
              ទិសក្រដាស (A4)
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  orientation === 'landscape'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                    : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                }`}
              >
                ផ្ដេក (Landscape)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  orientation === 'portrait'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                    : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                }`}
              >
                បញ្ឈរ (Portrait)
              </button>
            </div>
          </div>
        )}

        {showPaperSizePicker && format !== 'excel' && (
          <div>
            <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
              ទំហំក្រដាស
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPaperSize('A4')}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  paperSize === 'A4'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                    : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                }`}
              >
                A4 ផ្ដេក (2 ទំព័រ៖ ឆមាសទី 1 និង 2)
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('A3')}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                  paperSize === 'A3'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 text-[#0071e3]'
                    : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                }`}
              >
                A3 ផ្ដេក (1 ទំព័រពេញ)
              </button>
            </div>
          </div>
        )}
      </div>
    </AppleModal>
  );
};
