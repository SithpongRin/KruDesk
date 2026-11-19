import React, { useEffect, useState } from 'react';
import { AppleModal } from '../../components/common/AppleModal';
import { AppleButton } from '../../components/common/AppleButton';
import { CLASS_COLORS, getPresetSubjects, type PresetKey } from '../../db/presets';
import { createSchoolClass, updateSchoolClass } from '../../db/classStudentRepo';
import type { SchoolClass } from '../../types/domain';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { useAppStore } from '../../store/useAppStore';

interface ClassFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAcademicYear: string;
  classToEdit?: SchoolClass | null;
  onSaved: (classId: number, isNew: boolean) => void;
}

export const ClassFormModal: React.FC<ClassFormModalProps> = ({
  isOpen,
  onClose,
  defaultAcademicYear,
  classToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState<number>(7);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [color, setColor] = useState<string>(CLASS_COLORS[0]);
  const [preset, setPreset] = useState<PresetKey>('lower-secondary');
  const [nameError, setNameError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const fmtNum = (v: number | string) => (useKhmerNumerals ? toKhmerNumerals(v) : String(v));

  useEffect(() => {
    if (!isOpen) return;
    if (classToEdit) {
      setName(classToEdit.name);
      setGradeLevel(classToEdit.gradeLevel);
      setAcademicYear(classToEdit.academicYear);
      setColor(classToEdit.color || CLASS_COLORS[0]);
    } else {
      setName('');
      setGradeLevel(7);
      setAcademicYear(defaultAcademicYear || '2026-2027');
      setColor(CLASS_COLORS[0]);
      setPreset('lower-secondary');
    }
    setNameError('');
  }, [isOpen, classToEdit, defaultAcademicYear]);

  const handleGradeChange = (grade: number) => {
    setGradeLevel(grade);
    if (!classToEdit) {
      setPreset(grade <= 9 ? 'lower-secondary' : 'upper-secondary');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('សូមបញ្ចូលឈ្មោះថ្នាក់ (ឧ. ៧ក)');
      return;
    }

    setIsSaving(true);
    try {
      if (classToEdit?.id !== undefined) {
        await updateSchoolClass(classToEdit.id, {
          name: name.trim(),
          gradeLevel,
          academicYear: academicYear.trim() || defaultAcademicYear,
          color,
        });
        onSaved(classToEdit.id, false);
      } else {
        const newId = await createSchoolClass({
          name: name.trim(),
          gradeLevel,
          academicYear: academicYear.trim() || defaultAcademicYear,
          color,
          subjects: getPresetSubjects(preset),
        });
        onSaved(newId, true);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={classToEdit ? `កែសម្រួលថ្នាក់ ${classToEdit.name}` : 'បង្កើតថ្នាក់ថ្មី'}
      subtitle="កំណត់ឈ្មោះថ្នាក់ កម្រិតថ្នាក់ ឆ្នាំសិក្សា និងគំរូមុខវិជ្ជា"
      maxWidth="md"
      footer={
        <>
          <AppleButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            បោះបង់
          </AppleButton>
          <AppleButton
            type="submit"
            form="class-form"
            variant="primary"
            size="sm"
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? 'កំពុងរក្សាទុក...' : classToEdit ? 'រក្សាទុក' : 'បង្កើតថ្នាក់'}
          </AppleButton>
        </>
      }
    >
      <form id="class-form" onSubmit={handleSubmit} className="space-y-4">
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="class-name"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
            >
              ឈ្មោះថ្នាក់ <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              id="class-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder="ឧ. ៧ក"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                nameError ? 'border-[#ff3b30]' : 'border-black/[0.08] dark:border-white/[0.1]'
              } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
            />
            {nameError && <p className="text-[11px] text-[#ff3b30] mt-1">{nameError}</p>}
          </div>

          <div>
            <label
              htmlFor="class-grade"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
            >
              កម្រិតថ្នាក់
            </label>
            <select
              id="class-grade"
              value={gradeLevel}
              onChange={(e) => handleGradeChange(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            >
              {[7, 8, 9, 10, 11, 12].map((g) => (
                <option key={g} value={g} className="dark:bg-[#1c1c1e]">
                  ថ្នាក់ទី {fmtNum(g)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="class-academic-year"
            className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
          >
            ឆ្នាំសិក្សា
          </label>
          <input
            id="class-academic-year"
            type="text"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2026-2027"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          />
        </div>

        <div>
          <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
            ពណ៌សម្គាល់ថ្នាក់
          </span>
          <div className="flex flex-wrap gap-2.5">
            {CLASS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`ជ្រើសរើសពណ៌ ${c}`}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c ? 'ring-2 ring-offset-2 ring-[#0071e3] scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {!classToEdit && (
          <div>
            <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
              គំរូមុខវិជ្ជា (Subject Preset)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPreset('lower-secondary')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  preset === 'lower-secondary'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15'
                    : 'border-black/[0.08] dark:border-white/[0.1] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  អនុវិទ្យាល័យ ៧–៩
                </div>
                <div className="text-[11px] text-[#86868b] mt-0.5">
                  តាមក្រដាសប្រឡងប្រចាំខែ (១៩ ជួរ)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPreset('upper-secondary')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  preset === 'upper-secondary'
                    ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15'
                    : 'border-black/[0.08] dark:border-white/[0.1] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  វិទ្យាល័យ ១០–១២
                </div>
                <div className="text-[11px] text-[#86868b] mt-0.5">
                  មុខវិជ្ជាមូលដ្ឋាន (១២ មុខ)
                </div>
              </button>
            </div>
          </div>
        )}
      </form>
    </AppleModal>
  );
};
