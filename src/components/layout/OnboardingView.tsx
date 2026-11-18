import React, { useRef, useState } from 'react';
import { HardDriveUpload, ArrowRight } from 'lucide-react';
import { saveProfile } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import { AppleButton } from '../common/AppleButton';
import { BackupRestoreModal } from '../common/BackupRestoreModal';
import {
  parseAndValidateBackup,
  restoreBackupPayload,
  type KruDeskBackupPayload,
  type RestoreMode,
} from '../../services/backup';
import { MOEYS_EMBLEM_DATA_URI } from '../../utils/moeysEmblemDataUri';
import { CAMBODIA_PROVINCES } from '../../lib/provinces';

export const OnboardingView: React.FC = () => {
  const { addToast, hydratePreferences } = useAppStore();

  const [teacherName, setTeacherName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [province, setProvince] = useState('');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [errors, setErrors] = useState<{
    teacherName?: string;
    schoolName?: string;
    directorName?: string;
    province?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPayload, setPendingPayload] = useState<KruDeskBackupPayload | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');

  const isFormValid =
    teacherName.trim().length > 0 &&
    schoolName.trim().length > 0 &&
    directorName.trim().length > 0 &&
    province.trim().length > 0;

  const validate = () => {
    const next: typeof errors = {};
    if (!teacherName.trim()) next.teacherName = 'សូមបញ្ចូលឈ្មោះគ្រូ';
    if (!schoolName.trim()) next.schoolName = 'សូមបញ្ចូលឈ្មោះសាលា';
    if (!directorName.trim()) next.directorName = 'សូមបញ្ចូលឈ្មោះនាយកសាលា';
    if (!province.trim()) next.province = 'សូមជ្រើសរើសខេត្ត ឬរាជធានី';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await saveProfile({
        teacherName: teacherName.trim(),
        schoolName: schoolName.trim(),
        directorName: directorName.trim(),
        province: province.trim(),
        academicYear: academicYear.trim() || '2026-2027',
      });
      addToast({
        type: 'success',
        title: 'ស្វាគមន៍មកកាន់ KruDesk!',
        message: 'ព័ត៌មានគ្រូ និងសាលាត្រូវបានរក្សាទុក។',
      });
    } catch (err) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'មិនអាចរក្សាទុកបានទេ',
        message: 'សូមព្យាយាមម្ដងទៀត។',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackupSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const validated = parseAndValidateBackup(text);
      setPendingPayload(validated);
      setPendingFileName(file.name);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'ឯកសារ Backup មិនត្រឹមត្រូវ',
        message: err instanceof Error ? err.message : 'មិនអាចអានឯកសារបានទេ',
      });
    }
  };

  const handleConfirmRestore = async (mode: RestoreMode) => {
    if (!pendingPayload) return;
    const summary = await restoreBackupPayload(pendingPayload, mode);
    await hydratePreferences();
    addToast({
      type: 'success',
      title: 'ស្ដារទិន្នន័យជោគជ័យ!',
      message: `បានស្ដារ ${summary.classesCount} ថ្នាក់ និងសិស្ស ${summary.studentsCount} នាក់។`,
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#f5f5f7] dark:bg-[#111214] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] rounded-3xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2.5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.06] p-2.5 border border-black/[0.04] dark:border-white/[0.08] flex items-center justify-center">
            <img
              src={MOEYS_EMBLEM_DATA_URI}
              alt="MoEYS Emblem"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="font-moul text-xl text-[#1d1d1f] dark:text-[#f5f5f7]">
            KruDesk — ជំនួយការគ្រូបន្ទុកថ្នាក់
          </h1>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] leading-relaxed">
            សូមបំពេញព័ត៌មានមូលដ្ឋានខាងក្រោមដើម្បីចាប់ផ្ដើម។ ទិន្នន័យទាំងអស់រក្សាទុកក្នុងម៉ាស៊ីនរបស់អ្នក (Offline ១០០%)។
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="onboarding-teacherName"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
            >
              ឈ្មោះគ្រូ <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              id="onboarding-teacherName"
              type="text"
              required
              value={teacherName}
              onChange={(e) => {
                setTeacherName(e.target.value);
                if (errors.teacherName) setErrors((p) => ({ ...p, teacherName: undefined }));
              }}
              placeholder="ឧ. លោកគ្រូ សុខ ដារ៉ា"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                errors.teacherName
                  ? 'border-[#ff3b30]'
                  : 'border-black/[0.08] dark:border-white/[0.1]'
              } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
            />
            {errors.teacherName && (
              <p className="text-[11px] text-[#ff3b30] mt-1">{errors.teacherName}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="onboarding-schoolName"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
            >
              ឈ្មោះសាលា <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              id="onboarding-schoolName"
              type="text"
              required
              value={schoolName}
              onChange={(e) => {
                setSchoolName(e.target.value);
                if (errors.schoolName) setErrors((p) => ({ ...p, schoolName: undefined }));
              }}
              placeholder="ឧ. អនុវិទ្យាល័យ ដំណាក់ព្រីង"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                errors.schoolName
                  ? 'border-[#ff3b30]'
                  : 'border-black/[0.08] dark:border-white/[0.1]'
              } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
            />
            {errors.schoolName && (
              <p className="text-[11px] text-[#ff3b30] mt-1">{errors.schoolName}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="onboarding-directorName"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
            >
              ឈ្មោះនាយក <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              id="onboarding-directorName"
              type="text"
              required
              value={directorName}
              onChange={(e) => {
                setDirectorName(e.target.value);
                if (errors.directorName) setErrors((p) => ({ ...p, directorName: undefined }));
              }}
              placeholder="ឧ. លោក ជា សារ៉ា"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                errors.directorName
                  ? 'border-[#ff3b30]'
                  : 'border-black/[0.08] dark:border-white/[0.1]'
              } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
            />
            {errors.directorName && (
              <p className="text-[11px] text-[#ff3b30] mt-1">{errors.directorName}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="onboarding-province"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ខេត្ត / រាជធានី <span className="text-[#ff3b30]">*</span>
              </label>
              <select
                id="onboarding-province"
                required
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  if (errors.province) setErrors((p) => ({ ...p, province: undefined }));
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                  errors.province
                    ? 'border-[#ff3b30]'
                    : 'border-black/[0.08] dark:border-white/[0.1]'
                } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
              >
                <option value="" className="dark:bg-[#1c1c1e]">
                  -- ជ្រើសរើសខេត្ត / រាជធានី --
                </option>
                {CAMBODIA_PROVINCES.map((prov) => (
                  <option key={prov} value={prov} className="dark:bg-[#1c1c1e]">
                    {prov}
                  </option>
                ))}
              </select>
              {errors.province && (
                <p className="text-[11px] text-[#ff3b30] mt-1">{errors.province}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="onboarding-academicYear"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ឆ្នាំសិក្សា
              </label>
              <input
                id="onboarding-academicYear"
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-2027"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <AppleButton
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={!isFormValid || isSaving}
              icon={<ArrowRight size={16} />}
            >
              {isSaving ? 'កំពុងរក្សាទុក...' : 'ចាប់ផ្ដើមប្រើប្រាស់'}
            </AppleButton>

            <AppleButton
              type="button"
              variant="secondary"
              icon={<HardDriveUpload size={16} />}
              onClick={() => fileInputRef.current?.click()}
            >
              ស្ដារពី Backup
            </AppleButton>
          </div>
        </form>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleBackupSelect}
          className="hidden"
        />
      </div>

      <BackupRestoreModal
        isOpen={pendingPayload !== null}
        onClose={() => setPendingPayload(null)}
        payload={pendingPayload}
        fileName={pendingFileName}
        onConfirmRestore={handleConfirmRestore}
        allowMerge={false}
      />
    </div>
  );
};
