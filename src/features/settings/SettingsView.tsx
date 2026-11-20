import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Save,
  Sun,
  Moon,
  Monitor,
  HardDriveDownload,
  HardDriveUpload,
  Trash2,
  AlertTriangle,
  UserCheck,
  Clock,
  CalendarOff,
  Calculator,
  Plus,
  X,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { db, clearAllAppData, saveProfile, setSetting } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  resolveScoreConfig,
  type AbsenceFailCountType,
  type AttendanceConfig,
  type AverageDecimalMode,
  type Profile,
  type ScoreConfig,
  type ThemeMode,
} from '../../types/domain';
import { CAMBODIA_PROVINCES } from '../../lib/provinces';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleSegmentedControl } from '../../components/common/AppleSegmentedControl';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { BackupRestoreModal } from '../../components/common/BackupRestoreModal';
import { AboutAppCard } from './AboutAppCard';
import { DirectorSealCard } from './DirectorSealCard';
import {
  downloadBackupJson,
  parseAndValidateBackup,
  restoreBackupPayload,
  type KruDeskBackupPayload,
  type RestoreMode,
} from '../../services/backup';
import {
  formatDateTimeKm,
  daysAgo,
  getKhmerMonthName,
  resolveAcademicMonthKey,
} from '../../lib/khmerDate';
import { formatBytes } from '../../utils/formatters';
import { toKhmerNumerals } from '../../utils/khmerNumerals';

