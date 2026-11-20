import React, { useMemo, useState } from 'react';
import { RotateCcw, Save, CheckCircle2, Sliders } from 'lucide-react';
import type { Profile } from '../../types/domain';
import type { Student as CardStudent } from '../../types/cardStudent';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useAppStore } from '../../store/useAppStore';
import { applyProfileToTemplate } from '../../lib/cardAdapter';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleSegmentedControl } from '../../components/common/AppleSegmentedControl';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StudentCardFront } from '../../components/card/StudentCardFront';
import { StudentCardBack } from '../../components/card/StudentCardBack';
import {
  PREDEFINED_TEMPLATES,
  defaultReferenceTemplate,
  DEFAULT_STUDENT_CARD_RULES,
} from '../../db/defaultTemplates';
import {
  CARD_SIZE_PRESETS,
  PHOTO_3X4_HEIGHT_MM,
  PHOTO_3X4_WIDTH_MM,
} from '../../utils/cardSizes';
import { resolveFlourishUrl } from '../../utils/assets';

interface TemplateDesignerProps {
  profile: Profile;
  sampleStudents: CardStudent[];
  academicYear?: string;
}

const FALLBACK_SAMPLE_STUDENT: CardStudent = {
  studentId: 'KD-001',
  nameKm: 'សុខ សុវណ្ណារ៉ា',
  gender: 'ប្រុស',
  nationality: 'ខ្មែរ',
  dateOfBirth: '15/04/2013',
  placeOfBirth: 'ភ្នំពេញ',
  class: '7ក',
  academicYear: '2026-2027',
  fatherName: 'សុខ ចាន់ថន',
  fatherOccupation: 'កសិករ',
  motherName: 'មាស សុខា',
  motherOccupation: 'មេផ្ទះ',
  address: 'ភូមិស្វាយ ឃុំដំណាក់ព្រីង',
  phone: '012 889 900',
  cardNumber: '001',
  createdAt: 1,
  updatedAt: 1,
};

