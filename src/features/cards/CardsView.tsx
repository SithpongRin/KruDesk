import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckSquare,
  Eye,
  FileDown,
  GraduationCap,
  Info,
  Search,
  Sliders,
  Square,
  User,
} from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import { useTemplateStore } from '../../store/useTemplateStore';
import type { Profile, Student as DomainStudent } from '../../types/domain';
import type { Student as CardStudent } from '../../types/cardStudent';
import type { PrintMode } from '../../types/print';
import {
  applyProfileToTemplate,
  getPhotoUrlForBlob,
  toCardStudent,
} from '../../lib/cardAdapter';
import { getActiveStudentsOrdered } from '../../lib/attendance';
import { buildExportFileName } from '../../lib/exportFilename';
import { PREDEFINED_TEMPLATES } from '../../db/defaultTemplates';
import { CARD_SIZE_PRESETS } from '../../utils/cardSizes';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import {
  computeSheetLayout,
  downloadPdf,
  generateStudentCardsPdf,
  type PdfGenerationProgress,
} from '../../services/pdfService';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleSegmentedControl } from '../../components/common/AppleSegmentedControl';
import { EmptyState } from '../../components/common/EmptyState';
import { StudentCardFront } from '../../components/card/StudentCardFront';
import { StudentCardBack } from '../../components/card/StudentCardBack';
import { CardPreviewModal } from '../../components/card/CardPreviewModal';
import { TemplateDesigner } from './TemplateDesigner';

interface CardsViewProps {
  profile: Profile;
}

type CardsTab = 'generate' | 'designer';