interface SettingsViewProps {
  profile: Profile;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ profile }) => {
  const {
    theme,
    setTheme,
    useKhmerNumerals,
    setUseKhmerNumerals,
    addToast,
    hydratePreferences,
    setSelectedClassId,
  } = useAppStore();

  const [teacherName, setTeacherName] = useState(profile.teacherName);
  const [schoolName, setSchoolName] = useState(profile.schoolName);
  const [directorName, setDirectorName] = useState(profile.directorName);
  const [province, setProvince] = useState(profile.province || '');
  const [academicYear, setAcademicYear] = useState(profile.academicYear);
  const [profileErrors, setProfileErrors] = useState<{
    teacherName?: string;
    schoolName?: string;
    directorName?: string;
    province?: string;
  }>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      navigator.storage
        .persisted()
        .then((res) => setStoragePersisted(res))
        .catch(() => setStoragePersisted(false));
    } else {
      setStoragePersisted(false);
    }
  }, []);

  const handleRequestPersist = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      try {
        const granted = await navigator.storage.persist();
        setStoragePersisted(granted);
        addToast({
          type: granted ? 'success' : 'info',
          title: granted
            ? 'ទទួលបានការការពារទិន្នន័យអចិន្ត្រៃយ៍'
            : 'កម្មវិធីរុករកមិនទាន់អនុញ្ញាតការពារអចិន្ត្រៃយ៍ទេ',
        });
      } catch {
        setStoragePersisted(false);
      }
    }
  };

  const [isBackingUp, setIsBackingUp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPayload, setPendingPayload] = useState<KruDeskBackupPayload | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');

  // Double confirm for wiping all data
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);
  const [isWiping, setIsWiping] = useState(false);

  const lastBackupRow = useLiveQuery(() => db.settings.get('lastBackupAt'), []);
  const lastBackupAt =
    typeof lastBackupRow?.value === 'number' ? lastBackupRow.value : undefined;

  // Attendance settings (rest weekdays + holidays)
  const attendanceCfgRow = useLiveQuery(() => db.settings.get('attendanceConfig'), []);
  const attendanceConfig: AttendanceConfig =
    (attendanceCfgRow?.value as AttendanceConfig) ?? DEFAULT_ATTENDANCE_CONFIG;
  const holidays = useLiveQuery(async () => {
    const list = await db.holidays.toArray();
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, []);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayLabel, setNewHolidayLabel] = useState('');

  const WEEKDAY_LABELS = [
    { day: 0, label: 'អាទិត្យ' },
    { day: 1, label: 'ចន្ទ' },
    { day: 2, label: 'អង្គារ' },
    { day: 3, label: 'ពុធ' },
    { day: 4, label: 'ព្រហស្បតិ៍' },
    { day: 5, label: 'សុក្រ' },
    { day: 6, label: 'សៅរ៍' },
  ];

  // Score settings (scale, blank-as-zero, semester months, weights)
  const scoreCfgRow = useLiveQuery(() => db.settings.get('scoreConfig'), []);
  const scoreConfig: ScoreConfig = resolveScoreConfig(scoreCfgRow?.value as Partial<ScoreConfig> | undefined);

  const ACADEMIC_MONTH_ORDER = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const updateScoreConfig = async (patch: Partial<ScoreConfig>) => {
    await setSetting<ScoreConfig>('scoreConfig', {
      ...scoreConfig,
      ...patch,
    });
  };

  const toggleSemesterMonth = async (sem: 'sem1Months' | 'sem2Months', monthNum: number) => {
    const current = new Set(scoreConfig[sem]);
    if (current.has(monthNum)) {
      current.delete(monthNum);
    } else {
      current.add(monthNum);
    }
    const ordered = ACADEMIC_MONTH_ORDER.filter((m) => current.has(m));
    await updateScoreConfig({ [sem]: ordered } as Partial<ScoreConfig>);
  };

  const handleToggleRestWeekday = async (weekday: number) => {
    const current = new Set(attendanceConfig.restWeekdays);
    if (current.has(weekday)) current.delete(weekday);
    else current.add(weekday);
    await setSetting<AttendanceConfig>('attendanceConfig', {
      restWeekdays: Array.from(current).sort((a, b) => a - b),
    });
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayLabel.trim()) return;
    try {
      const existing = await db.holidays.where('date').equals(newHolidayDate).first();
      if (existing?.id !== undefined) {
        await db.holidays.update(existing.id, { label: newHolidayLabel.trim() });
      } else {
        await db.holidays.add({ date: newHolidayDate, label: newHolidayLabel.trim() });
      }
      setNewHolidayDate('');
      setNewHolidayLabel('');
      addToast({ type: 'success', title: 'បានបន្ថែមថ្ងៃឈប់សម្រាក' });
    } catch {
      addToast({ type: 'error', title: 'មិនអាចបន្ថែមថ្ងៃឈប់សម្រាកបានទេ' });
    }
  };

  useEffect(() => {
    setTeacherName(profile.teacherName);
    setSchoolName(profile.schoolName);
    setDirectorName(profile.directorName);
    setProvince(profile.province || '');
    setAcademicYear(profile.academicYear);
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof profileErrors = {};
    if (!teacherName.trim()) errs.teacherName = 'សូមបញ្ចូលឈ្មោះគ្រូ';
    if (!schoolName.trim()) errs.schoolName = 'សូមបញ្ចូលឈ្មោះសាលា';
    if (!directorName.trim()) errs.directorName = 'សូមបញ្ចូលឈ្មោះនាយកសាលា';
    if (!province.trim()) errs.province = 'សូមជ្រើសរើសខេត្ត ឬរាជធានី';
    setProfileErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsSavingProfile(true);
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
        title: 'បានរក្សាទុកព័ត៌មាន',
        message: 'ព័ត៌មានគ្រូ និងសាលាត្រូវបានកែប្រែជោគជ័យ។',
      });
    } catch (err) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'មិនអាចរក្សាទុកបានទេ',
        message: 'សូមព្យាយាមម្ដងទៀត។',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleBackupDownload = async () => {
    setIsBackingUp(true);
    try {
      const { fileName, sizeBytes } = await downloadBackupJson();
      addToast({
        type: 'success',
        title: 'បម្រុងទុកជោគជ័យ!',
        message: `បានទាញយក ${fileName} (${formatBytes(sizeBytes)})`,
      });
    } catch (err) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'បរាជ័យក្នុងការបង្កើត Backup',
        message: err instanceof Error ? err.message : 'មានបញ្ហាកើតឡើង',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const raw = await file.text();
      const validated = parseAndValidateBackup(raw);
      setPendingPayload(validated);
      setPendingFileName(file.name);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'ឯកសារ Backup មិនត្រឹមត្រូវ',
        message: err instanceof Error ? err.message : 'មិនអាចអានឯកសារ JSON បានទេ',
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

  const handleConfirmWipe = async () => {
    if (wipeStep === 1) {
      setWipeStep(2);
      return;
    }
    if (wipeStep === 2) {
      setIsWiping(true);
      try {
        await clearAllAppData();
        setSelectedClassId(null);
        setWipeStep(0);
        addToast({
          type: 'info',
          title: 'បានលុបទិន្នន័យទាំងអស់',
          message: 'ប្រព័ន្ធត្រូវបានសម្អាតទាំងស្រុង។',
        });
      } catch (err) {
        console.error(err);
        addToast({
          type: 'error',
          title: 'មិនអាចលុបទិន្នន័យបានទេ',
        });
      } finally {
        setIsWiping(false);
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
          ការកំណត់
        </h1>
        <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
          គ្រប់គ្រងព័ត៌មានគ្រូ និងសាលា រូបរាងបង្ហាញ និងការបម្រុងទុកទិន្នន័យ
        </p>
      </div>

      {/* Section 1: ព័ត៌មានគ្រូ និងសាលា */}
      <AppleCard
        title={
          <span className="flex items-center gap-2">
            <UserCheck size={17} className="text-[#0071e3]" />
            <span>ព័ត៌មានគ្រូ និងសាលា</span>
          </span>
        }
        subtitle="ប្រើដោយស្វ័យប្រវត្តិលើក្បាលក្រដាស ហត្ថលេខា និងកាតសិស្ស"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="settings-teacherName"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ឈ្មោះគ្រូ <span className="text-[#ff3b30]">*</span>
              </label>
              <input
                id="settings-teacherName"
                type="text"
                value={teacherName}
                onChange={(e) => {
                  setTeacherName(e.target.value);
                  if (profileErrors.teacherName) {
                    setProfileErrors((p) => ({ ...p, teacherName: undefined }));
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                  profileErrors.teacherName
                    ? 'border-[#ff3b30]'
                    : 'border-black/[0.08] dark:border-white/[0.1]'
                } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
              />
              {profileErrors.teacherName && (
                <p className="text-[11px] text-[#ff3b30] mt-1">{profileErrors.teacherName}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="settings-schoolName"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ឈ្មោះសាលា <span className="text-[#ff3b30]">*</span>
              </label>
              <input
                id="settings-schoolName"
                type="text"
                value={schoolName}
                onChange={(e) => {
                  setSchoolName(e.target.value);
                  if (profileErrors.schoolName) {
                    setProfileErrors((p) => ({ ...p, schoolName: undefined }));
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                  profileErrors.schoolName
                    ? 'border-[#ff3b30]'
                    : 'border-black/[0.08] dark:border-white/[0.1]'
                } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
              />
              {profileErrors.schoolName && (
                <p className="text-[11px] text-[#ff3b30] mt-1">{profileErrors.schoolName}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="settings-directorName"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ឈ្មោះនាយក <span className="text-[#ff3b30]">*</span>
              </label>
              <input
                id="settings-directorName"
                type="text"
                value={directorName}
                onChange={(e) => {
                  setDirectorName(e.target.value);
                  if (profileErrors.directorName) {
                    setProfileErrors((p) => ({ ...p, directorName: undefined }));
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                  profileErrors.directorName
                    ? 'border-[#ff3b30]'
                    : 'border-black/[0.08] dark:border-white/[0.1]'
                } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
              />
              {profileErrors.directorName && (
                <p className="text-[11px] text-[#ff3b30] mt-1">{profileErrors.directorName}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="settings-province"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ខេត្ត / រាជធានី <span className="text-[#ff3b30]">*</span>
              </label>
              <select
                id="settings-province"
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  if (profileErrors.province) {
                    setProfileErrors((p) => ({ ...p, province: undefined }));
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                  profileErrors.province
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
              {profileErrors.province && (
                <p className="text-[11px] text-[#ff3b30] mt-1">{profileErrors.province}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="settings-academicYear"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1.5"
              >
                ឆ្នាំសិក្សា
              </label>
              <input
                id="settings-academicYear"
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-2027"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <AppleButton
              type="submit"
              variant="primary"
              size="sm"
              icon={<Save size={15} />}
              disabled={isSavingProfile}
            >
              {isSavingProfile ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកព័ត៌មាន'}
            </AppleButton>
          </div>
        </form>
      </AppleCard>

      <DirectorSealCard />

      {/* Section 2: បង្ហាញ (Theme & Khmer Numerals) */}
      <AppleCard title="បង្ហាញ" subtitle="កំណត់រូបរាងអេក្រង់ និងទម្រង់លេខ">
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                ផ្ទៃអេក្រង់ (Theme)
              </div>
              <div className="text-xs text-[#86868b] dark:text-[#98989d]">
                ជ្រើសរើសផ្ទៃភ្លឺ ងងឹត ឬតាមការកំណត់របស់ម៉ាស៊ីន
              </div>
            </div>

            <AppleSegmentedControl<ThemeMode>
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'ភ្លឺ', icon: <Sun size={13} /> },
                { value: 'dark', label: 'ងងឹត', icon: <Moon size={13} /> },
                { value: 'system', label: 'ប្រព័ន្ធ', icon: <Monitor size={13} /> },
              ]}
            />
          </div>

          <div className="pt-4 border-t border-black/[0.04] dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                ប្រើលេខខ្មែរ (០១២៣...)
              </div>
              <div className="text-xs text-[#86868b] dark:text-[#98989d]">
                បើកដើម្បីបង្ហាញជាលេខខ្មែរជំនួសលេខអារ៉ាប់ (លំនាំដើមប្រើលេខអារ៉ាប់ 0123...)
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={useKhmerNumerals}
              onClick={() => setUseKhmerNumerals(!useKhmerNumerals)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                useKhmerNumerals ? 'bg-[#34c759]' : 'bg-[#d1d1d6] dark:bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ${
                  useKhmerNumerals ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </AppleCard>

      {/* Section 2b: វត្តមាន (Rest weekdays & Holidays) */}
      <AppleCard
        title={
          <span className="flex items-center gap-2">
            <CalendarOff size={17} className="text-[#0071e3]" />
            <span>វត្តមាន (ថ្ងៃឈប់ប្រចាំសប្ដាហ៍ និងថ្ងៃបុណ្យ)</span>
          </span>
        }
        subtitle="ថ្ងៃឈប់សម្រាកនឹងមានពណ៌ប្រផេះ មិនរាប់ជាអវត្តមានឡើយ"
      >
        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
              ថ្ងៃឈប់ប្រចាំសប្ដាហ៍
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((w) => {
                const active = attendanceConfig.restWeekdays.includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => handleToggleRestWeekday(w.day)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-[#0071e3] text-white border-[#0071e3]'
                        : 'bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border-black/[0.06] dark:border-white/[0.1]'
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-black/[0.04] dark:border-white/[0.06] space-y-3">
            <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              ថ្ងៃបុណ្យ / ថ្ងៃឈប់សម្រាកពិសេស
            </div>

            <form onSubmit={handleAddHoliday} className="flex flex-wrap gap-2">
              <input
                type="date"
                aria-label="កាលបរិច្ឆេទថ្ងៃបុណ្យ"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
              <input
                type="text"
                aria-label="ឈ្មោះថ្ងៃបុណ្យ"
                value={newHolidayLabel}
                onChange={(e) => setNewHolidayLabel(e.target.value)}
                placeholder="ឧ. បុណ្យឯករាជ្យជាតិ"
                className="flex-1 min-w-[160px] px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
              <AppleButton
                type="submit"
                variant="secondary"
                size="sm"
                icon={<Plus size={14} />}
                disabled={!newHolidayDate || !newHolidayLabel.trim()}
              >
                បន្ថែម
              </AppleButton>
            </form>

            {holidays && holidays.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {holidays.map((h) => (
                  <span
                    key={h.id ?? h.date}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f5f5f7] dark:bg-white/[0.08] text-xs text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.05] dark:border-white/[0.1]"
                  >
                    <span className="font-mono text-[11px] text-[#0071e3]">{h.date}</span>
                    <span>{h.label}</span>
                    <button
                      type="button"
                      aria-label={`លុប ${h.label}`}
                      onClick={() => h.id !== undefined && db.holidays.delete(h.id)}
                      className="text-[#86868b] hover:text-[#ff3b30]"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#86868b]">មិនទាន់មានថ្ងៃបុណ្យបានកំណត់នៅឡើយទេ។</p>
            )}
          </div>
        </div>
      </AppleCard>

      {/* Section 2c: ពិន្ទុ និងការគណនាឆមាស */}
      <AppleCard
        title={
          <span className="flex items-center gap-2">
            <Calculator size={17} className="text-[#0071e3]" />
            <span>ពិន្ទុ (ការគណនា និងឆមាស)</span>
          </span>
        }
        subtitle="កំណត់មាត្រដ្ឋានមធ្យមភាគ ទម្ងន់ពិន្ទុ និងខែសិក្សាសម្រាប់ឆមាសទី 1 និងទី 2"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
                មាត្រដ្ឋានមធ្យមភាគ (Scale)
              </span>
              <AppleSegmentedControl
                value={String(scoreConfig.scale)}
                onChange={(val) =>
                  updateScoreConfig({ scale: Number(val) as 10 | 20 | 50 | 100 })
                }
                options={[
                  { value: '10', label: '/10' },
                  { value: '20', label: '/20' },
                  { value: '50', label: '/50' },
                  { value: '100', label: '/100' },
                ]}
              />
            </div>

            <div className="flex items-center justify-between gap-4 sm:pt-5">
              <div>
                <div className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                  រាប់ពិន្ទុទទេជា 0
                </div>
                <div className="text-xs text-[#86868b] dark:text-[#98989d]">
                  បើបិទ មុខវិជ្ជាទទេមិនត្រូវបានរាប់ចូលមធ្យមភាគទេ
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={scoreConfig.countBlankAsZero}
                aria-label="រាប់ពិន្ទុទទេជា 0"
                onClick={() =>
                  updateScoreConfig({ countBlankAsZero: !scoreConfig.countBlankAsZero })
                }
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  scoreConfig.countBlankAsZero ? 'bg-[#0071e3]' : 'bg-[#d1d1d6] dark:bg-white/20'
                }`}
              >
                {/* knob slides right when on (translate-x-5.5 does not exist in Tailwind, so it never moved) */}
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ${
                    scoreConfig.countBlankAsZero ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label
                htmlFor="score-decimal-mode"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]"
              >
                ខ្ទង់ទសភាគមធ្យមភាគ
              </label>
              <span className="text-xs text-[#86868b] dark:text-[#98989d]">
                កំណត់របៀបបង្ហាញ ២ ខ្ទង់ក្រោយក្បៀស (ការរៀបចំណាត់ថ្នាក់ប្រើតម្លៃពេញ)
              </span>
            </div>
            <select
              id="score-decimal-mode"
              value={scoreConfig.averageDecimalMode ?? 'truncate'}
              onChange={(e) =>
                updateScoreConfig({ averageDecimalMode: e.target.value as AverageDecimalMode })
              }
              className="px-3 py-2 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            >
              <option value="truncate" className="dark:bg-[#1c1c1e]">
                កាត់ចោល (ដូចឯកសារសាលា)
              </option>
              <option value="round" className="dark:bg-[#1c1c1e]">
                បង្គត់
              </option>
            </select>
          </div>

          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="score-absence-fail-limit"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
              >
                ចំនួនអវត្តមានអតិបរមាក្នុងមួយឆ្នាំ
              </label>
              <input
                id="score-absence-fail-limit"
                type="number"
                min={0}
                value={scoreConfig.absenceFailLimit ?? 30}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const val = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
                  updateScoreConfig({ absenceFailLimit: val });
                }}
                className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              />
              <span className="block text-[11px] text-[#86868b] mt-1">
                កំណត់ ០ ឬទទេ ដើម្បីបិទលក្ខខណ្ឌធ្លាក់ដោយសារអវត្តមាន
              </span>
            </div>

            <div>
              <label
                htmlFor="score-absence-fail-type"
                className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
              >
                របៀបរាប់អវត្តមានប្រចាំឆ្នាំ
              </label>
              <select
                id="score-absence-fail-type"
                value={scoreConfig.absenceFailCountType ?? 'unexcused'}
                onChange={(e) =>
                  updateScoreConfig({
                    absenceFailCountType: e.target.value as AbsenceFailCountType,
                  })
                }
                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
              >
                <option value="unexcused" className="dark:bg-[#1c1c1e]">
                  រាប់តែអវត្តមានអត់ច្បាប់
                </option>
                <option value="all" className="dark:bg-[#1c1c1e]">
                  រាប់អវត្តមានទាំងអស់ (ច្ប + អ.ច្ប)
                </option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
            <span className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">
              មេគុណទម្ងន់មធ្យមភាគ
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'score-w-monthly', key: 'wMonthly' as const, label: 'មធ្យមខែ (ឆមាស)' },
                { id: 'score-w-exam', key: 'wExam' as const, label: 'ប្រឡងឆមាស' },
                { id: 'score-w-sem1', key: 'wSem1' as const, label: 'ឆមាសទី 1 (ឆ្នាំ)' },
                { id: 'score-w-sem2', key: 'wSem2' as const, label: 'ឆមាសទី 2 (ឆ្នាំ)' },
              ].map((item) => (
                <div key={item.key}>
                  <label
                    htmlFor={item.id}
                    className="block text-[11px] font-medium text-[#86868b] mb-1"
                  >
                    {item.label}
                  </label>
                  <input
                    id={item.id}
                    type="number"
                    min={0}
                    step={0.5}
                    value={scoreConfig[item.key]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0) {
                        updateScoreConfig({ [item.key]: v });
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  ខែសម្រាប់ឆមាសទី 1
                </span>
                <span className="text-[11px] text-[#86868b]">
                  {scoreConfig.sem1Months
                    .map((m) => resolveAcademicMonthKey(academicYear, m))
                    .join(', ') || 'មិនទាន់ជ្រើស'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACADEMIC_MONTH_ORDER.map((m) => {
                  const active = scoreConfig.sem1Months.includes(m);
                  return (
                    <button
                      key={`s1-${m}`}
                      type="button"
                      onClick={() => toggleSemesterMonth('sem1Months', m)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-colors ${
                        active
                          ? 'border-[#0071e3] bg-[#e8f2ff] dark:bg-blue-500/20 text-[#0071e3] dark:text-blue-300'
                          : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7]'
                      }`}
                    >
                      {getKhmerMonthName(m)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  ខែសម្រាប់ឆមាសទី 2
                </span>
                <span className="text-[11px] text-[#86868b]">
                  {scoreConfig.sem2Months
                    .map((m) => resolveAcademicMonthKey(academicYear, m))
                    .join(', ') || 'មិនទាន់ជ្រើស'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ACADEMIC_MONTH_ORDER.map((m) => {
                  const active = scoreConfig.sem2Months.includes(m);
                  return (
                    <button
                      key={`s2-${m}`}
                      type="button"
                      onClick={() => toggleSemesterMonth('sem2Months', m)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-colors ${
                        active
                          ? 'border-[#0071e3] bg-[#e8f2ff] dark:bg-blue-500/20 text-[#0071e3] dark:text-blue-300'
                          : 'border-black/[0.08] dark:border-white/[0.1] text-[#1d1d1f] dark:text-[#f5f5f7]'
                      }`}
                    >
                      {getKhmerMonthName(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </AppleCard>

      {/* Section 3: Backup & Restore */}
      <AppleCard
        title="Backup & Restore"
        subtitle="ទាញយកទិន្នន័យទាំងអស់ជាឯកសារ .json (រួមទាំងរូបថត) ឬស្ដារមកវិញ"
        headerAction={
          lastBackupAt ? (
            <AppleBadge variant="green" size="sm">
              <Clock size={12} />
              <span>
                {daysAgo(lastBackupAt) === 0
                  ? 'ថ្ងៃនេះ'
                  : `${useKhmerNumerals ? toKhmerNumerals(daysAgo(lastBackupAt)) : daysAgo(lastBackupAt)} ថ្ងៃមុន`}
              </span>
            </AppleBadge>
          ) : (
            <AppleBadge variant="orange" size="sm">
              មិនទាន់ Backup
            </AppleBadge>
          )
        }
      >
        <div className="space-y-4">
          {lastBackupAt && (
            <div className="text-xs text-[#86868b] dark:text-[#98989d]">
              បម្រុងទុកចុងក្រោយ៖{' '}
              <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                {formatDateTimeKm(lastBackupAt)}
              </span>
            </div>
          )}

          {/* Storage persistence status */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              storagePersisted
                ? 'bg-[#edf9f0] dark:bg-emerald-500/10 border-[#c8eed0] dark:border-emerald-500/20 text-[#1d1d1f] dark:text-emerald-100'
                : 'bg-orange-50/80 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/25 text-[#1d1d1f] dark:text-orange-100'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {storagePersisted ? (
                <ShieldCheck size={18} className="text-[#34c759] shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert size={18} className="text-[#ff9500] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">
                  {storagePersisted
                    ? 'ការផ្ទុកទិន្នន័យអចិន្ត្រៃយ៍ត្រូវបានអនុញ្ញាត (Storage Persisted)'
                    : 'ការផ្ទុកទិន្នន័យមិនទាន់ការពារជាអចិន្ត្រៃយ៍នៅឡើយទេ'}
                </div>
                <p className="text-[11px] text-[#6e6e73] dark:text-[#d1d1d6] mt-0.5 leading-relaxed">
                  {storagePersisted
                    ? 'កម្មវិធីរុករកការពារ IndexedDB មិនឱ្យលុបដោយស្វ័យប្រវត្តិទេ ប៉ុន្តែគួរទាញយក Backup ទុកជាប្រចាំដើម្បីសុវត្ថិភាពខ្ពស់បំផុត។'
                    : 'កម្មវិធីរុករកអាចសម្អាតទិន្នន័យ IndexedDB ដោយស្វ័យប្រវត្តិ ប្រសិនបើម៉ាស៊ីនអស់ទំហំផ្ទុក ឬមិនបើកប្រើរយៈពេលយូរ។ ដូច្នេះសូមទាញយកឯកសារ Backup ជាប្រចាំ!'}
                </p>
              </div>
            </div>
            {!storagePersisted && (
              <AppleButton
                variant="secondary"
                size="sm"
                onClick={handleRequestPersist}
                className="shrink-0"
              >
                ស្នើសុំការពារទិន្នន័យ
              </AppleButton>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AppleButton
              variant="primary"
              icon={<HardDriveDownload size={16} />}
              onClick={handleBackupDownload}
              disabled={isBackingUp}
            >
              {isBackingUp ? 'កំពុងបង្កើត Backup...' : 'ទាញយក Backup (.json)'}
            </AppleButton>

            <AppleButton
              variant="secondary"
              icon={<HardDriveUpload size={16} />}
              onClick={() => fileInputRef.current?.click()}
            >
              ស្ដារពី Backup (.json)
            </AppleButton>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreFileChange}
            className="hidden"
          />
        </div>
      </AppleCard>

      {/* Section 4: About / app updates */}
      <AboutAppCard />

      {/* Section 5: Danger Zone */}
      <div className="p-6 rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 flex items-center gap-2">
            <AlertTriangle size={16} className="text-[#ff3b30]" />
            <span>លុបទិន្នន័យទាំងអស់</span>
          </h4>
          <p className="text-xs text-red-700 dark:text-red-300/80 mt-1">
            សម្អាតទិន្នន័យថ្នាក់ សិស្ស វត្តមាន ពិន្ទុ និងការកំណត់ទាំងអស់ចេញពីកម្មវិធីរុករក។ សូមទាញយក Backup ជាមុន!
          </p>
        </div>

        <AppleButton
          variant="danger"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={() => setWipeStep(1)}
        >
          លុបទិន្នន័យទាំងអស់
        </AppleButton>
      </div>

      {/* Restore Preview Modal */}
      <BackupRestoreModal
        isOpen={pendingPayload !== null}
        onClose={() => setPendingPayload(null)}
        payload={pendingPayload}
        fileName={pendingFileName}
        onConfirmRestore={handleConfirmRestore}
        allowMerge={true}
      />

      {/* Double Confirm Dialog for Wipe */}
      <ConfirmDialog
        isOpen={wipeStep === 1}
        onClose={() => setWipeStep(0)}
        onConfirm={handleConfirmWipe}
        title="លុបទិន្នន័យទាំងអស់ (ជំហានទី ១/២)"
        message="តើអ្នកពិតជាចង់លុបទិន្នន័យទាំងអស់ក្នុង KruDesk មែនទេ? ទិន្នន័យដែលគ្មាន Backup មិនអាចទាញយកមកវិញបានទេ។"
        confirmLabel="បន្តទៅការបញ្ជាក់ចុងក្រោយ"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={wipeStep === 2}
        onClose={() => setWipeStep(0)}
        onConfirm={handleConfirmWipe}
        title="បញ្ជាក់ចុងក្រោយ (ជំហានទី ២/២)"
        message="សកម្មភាពនេះនឹងលុបថ្នាក់រៀន សិស្ស វត្តមាន ពិន្ទុ និងព័ត៌មានសាលាទាំងស្រុងភ្លាមៗ។ ចុច «លុបទាំងអស់» ដើម្បីបញ្ជាក់។"
        confirmLabel={isWiping ? 'កំពុងលុប...' : 'លុបទាំងអស់'}
        variant="danger"
        isLoading={isWiping}
      />
    </div>
  );
};