export const TemplateDesigner: React.FC<TemplateDesignerProps> = ({
  profile,
  sampleStudents,
  academicYear,
}) => {
  const {
    currentTemplate,
    selectTemplate,
    updateTemplateField,
    setCardDimensions,
    resetToReferenceTemplate,
    saveTemplate,
  } = useTemplateStore();
  const { addToast } = useAppStore();

  const [activeSide, setActiveSide] = useState<'front' | 'back' | 'split'>('split');
  const [activeTab, setActiveTab] = useState<
    'institution' | 'card' | 'watermark' | 'dimensions'
  >('institution');
  const [sampleIndex, setSampleIndex] = useState<number>(0);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const sampleList = sampleStudents.length > 0 ? sampleStudents : [FALLBACK_SAMPLE_STUDENT];
  const sampleStudent = sampleList[sampleIndex % sampleList.length];

  const effectiveTemplate = useMemo(
    () => applyProfileToTemplate(currentTemplate, profile, academicYear),
    [currentTemplate, profile, academicYear]
  );

  const handleSelectPredefined = async (tpl: typeof defaultReferenceTemplate) => {
    await selectTemplate(tpl.id);
    addToast({
      type: 'info',
      title: 'បានប្ដូរគំរូ',
      message: `បានជ្រើសរើស៖ ${tpl.name}`,
    });
  };

  const handleConfirmReset = async () => {
    await resetToReferenceTemplate();
    setResetConfirmOpen(false);
    addToast({
      type: 'info',
      title: 'បានកំណត់ឡើងវិញ',
      message: 'គំរូកាតត្រូវបានស្ដារទៅកាន់គំរូដើមផ្លូវការ',
    });
  };

  const handleSave = async () => {
    await saveTemplate();
    addToast({
      type: 'success',
      title: 'បានរក្សាទុក!',
      message: 'គំរូកាតត្រូវបានរក្សាទុកក្នុងម៉ាស៊ីនដោយជោគជ័យ',
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
            កែសម្រួលគំរូកាត (Card Template Designer)
          </h2>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-0.5">
            ឈ្មោះសាលា ({profile.schoolName}), នាយក ({profile.directorName}) និងឆ្នាំសិក្សា ត្រូវបានយកពីការកំណត់ថ្នាក់ដោយស្វ័យប្រវត្តិ
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <AppleButton
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={() => setResetConfirmOpen(true)}
          >
            ស្ដារគំរូដើម
          </AppleButton>

          <AppleButton
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
          >
            រក្សាទុកគំរូ
          </AppleButton>
        </div>
      </div>

      {/* Template Selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-[#0071e3]" />
          <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            ជ្រើសរើសប្រភេទគំរូកាតផ្លូវការ
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PREDEFINED_TEMPLATES.map((tpl, idx) => {
            const isSelected = currentTemplate.id === tpl.id;
            return (
              <div
                key={tpl.id}
                onClick={() => void handleSelectPredefined(tpl)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-[#0071e3] bg-[#0071e3]/[0.05] dark:bg-blue-500/15 shadow-sm ring-2 ring-[#0071e3]/20'
                    : 'border-black/[0.06] dark:border-white/[0.1] bg-white dark:bg-[#1c1c1e] hover:border-black/[0.15]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected
                        ? 'bg-[#0071e3] text-white'
                        : 'bg-[#f5f5f7] dark:bg-white/[0.08] text-[#1d1d1f] dark:text-[#f5f5f7]'
                    }`}
                  >
                    T{idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                      {tpl.name}
                    </div>
                    <div className="text-[11px] text-[#86868b] mt-0.5 truncate">
                      {tpl.variant === 'top-photo'
                        ? `${tpl.cardWidthMm}×${tpl.cardHeightMm}mm | ${tpl.cardTitleKm}`
                        : 'រូបថតខាងក្រោម | ប័ណ្ណសម្គាល់ខ្លួនសិស្ស'}
                    </div>
                  </div>
                </div>

                {isSelected ? (
                  <CheckCircle2 size={20} className="text-[#0071e3] shrink-0" />
                ) : (
                  <span className="text-xs text-[#86868b] shrink-0">ជ្រើសរើស</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Live Preview (Left) + Controls (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 space-y-4">
          <AppleCard
            title="ទិដ្ឋភាពជាក់ស្ដែង (Live Preview)"
            subtitle="កាតនឹងបង្ហាញបែបនេះពេលបោះពុម្ព PDF 300 DPI"
            headerAction={
              <AppleSegmentedControl
                size="sm"
                options={[
                  { value: 'split', label: 'សងខាង' },
                  { value: 'front', label: 'មុខ' },
                  { value: 'back', label: 'ក្រោយ' },
                ]}
                value={activeSide}
                onChange={(v) => setActiveSide(v as 'front' | 'back' | 'split')}
              />
            }
          >
            <div className="p-4 bg-[#f5f5f7] dark:bg-black/30 rounded-2xl flex flex-wrap items-center justify-center gap-5 min-h-[400px] overflow-x-auto">
              {(activeSide === 'split' || activeSide === 'front') && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#86868b]">
                    ខាងមុខ (FRONT)
                  </span>
                  <div className="shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-sm bg-white overflow-hidden">
                    <StudentCardFront
                      student={sampleStudent}
                      template={effectiveTemplate}
                      scale={0.82}
                      showCuttingBorder={false}
                    />
                  </div>
                </div>
              )}

              {(activeSide === 'split' || activeSide === 'back') && (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#86868b]">
                    ខាងក្រោយ (BACK)
                  </span>
                  <div className="shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-sm bg-white overflow-hidden">
                    <StudentCardBack
                      template={effectiveTemplate}
                      scale={0.82}
                      showCuttingBorder={false}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-[#86868b] pt-3 border-t border-black/[0.05] dark:border-white/[0.08]">
              <span>
                ទិន្នន័យតេស្ត៖ {sampleStudent.nameKm} (ថ្នាក់ {sampleStudent.class})
              </span>
              {sampleList.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSampleIndex((i) => (i + 1) % sampleList.length)}
                  className="text-[#0071e3] font-medium hover:underline"
                >
                  ប្ដូរសិស្សតេស្តផ្សេង
                </button>
              )}
            </div>
          </AppleCard>
        </div>

        <div className="lg:col-span-6 space-y-4">
          <AppleCard
            title="ការកំណត់ព័ត៌មានកាត"
            subtitle="កែប្រែទិន្នន័យស្ថាប័ន ឬការរចនា"
          >
            <div className="flex border-b border-black/[0.06] dark:border-white/[0.1] mb-5 overflow-x-auto">
              {[
                { id: 'institution', label: 'ស្ថាប័ន & សាលា' },
                { id: 'card', label: 'ចំណងជើង & ហត្ថលេខា' },
                { id: 'watermark', label: 'ខាងក្រោយ & Watermark' },
                { id: 'dimensions', label: 'ខ្នាត & ពណ៌' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      tab.id as 'institution' | 'card' | 'watermark' | 'dimensions'
                    )
                  }
                  className={`px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'border-[#0071e3] text-[#0071e3]'
                      : 'border-transparent text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'institution' && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                    ពាក្យស្លោកទី១
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.countryHeaderKm1}
                    onChange={(e) => updateTemplateField('countryHeaderKm1', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                    ពាក្យស្លោកទី២
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.countryHeaderKm2}
                    onChange={(e) => updateTemplateField('countryHeaderKm2', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                    មន្ទីរអប់រំ ឬស្ថាប័នគ្រប់គ្រង
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.ministryDepartment}
                    onChange={(e) =>
                      updateTemplateField('ministryDepartment', e.target.value)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] font-bold"
                  />
                </div>

                <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5">
                    ក្បាច់រចនាផ្នែកខាងក្រោមព្រះរាជា (Flourish)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: '1', url: resolveFlourishUrl('1'), label: 'ក្បាច់ទី១ (Royal Floral)' },
                      { id: '2', url: resolveFlourishUrl('2'), label: 'ក្បាច់ទី២ (Calligraphic)' },
                      { id: '3', url: resolveFlourishUrl('3'), label: 'ក្បាច់ទី៣ (Ribbon Rose)' },
                      { id: '4', url: resolveFlourishUrl('4'), label: 'ក្បាច់ទី៤ (Floral Star)' },
                      { id: '5', url: resolveFlourishUrl('5'), label: 'ក្បាច់ទី៥ (Royal Crest)' },
                    ].map((f) => {
                      const isSelected =
                        resolveFlourishUrl(currentTemplate.flourishUrl) === f.url;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => updateTemplateField('flourishUrl', f.url)}
                          className={`p-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                            isSelected
                              ? 'border-[#0071e3] bg-blue-50/60 dark:bg-blue-500/15'
                              : 'border-black/[0.06] dark:border-white/[0.1] bg-[#f5f5f7] dark:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold block truncate mb-1">
                              {f.label}
                            </span>
                            <div className="h-6 flex items-center justify-center bg-white rounded-lg p-1">
                              <img
                                src={f.url}
                                alt=""
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 size={16} className="text-[#0071e3] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'card' && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                    ចំណងជើងកាត
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.cardTitleKm}
                    onChange={(e) => updateTemplateField('cardTitleKm', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] font-moul"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                    បន្ទាត់កាលបរិច្ឆេទចេញកាត
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.issueDateLine}
                    onChange={(e) => updateTemplateField('issueDateLine', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                      តួនាទីអ្នកចុះហត្ថលេខា
                    </label>
                    <input
                      type="text"
                      value={currentTemplate.directorTitle}
                      onChange={(e) => updateTemplateField('directorTitle', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">
                      ចំណងជើងហត្ថលេខាសាមីខ្លួន
                    </label>
                    <input
                      type="text"
                      value={currentTemplate.signatureTitle}
                      onChange={(e) => updateTemplateField('signatureTitle', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={!!currentTemplate.showDirectorName}
                    onChange={(e) => updateTemplateField('showDirectorName', e.target.checked)}
                    className="w-4 h-4 accent-[#0071e3]"
                  />
                  <span>បង្ហាញឈ្មោះនាយកលើកាត ({profile.directorName})</span>
                </label>
              </div>
            )}

            {activeTab === 'watermark' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateTemplateField('backLayout', 'rules-and-emblem')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      (currentTemplate.backLayout || 'rules-and-emblem') === 'rules-and-emblem'
                        ? 'border-[#0071e3] bg-blue-50/70 dark:bg-blue-500/15 font-bold text-[#0071e3]'
                        : 'border-black/[0.06] dark:border-white/[0.1]'
                    }`}
                  >
                    <div>ឡូហ្គោ + បទបញ្ជាសាលា</div>
                    <div className="text-[10px] opacity-75 font-normal mt-0.5">
                      បទបញ្ជា ៥ ចំណុច
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateTemplateField('backLayout', 'emblem-only')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      currentTemplate.backLayout === 'emblem-only'
                        ? 'border-[#0071e3] bg-blue-50/70 dark:bg-blue-500/15 font-bold text-[#0071e3]'
                        : 'border-black/[0.06] dark:border-white/[0.1]'
                    }`}
                  >
                    <div>ឡូហ្គោក្រសួងកណ្ដាល</div>
                    <div className="text-[10px] opacity-75 font-normal mt-0.5">
                      គំរូដើមរដ្ឋផ្លូវការ
                    </div>
                  </button>
                </div>

                {(currentTemplate.backLayout || 'rules-and-emblem') !== 'emblem-only' && (
                  <>
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.05] cursor-pointer">
                      <span className="font-semibold">បង្ហាញបាកូដ / QR កូដសម្គាល់កាត</span>
                      <input
                        type="checkbox"
                        checked={currentTemplate.showBackBarcodeOrQr ?? true}
                        onChange={(e) =>
                          updateTemplateField('showBackBarcodeOrQr', e.target.checked)
                        }
                        className="w-4 h-4 accent-[#0071e3]"
                      />
                    </label>

                    <div>
                      <label className="block font-medium mb-1">
                        អត្ថបទបទបញ្ជាផ្ទៃក្រោយ (មួយបន្ទាត់មួយចំណុច)
                      </label>
                      <textarea
                        rows={5}
                        value={(
                          currentTemplate.backRulesText ?? DEFAULT_STUDENT_CARD_RULES
                        ).join('\n')}
                        onChange={(e) =>
                          updateTemplateField(
                            'backRulesText',
                            e.target.value.split('\n').filter(Boolean)
                          )
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1] text-xs"
                      />
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.05] cursor-pointer">
                    <span className="font-semibold">បង្ហាញ Watermark នៅផ្ទៃខាងមុខ</span>
                    <input
                      type="checkbox"
                      checked={currentTemplate.showWatermark}
                      onChange={(e) => updateTemplateField('showWatermark', e.target.checked)}
                      className="w-4 h-4 accent-[#0071e3]"
                    />
                  </label>

                  {currentTemplate.showWatermark && (
                    <div className="mt-3">
                      <div className="flex justify-between mb-1">
                        <span>
                          ភាពច្បាស់ Watermark ({Math.round(currentTemplate.watermarkOpacity * 100)}%)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.40"
                        step="0.01"
                        value={currentTemplate.watermarkOpacity}
                        onChange={(e) =>
                          updateTemplateField('watermarkOpacity', parseFloat(e.target.value))
                        }
                        className="w-full accent-[#0071e3]"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'dimensions' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CARD_SIZE_PRESETS.slice(0, 6).map((preset) => {
                    const isSelected =
                      currentTemplate.cardWidthMm === preset.widthMm &&
                      currentTemplate.cardHeightMm === preset.heightMm;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCardDimensions(preset.widthMm, preset.heightMm, {
                            whiteMarginMm: preset.whiteMarginMm,
                            photoWidthMm: preset.photoWidthMm,
                            photoHeightMm: preset.photoHeightMm,
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-[#0071e3] bg-blue-50/70 dark:bg-blue-500/15'
                            : 'border-black/[0.06] dark:border-white/[0.1] bg-[#f5f5f7] dark:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{preset.nameKm}</span>
                          {isSelected && <CheckCircle2 size={14} className="text-[#0071e3]" />}
                        </div>
                        <div className="text-[11px] font-semibold text-[#0071e3] mt-0.5">
                          {preset.widthMm} × {preset.heightMm} mm
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      ទទឹងរូបថត (mm)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={currentTemplate.photoBoxWidthMm || PHOTO_3X4_WIDTH_MM}
                      onChange={(e) =>
                        updateTemplateField(
                          'photoBoxWidthMm',
                          parseFloat(e.target.value) || PHOTO_3X4_WIDTH_MM
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      កម្ពស់រូបថត (mm)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={currentTemplate.photoBoxHeightMm || PHOTO_3X4_HEIGHT_MM}
                      onChange={(e) =>
                        updateTemplateField(
                          'photoBoxHeightMm',
                          parseFloat(e.target.value) || PHOTO_3X4_HEIGHT_MM
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.1]"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
                  <span className="font-medium">ពណ៌ទឹកថ្នាំផ្លូវការ</span>
                  <div className="flex items-center gap-2">
                    <AppleBadge variant="blue" size="sm">
                      {currentTemplate.cardWidthMm}×{currentTemplate.cardHeightMm} mm
                    </AppleBadge>
                    <input
                      type="color"
                      aria-label="ពណ៌ទឹកថ្នាំកាត"
                      value={currentTemplate.primaryColor}
                      onChange={(e) => updateTemplateField('primaryColor', e.target.value)}
                      className="w-9 h-9 rounded-xl cursor-pointer border border-black/10"
                    />
                  </div>
                </div>
              </div>
            )}
          </AppleCard>
        </div>
      </div>

      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => void handleConfirmReset()}
        title="ស្ដារគំរូដើមផ្លូវការ?"
        variant="primary"
        confirmLabel="ស្ដារគំរូដើម"
        message="ការកែប្រែលើគំរូបច្ចុប្បន្ននឹងត្រឡប់ទៅតាមគំរូដើមផ្លូវការរបស់ក្រសួង។"
      />
    </div>
  );
};