export const CardsView: React.FC<CardsViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    setSelectedClassId,
    useKhmerNumerals,
    addToast,
    setActiveView,
  } = useAppStore();

  const {
    currentTemplate,
    selectTemplate,
    setCardDimensions,
    printSettings,
    updatePrintSetting,
    savePrintSettings,
    loadFromDatabase,
    isInitialized,
  } = useTemplateStore();

  useEffect(() => {
    if (!isInitialized) {
      void loadFromDatabase();
    }
  }, [isInitialized, loadFromDatabase]);

  const [activeTab, setActiveTab] = useState<CardsTab>('generate');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printMode, setPrintMode] = useState<PrintMode>('duplex');
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [showCalibration, setShowCalibration] = useState(false);
  const [previewCardStudent, setPreviewCardStudent] = useState<CardStudent | undefined>();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<PdfGenerationProgress | null>(null);

  const fmtUi = (v: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(v) : toArabicNumerals(String(v));

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const currentClass = useMemo(() => {
    if (!classes || classes.length === 0) return undefined;
    return classes.find((c) => c.id === selectedClassId) ?? classes[0];
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (classes && classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      if (classes[0].id !== undefined) setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId, setSelectedClassId]);

  const classStudents = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    const list = await db.students.where('classId').equals(currentClass.id).toArray();
    return getActiveStudentsOrdered(list);
  }, [currentClass?.id]);

  // Select all active students in class by default when class changes or loads
  useEffect(() => {
    if (!classStudents) return;
    setSelectedIds(
      new Set(classStudents.map((s) => s.id).filter((id): id is number => id !== undefined))
    );
  }, [currentClass?.id, classStudents?.length]);

  const filteredStudents = useMemo(() => {
    if (!classStudents) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter(
      (s) =>
        s.nameKm.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        (s.cardNumber && s.cardNumber.toLowerCase().includes(q))
    );
  }, [classStudents, searchQuery]);

  const selectedDomainStudents = useMemo(() => {
    if (!classStudents) return [];
    return classStudents.filter((s) => s.id !== undefined && selectedIds.has(s.id));
  }, [classStudents, selectedIds]);

  // Map KruDesk Student + Class + Profile to original Card App Student & Template
  const effectiveTemplate = useMemo(
    () =>
      applyProfileToTemplate(
        currentTemplate,
        profile,
        currentClass?.academicYear || profile.academicYear
      ),
    [currentTemplate, profile, currentClass?.academicYear]
  );

  const selectedCardStudents: CardStudent[] = useMemo(() => {
    if (!currentClass) return [];
    return selectedDomainStudents.map((st) => toCardStudent(st, currentClass));
  }, [selectedDomainStudents, currentClass]);

  const allCardStudentsInClass: CardStudent[] = useMemo(() => {
    if (!currentClass || !classStudents) return [];
    return classStudents.map((st) => toCardStudent(st, currentClass));
  }, [classStudents, currentClass]);

  const toggleStudent = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInFilter = () => {
    setSelectedIds(
      new Set(
        filteredStudents.map((s) => s.id).filter((id): id is number => id !== undefined)
      )
    );
  };

  const selectWithPhotosOnly = () => {
    setSelectedIds(
      new Set(
        (classStudents ?? [])
          .filter((s) => Boolean(s.photoBlob) && s.id !== undefined)
          .map((s) => s.id!)
      )
    );
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Sheet layout computation (shared with pdfService)
  const effectiveSettings = {
    ...printSettings,
    cardWidthMm: effectiveTemplate.cardWidthMm,
    cardHeightMm: effectiveTemplate.cardHeightMm,
  };
  const sheet = computeSheetLayout(effectiveTemplate, effectiveSettings);
  const cardsPerPage = sheet.cardsPerPage;
  const totalCards = selectedCardStudents.length;
  const totalSheets = Math.ceil(totalCards / cardsPerPage) || 0;

  const handleExportPdf = async () => {
    if (!currentClass || selectedCardStudents.length === 0) return;

    setIsGenerating(true);
    setProgress({
      totalCards: selectedCardStudents.length,
      completedCards: 0,
      currentStep: 'កំពុងរៀបចំទំព័រ...',
      percent: 0,
    });

    try {
      const pdfBytes = await generateStudentCardsPdf(
        selectedCardStudents,
        effectiveTemplate,
        effectiveSettings,
        printMode,
        (p) => setProgress(p)
      );

      const fileName = buildExportFileName({
        document: 'កាតសិស្ស',
        className: currentClass.name,
        year: currentClass.academicYear,
        suffix: `${selectedCardStudents.length}កាត`,
        ext: 'pdf',
        useKhmerDigits: useKhmerNumerals,
      });
      downloadPdf(pdfBytes, fileName);

      addToast({
        type: 'success',
        title: 'ទាញយក PDF កាតសិស្សរួចរាល់!',
        message: `${fileName} (${fmtUi(cardsPerPage)} កាត/ទំព័រ)`,
      });
    } catch (err: unknown) {
      console.error('Cards PDF export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  // Live A4 Sheet scaled geometry
  const SHEET_W_PX = 540;
  const pxPerMm = SHEET_W_PX / sheet.paperWidthMm;
  const sheetHeightPx = sheet.paperHeightMm * pxPerMm;
  const isBack = previewSide === 'back';
  const sheetLeftMm = isBack ? sheet.backMarginLeftMm : sheet.marginLeftMm;
  const sheetTopMm = isBack ? sheet.backMarginTopMm : sheet.marginTopMm;

  const cardPos = (i: number) => {
    const r = Math.floor(i / sheet.cols);
    const c = i % sheet.cols;
    const col = isBack ? sheet.cols - 1 - c : c;
    return {
      left: (sheetLeftMm + col * sheet.cardWidthMm) * pxPerMm,
      top: (sheetTopMm + r * sheet.cardHeightMm) * pxPerMm,
    };
  };

  const trimMarks: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (printSettings.showCuttingGuides) {
    const g = sheet.cuttingGuideLengthMm;
    for (let r = 0; r <= sheet.rows; r++) {
      const y = sheetTopMm + r * sheet.cardHeightMm;
      for (let c = 0; c <= sheet.cols; c++) {
        const x = sheetLeftMm + c * sheet.cardWidthMm;
        if (r === 0 || r === sheet.rows) trimMarks.push({ x1: x - g, y1: y, x2: x + g, y2: y });
        if (c === 0 || c === sheet.cols) trimMarks.push({ x1: x, y1: y - g, x2: x, y2: y + g });
      }
    }
  }

  const page1PreviewCards: Partial<CardStudent>[] = (
    selectedCardStudents.length > 0 ? selectedCardStudents : allCardStudentsInClass
  ).slice(0, cardsPerPage);

  if (!classes || classes.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={<GraduationCap size={28} />}
          title="មិនទាន់មានថ្នាក់រៀន"
          hint="សូមបង្កើតថ្នាក់រៀន និងបន្ថែមសិស្សជាមុនសិន ដើម្បីបង្កើតកាតសិស្ស។"
          actionLabel="ទៅកាន់សិស្ស និងថ្នាក់"
          onAction={() => setActiveView('students')}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
              កាតសិស្ស
            </h1>
            {currentClass && (
              <AppleBadge variant="blue" size="sm">
                ថ្នាក់ទី {currentClass.name} ({fmtUi(currentClass.academicYear)})
              </AppleBadge>
            )}
            <AppleBadge variant="gray" size="sm">
              {fmtUi(effectiveTemplate.cardWidthMm)}×{fmtUi(effectiveTemplate.cardHeightMm)} mm ·{' '}
              {fmtUi(cardsPerPage)} កាត/A4
            </AppleBadge>
          </div>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            ជ្រើសរើសសិស្ស ពិនិត្យកាតគំរូ និងបង្កើត PDF លើក្រដាស A4 កម្រិត 300 DPI (គាំទ្រសងខាង Duplex និងបន្ទាត់កាត់)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <AppleSegmentedControl
            value={activeTab}
            onChange={(v) => setActiveTab(v as CardsTab)}
            options={[
              { value: 'generate', label: 'បង្កើត & បោះពុម្ព (PDF)' },
              { value: 'designer', label: 'កែសម្រួលគំរូកាត' },
            ]}
          />
        </div>
      </div>

      {activeTab === 'designer' && (
        <TemplateDesigner
          profile={profile}
          sampleStudents={allCardStudentsInClass}
          academicYear={currentClass?.academicYear || profile.academicYear}
        />
      )}

      {activeTab === 'generate' && (
        <div className="space-y-5">
          {/* Control Strip */}
          <AppleCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Class Selector */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="cards-class-select"
                    className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]"
                  >
                    ថ្នាក់៖
                  </label>
                  <select
                    id="cards-class-select"
                    value={currentClass?.id ?? ''}
                    onChange={(e) => setSelectedClassId(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id} className="dark:bg-[#1c1c1e]">
                        ថ្នាក់ទី {c.name} ({c.academicYear})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Variant */}
                <AppleSegmentedControl
                  size="sm"
                  value={currentTemplate.variant}
                  onChange={(v) => {
                    const matched = PREDEFINED_TEMPLATES.find((t) => t.variant === v);
                    if (matched) void selectTemplate(matched.id);
                  }}
                  options={[
                    { value: 'top-photo', label: 'គំរូទី១ (លើ)' },
                    { value: 'bottom-photo', label: 'គំរូទី២ (ក្រោម)' },
                  ]}
                />

                {/* A4 Grid Size */}
                <select
                  aria-label="ទំហំកាត និងប្លង់លើ A4"
                  value={`${currentTemplate.cardWidthMm}x${currentTemplate.cardHeightMm}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    const preset = CARD_SIZE_PRESETS.find(
                      (p) => p.widthMm === w && p.heightMm === h
                    );
                    setCardDimensions(w, h, {
                      whiteMarginMm: preset?.whiteMarginMm,
                      photoWidthMm: preset?.photoWidthMm,
                      photoHeightMm: preset?.photoHeightMm,
                    });
                    const isFour = w > 68 || h > 95;
                    updatePrintSetting('cardsPerPage', isFour ? 4 : 9);
                    updatePrintSetting('gridColumns', isFour ? 2 : 3);
                    updatePrintSetting('gridRows', isFour ? 2 : 3);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1]"
                >
                  <option value="81x116">7.5 × 11 cm ស៊ុម (4 កាត/A4)</option>
                  <option value="60x90">6 × 9 cm A2 Pouch (9 កាត/A4)</option>
                  <option value="64x92">6.4 × 9.2 cm MoEYS (9 កាត/A4)</option>
                  <option value="70x100">7 × 10 cm A3 Pouch (4 កាត/A4)</option>
                  <option value="95x135">9.5 × 13.5 cm A6 (4 កាត/A4)</option>
                  <option value="86x54">86 × 54 mm CR80 ផ្ដេក (10 កាត/A4)</option>
                  <option value="54x86">54 × 86 mm CR80 បញ្ឈរ (9 កាត/A4)</option>
                </select>

                {/* Print Mode */}
                <AppleSegmentedControl
                  size="sm"
                  value={printMode}
                  onChange={(v) => setPrintMode(v as PrintMode)}
                  options={[
                    { value: 'duplex', label: 'សងខាង (Duplex)' },
                    { value: 'front-only', label: 'តែខាងមុខ' },
                    { value: 'back-only', label: 'តែខាងក្រោយ' },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <AppleButton
                  variant="secondary"
                  size="sm"
                  icon={<Sliders size={14} />}
                  onClick={() => setShowCalibration((v) => !v)}
                >
                  {showCalibration ? 'លាក់ការកំណត់' : 'គម្លាត & បន្ទាត់កាត់'}
                </AppleButton>

                <AppleButton
                  variant="primary"
                  size="sm"
                  icon={<FileDown size={15} />}
                  onClick={() => void handleExportPdf()}
                  disabled={isGenerating || totalCards === 0}
                >
                  {isGenerating
                    ? 'កំពុងបង្កើត PDF...'
                    : `បង្កើត A4 PDF (${fmtUi(totalCards)} កាត)`}
                </AppleButton>
              </div>
            </div>

            {showCalibration && (
              <div className="mt-4 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">គែមឆ្វេង (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={printSettings.marginLeftMm}
                    onChange={(e) =>
                      updatePrintSetting('marginLeftMm', parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">គែមលើ (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={printSettings.marginTopMm}
                    onChange={(e) =>
                      updatePrintSetting('marginTopMm', parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Duplex X Offset (mm)</label>
                  <input
                    type="number"
                    step="0.2"
                    value={printSettings.duplexOffsetXmM}
                    onChange={(e) =>
                      updatePrintSetting('duplexOffsetXmM', parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Duplex Y Offset (mm)</label>
                  <input
                    type="number"
                    step="0.2"
                    value={printSettings.duplexOffsetYmM}
                    onChange={(e) =>
                      updatePrintSetting('duplexOffsetYmM', parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>
                <div className="col-span-full flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printSettings.showCuttingGuides}
                      onChange={(e) =>
                        updatePrintSetting('showCuttingGuides', e.target.checked)
                      }
                      className="w-4 h-4 accent-[#0071e3]"
                    />
                    <span className="font-medium">
                      បង្ហាញបន្ទាត់កាត់ (Cutting Guides)
                    </span>
                  </label>
                  <AppleButton
                    variant="secondary"
                    size="sm"
                    onClick={() => void savePrintSettings()}
                  >
                    រក្សាទុកការកំណត់
                  </AppleButton>
                </div>
              </div>
            )}

            {isGenerating && progress && (
              <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-[#0071e3]">{progress.currentStep}</span>
                  <span>{fmtUi(progress.percent)}%</span>
                </div>
                <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.1] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0071e3] transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </AppleCard>

          {/* Main 2-Column Layout: Student Picker + Live A4 Sheet Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Student Picker */}
            <div className="lg:col-span-5">
              <AppleCard
                title={`ជ្រើសរើសសិស្ស (${fmtUi(selectedIds.size)}/${fmtUi(
                  classStudents?.length ?? 0
                )})`}
                subtitle="ចុចលើឈ្មោះសិស្ស ឬប៊ូតុងភ្នែកដើម្បីមើលកាតជាក់ស្ដែង"
              >
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ស្វែងរកឈ្មោះ ឬអត្តលេខ..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.06] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <AppleButton size="sm" variant="secondary" onClick={selectAllInFilter}>
                      ជ្រើសទាំងអស់
                    </AppleButton>
                    <AppleButton size="sm" variant="secondary" onClick={selectWithPhotosOnly}>
                      អ្នកមានរូបថត
                    </AppleButton>
                    <AppleButton size="sm" variant="ghost" onClick={clearSelection}>
                      លុបការជ្រើស
                    </AppleButton>
                  </div>

                  <div className="max-h-[540px] overflow-y-auto divide-y divide-black/[0.05] dark:divide-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl">
                    {filteredStudents.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[#86868b]">
                        គ្មានសិស្សត្រូវគ្នាទេ។
                      </div>
                    ) : (
                      filteredStudents.map((st: DomainStudent, idx: number) => {
                        const sid = st.id!;
                        const checked = selectedIds.has(sid);
                        const thumbUrl = getPhotoUrlForBlob(st.photoBlob);

                        return (
                          <div
                            key={sid}
                            className={`flex items-center justify-between gap-2.5 px-3 py-2 text-xs transition-colors ${
                              checked
                                ? 'bg-[#0071e3]/[0.05] dark:bg-blue-500/10'
                                : 'hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleStudent(sid)}
                              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                            >
                              {checked ? (
                                <CheckSquare
                                  size={16}
                                  className="text-[#0071e3] shrink-0"
                                />
                              ) : (
                                <Square size={16} className="text-[#86868b] shrink-0" />
                              )}

                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={st.nameKm}
                                  className="w-7 h-9 rounded-md object-cover border border-black/10 shrink-0"
                                />
                              ) : (
                                <div className="w-7 h-9 rounded-md bg-[#f5f5f7] dark:bg-white/[0.06] flex items-center justify-center text-[#86868b] shrink-0">
                                  <User size={13} />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                                  {fmtUi(idx + 1)}. {st.nameKm}
                                </div>
                                <div className="text-[11px] text-[#86868b] flex items-center gap-2">
                                  <span className="font-mono">{fmtUi(st.studentId)}</span>
                                  <span>• {st.gender}</span>
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <AppleBadge
                                variant={st.photoBlob ? 'green' : 'gray'}
                                size="sm"
                              >
                                {st.photoBlob ? 'មានរូប' : 'គ្មានរូប'}
                              </AppleBadge>
                              <button
                                type="button"
                                aria-label={`មើលកាត ${st.nameKm}`}
                                title="មើលកាត"
                                onClick={() => {
                                  if (!currentClass) return;
                                  setPreviewCardStudent(toCardStudent(st, currentClass));
                                  setIsPreviewOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-[#0071e3] hover:bg-[#0071e3]/10"
                              >
                                <Eye size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </AppleCard>
            </div>

            {/* Right: Live A4 Sheet Preview */}
            <div className="lg:col-span-7">
              <AppleCard
                title="ទិដ្ឋភាពបោះពុម្ពលើក្រដាស A4 (ទំព័រទី 1)"
                subtitle={`${fmtUi(totalCards)} កាត · ${fmtUi(
                  printMode === 'duplex' ? totalSheets * 2 : totalSheets
                )} ទំព័រ A4 (${
                  previewSide === 'front' ? 'ខាងមុខ' : 'ខាងក្រោយត្រឡប់ Duplex'
                })`}
                headerAction={
                  <AppleSegmentedControl
                    size="sm"
                    value={previewSide}
                    onChange={(v) => setPreviewSide(v as 'front' | 'back')}
                    options={[
                      { value: 'front', label: 'មុខ (Front)' },
                      { value: 'back', label: 'ក្រោយ (Duplex)' },
                    ]}
                  />
                }
              >
                <div className="p-4 sm:p-6 bg-[#f5f5f7] dark:bg-black/30 rounded-2xl flex flex-col items-center justify-center overflow-x-auto">
                  <div
                    className="relative bg-white shadow-xl border border-black/[0.08] shrink-0 overflow-hidden"
                    style={{
                      width: `${SHEET_W_PX}px`,
                      height: `${sheetHeightPx}px`,
                    }}
                  >
                    {page1PreviewCards.map((st, idx) => {
                      const pos = cardPos(idx);
                      const cardWidthPx = sheet.cardWidthMm * pxPerMm;
                      const cardScale = cardWidthPx / (sheet.cardWidthMm * 5);

                      return (
                        <div
                          key={st.studentId || idx}
                          style={{
                            position: 'absolute',
                            left: `${pos.left}px`,
                            top: `${pos.top}px`,
                          }}
                        >
                          {previewSide === 'front' ? (
                            <StudentCardFront
                              student={st}
                              template={effectiveTemplate}
                              scale={cardScale}
                              showCuttingBorder={false}
                            />
                          ) : (
                            <StudentCardBack
                              template={effectiveTemplate}
                              scale={cardScale}
                              showCuttingBorder={false}
                            />
                          )}
                        </div>
                      );
                    })}

                    {trimMarks.length > 0 && (
                      <svg
                        className="absolute inset-0 pointer-events-none"
                        width={SHEET_W_PX}
                        height={sheetHeightPx}
                      >
                        {trimMarks.map((m, idx) => (
                          <line
                            key={idx}
                            x1={m.x1 * pxPerMm}
                            y1={m.y1 * pxPerMm}
                            x2={m.x2 * pxPerMm}
                            y2={m.y2 * pxPerMm}
                            stroke={printSettings.cuttingGuideColor || '#94a3b8'}
                            strokeWidth={1}
                          />
                        ))}
                      </svg>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-[11px] text-[#86868b] text-center">
                    <Info size={13} className="shrink-0 text-[#0071e3]" />
                    <span>
                      គន្លឹះ Duplex៖ ជ្រើសរើស Flip on Long Edge នៅពេល Print ចេញពី PDF ដើម្បីឱ្យខាងក្រោយត្រង់ចំខាងមុខ។
                    </span>
                  </div>
                </div>
              </AppleCard>
            </div>
          </div>
        </div>
      )}

      <CardPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        student={previewCardStudent}
        template={effectiveTemplate}
      />
    </div>
  );
};
