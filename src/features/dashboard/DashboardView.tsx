import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  GraduationCap,
  HardDriveDownload,
  Users,
} from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  type AttendanceConfig,
  type Profile,
} from '../../types/domain';
import {
  buildAttendanceLookup,
  buildTakenDatesSet,
  computeStudentMonthlyAttendance,
  getActiveStudentsOrdered,
  getMonthDayInfos,
} from '../../lib/attendance';
import {
  daysAgo,
  formatDateTimeKm,
  formatKhmerMonthYear,
  parseYearMonth,
  toLocalDateKey,
} from '../../lib/khmerDate';
import { formatMinistryDepartment } from '../../lib/provinces';
import { downloadBackupJson } from '../../services/backup';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { EmptyState } from '../../components/common/EmptyState';

interface DashboardViewProps {
  profile: Profile;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    setSelectedClassId,
    selectedMonth,
    useKhmerNumerals,
    setActiveView,
    requestOpenCreateClass,
    requestOpenRollCall,
    addToast,
  } = useAppStore();

  const fmtNum = (val: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const todayKey = toLocalDateKey();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [isRequestingPersist, setIsRequestingPersist] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      navigator.storage
        .persisted()
        .then((val) => setStoragePersisted(val))
        .catch(() => setStoragePersisted(false));
    }
  }, []);

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const allStudents = useLiveQuery(() => db.students.toArray(), []);

  const currentClass = useMemo(() => {
    if (!classes || classes.length === 0) return undefined;
    return classes.find((c) => c.id === selectedClassId) ?? classes[0];
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (classes && classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      if (classes[0].id !== undefined) setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId, setSelectedClassId]);

  const lastBackupRow = useLiveQuery(() => db.settings.get('lastBackupAt'), []);
  const lastBackupAt =
    typeof lastBackupRow?.value === 'number' ? lastBackupRow.value : undefined;
  const backupAgeDays = lastBackupAt !== undefined ? daysAgo(lastBackupAt) : null;
  const isBackupOverdue = backupAgeDays === null || backupAgeDays >= 7;

  const attendanceCfgRow = useLiveQuery(() => db.settings.get('attendanceConfig'), []);
  const attendanceConfig: AttendanceConfig =
    (attendanceCfgRow?.value as AttendanceConfig) ?? DEFAULT_ATTENDANCE_CONFIG;
  const holidays = useLiveQuery(() => db.holidays.toArray(), []);
  const holidayMap = useMemo(
    () => new Map((holidays ?? []).map((h) => [h.date, h.label])),
    [holidays]
  );
  const holidayDates = useMemo(() => new Set(holidayMap.keys()), [holidayMap]);

  const classMonthAttendance = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    return db.attendance
      .where('[classId+date]')
      .between([currentClass.id, `${selectedMonth}-01`], [currentClass.id, `${selectedMonth}-31`], true, true)
      .toArray();
  }, [currentClass?.id, selectedMonth]);

  const todayAttendance = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    return db.attendance
      .where('[classId+date]')
      .equals([currentClass.id, todayKey])
      .toArray();
  }, [currentClass?.id, todayKey]);

  const todaySession = useLiveQuery(async () => {
    if (!currentClass?.id) return undefined;
    return db.attendanceSessions.get([currentClass.id, todayKey]);
  }, [currentClass?.id, todayKey]);

  const classMonthSessions = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    return db.attendanceSessions
      .where('[classId+date]')
      .between([currentClass.id, `${selectedMonth}-01`], [currentClass.id, `${selectedMonth}-31`], true, true)
      .toArray();
  }, [currentClass?.id, selectedMonth]);

  // Aggregate student statistics across all classes & selected class
  const activeAllStudents = useMemo(
    () => (allStudents ?? []).filter((s) => s.status === 'active'),
    [allStudents]
  );
  const totalMale = activeAllStudents.filter((s) => s.gender === 'ប្រុស').length;
  const totalFemale = activeAllStudents.filter((s) => s.gender === 'ស្រី').length;

  const classStudents = useMemo(
    () => (allStudents ?? []).filter((s) => s.classId === currentClass?.id),
    [allStudents, currentClass?.id]
  );
  const activeClassStudentsToday = useMemo(
    () => getActiveStudentsOrdered(classStudents),
    [classStudents]
  );
  const activeClassStudentsMonth = useMemo(
    () => getActiveStudentsOrdered(classStudents, selectedMonth),
    [classStudents, selectedMonth]
  );

  // Today's absences list for the selected class (only valid when today's session is taken)
  const todayAbsences = useMemo(() => {
    if (!todaySession) return [];
    const byId = new Map(activeClassStudentsToday.map((s) => [s.id, s]));
    return (todayAttendance ?? [])
      .map((row) => ({
        student: byId.get(row.studentRef),
        status: row.status,
      }))
      .filter((item): item is { student: NonNullable<typeof item.student>; status: typeof item.status } => Boolean(item.student));
  }, [todaySession, activeClassStudentsToday, todayAttendance]);

  // Top 3 absentees this month (selected class, selectedMonth) counting ONLY taken days
  const topAbsentees = useMemo(() => {
    if (!classMonthAttendance || activeClassStudentsMonth.length === 0) return [];
    const { year, month } = parseYearMonth(selectedMonth);
    const takenDates = buildTakenDatesSet(classMonthSessions ?? []);
    const dayInfos = getMonthDayInfos(year, month, {
      restWeekdays: attendanceConfig.restWeekdays,
      holidayDates,
      todayKey,
      takenDates,
    });
    const lookup = buildAttendanceLookup(classMonthAttendance);

    return activeClassStudentsMonth
      .map((student) => {
        const summary =
          student.id !== undefined
            ? computeStudentMonthlyAttendance(student.id, lookup, dayInfos)
            : { excused: 0, unexcused: 0, total: 0, sickCount: 0, present: 0, takenDaysCount: 0 };
        return { student, summary };
      })
      .filter((x) => x.summary.total > 0)
      .sort(
        (a, b) =>
          b.summary.total - a.summary.total ||
          b.summary.unexcused - a.summary.unexcused ||
          a.student.order - b.student.order
      )
      .slice(0, 3);
  }, [
    classMonthAttendance,
    classMonthSessions,
    activeClassStudentsMonth,
    selectedMonth,
    attendanceConfig.restWeekdays,
    holidayDates,
    todayKey,
  ]);

  const handleQuickBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await downloadBackupJson();
      addToast({
        type: 'success',
        title: 'ទាញយក Backup ជោគជ័យ!',
        message: `${result.fileName} (${fmtNum(result.summary.studentsCount)} សិស្ស)`,
      });
    } catch {
      addToast({ type: 'error', title: 'មិនអាចបង្កើត Backup បានទេ' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRequestPersist = async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    setIsRequestingPersist(true);
    try {
      const granted = await navigator.storage.persist();
      setStoragePersisted(granted);
      addToast({
        type: granted ? 'success' : 'info',
        title: granted
          ? 'បានអនុញ្ញាតការរក្សាទុកអចិន្ត្រៃយ៍ហើយ!'
          : 'Browser មិនទាន់អនុញ្ញាតនៅឡើយទេ',
        message: granted
          ? 'ទិន្នន័យត្រូវបានការពារពីការលុបដោយស្វ័យប្រវត្តិ។'
          : 'សូមដំឡើងកម្មវិធី (Chrome → Install KruDesk) ដើម្បីរក្សាទុកទិន្នន័យឱ្យមានសុវត្ថិភាព។',
      });
    } finally {
      setIsRequestingPersist(false);
    }
  };

  const ministrySubtitle = formatMinistryDepartment(profile.province);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Welcome */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
            សួស្ដី, {profile.teacherName}
          </h1>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            {profile.schoolName}
            {ministrySubtitle ? ` • ${ministrySubtitle}` : ''} • ឆ្នាំសិក្សា{' '}
            {fmtNum(profile.academicYear)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AppleButton
            variant="secondary"
            size="sm"
            icon={<Users size={15} />}
            onClick={() => setActiveView('students')}
          >
            សិស្ស និងថ្នាក់
          </AppleButton>
          <AppleButton
            variant="secondary"
            size="sm"
            icon={<CalendarCheck size={15} />}
            onClick={() => setActiveView('attendance')}
          >
            វត្តមានថ្ងៃនេះ
          </AppleButton>
          <AppleButton
            variant="secondary"
            size="sm"
            icon={<ClipboardList size={15} />}
            onClick={() => setActiveView('scores')}
          >
            បញ្ជីពិន្ទុ
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            icon={<CreditCard size={15} />}
            onClick={() => setActiveView('cards')}
          >
            កាតសិស្ស
          </AppleButton>
        </div>
      </div>

      {/* Backup Reminder Banner Card (turns orange after 7 days without backup or never backed up) */}
      <div
        data-testid="backup-reminder-card"
        className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
          isBackupOverdue
            ? 'bg-orange-50 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/40'
            : 'bg-white dark:bg-[#1c1c1e] border-black/[0.06] dark:border-white/[0.08]'
        }`}
      >
        <div className="flex items-start gap-3">
          {isBackupOverdue ? (
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-[#ff9500] flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-[#34c759] flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {backupAgeDays === null
                  ? 'អ្នកមិនទាន់បាន Backup ទិន្នន័យនៅឡើយទេ'
                  : isBackupOverdue
                    ? `ដល់ពេល Backup ហើយ (${fmtNum(backupAgeDays)} ថ្ងៃមុន)`
                    : 'ការបម្រុងទុកទិន្នន័យទាន់ពេលវេលា'}
              </h2>
              <AppleBadge variant={isBackupOverdue ? 'orange' : 'green'} size="sm">
                {backupAgeDays === null
                  ? 'មិនទាន់ Backup'
                  : backupAgeDays === 0
                    ? 'ថ្ងៃនេះ'
                    : `${fmtNum(backupAgeDays)} ថ្ងៃមុន`}
              </AppleBadge>
            </div>
            <p className="text-xs text-[#6e6e73] dark:text-[#d1d1d6] mt-0.5">
              {lastBackupAt
                ? `បម្រុងទុកចុងក្រោយ៖ ${formatDateTimeKm(lastBackupAt, useKhmerNumerals)}`
                : 'ទិន្នន័យទាំងអស់រក្សាទុកក្នុងកម្មវិធីរុករក — សូមទាញយក .json ទុករាល់សប្ដាហ៍ដើម្បីកុំឱ្យបាត់បង់។'}
            </p>
            {storagePersisted === false && (
              <div
                data-testid="storage-persist-warning"
                className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#6e6e73] dark:text-[#d1d1d6]"
              >
                <span>
                  ការរក្សាទុកអចិន្ត្រៃយ៍មិនទាន់បានបើកទេ — ការដំឡើងកម្មវិធី (Chrome → Install KruDesk) ជួយរក្សាទិន្នន័យឱ្យមានសុវត្ថិភាព។
                </span>
                <button
                  type="button"
                  onClick={handleRequestPersist}
                  disabled={isRequestingPersist}
                  className="px-2 py-0.5 rounded-lg bg-black/[0.06] dark:bg-white/[0.1] hover:bg-black/[0.12] dark:hover:bg-white/[0.18] text-[#1d1d1f] dark:text-[#f5f5f7] font-semibold transition-colors disabled:opacity-50"
                >
                  {isRequestingPersist ? 'កំពុងស្នើសុំ...' : 'ស្នើសុំរក្សាទុកអចិន្ត្រៃយ៍'}
                </button>
              </div>
            )}
          </div>
        </div>

        <AppleButton
          variant={isBackupOverdue ? 'primary' : 'secondary'}
          size="sm"
          icon={<HardDriveDownload size={15} />}
          onClick={handleQuickBackup}
          disabled={isBackingUp}
          className="shrink-0"
        >
          {isBackingUp ? 'កំពុងបង្កើត...' : 'ទាញយក Backup ឥឡូវ'}
        </AppleButton>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AppleCard className="p-4">
          <div className="text-xs text-[#86868b]">ថ្នាក់រៀនសរុប</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
              {fmtNum(classes?.length ?? 0)} ថ្នាក់
            </span>
            {currentClass && (
              <AppleBadge variant="blue" size="sm">
                ថ្នាក់ទី {currentClass.name}
              </AppleBadge>
            )}
          </div>
        </AppleCard>

        <AppleCard className="p-4">
          <div className="text-xs text-[#86868b]">សិស្សសកម្មទូទាំងគ្រប់ថ្នាក់</div>
          <div className="mt-1 flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-2xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
              {fmtNum(activeAllStudents.length)} នាក់
            </span>
            <span className="text-xs text-[#6e6e73] dark:text-[#98989d]">
              ប្រុស {fmtNum(totalMale)} • ស្រី {fmtNum(totalFemale)}
            </span>
          </div>
        </AppleCard>

        <AppleCard className="p-4">
          <div className="text-xs text-[#86868b]">
            អវត្តមានថ្ងៃនេះ {currentClass ? `(ថ្នាក់ទី ${currentClass.name})` : ''}
          </div>
          {!currentClass || !todaySession ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
              <span
                data-testid="today-absences-untaken"
                className="text-sm font-semibold text-[#86868b] dark:text-[#98989d]"
              >
                មិនទាន់ហៅឈ្មោះ
              </span>
              {currentClass && (
                <AppleButton
                  variant="primary"
                  size="sm"
                  onClick={() => requestOpenRollCall(todayKey)}
                >
                  ហៅឈ្មោះថ្ងៃនេះ
                </AppleButton>
              )}
            </div>
          ) : (
            <div className="mt-1 flex items-baseline justify-between gap-2 flex-wrap">
              <span
                data-testid="today-absences-count"
                className={`text-2xl font-bold ${
                  todayAbsences.length > 0 ? 'text-[#ff3b30]' : 'text-[#34c759]'
                }`}
              >
                {fmtNum(todayAbsences.length)} នាក់
              </span>
              <span className="text-xs text-[#6e6e73] dark:text-[#98989d]">
                ក្នុងសិស្សសកម្ម {fmtNum(activeClassStudentsToday.length)} នាក់
              </span>
            </div>
          )}
        </AppleCard>
      </div>

      {/* Main Content */}
      {!classes || classes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={28} />}
          title="មិនទាន់មានថ្នាក់រៀន"
          hint="ចាប់ផ្ដើមដោយបង្កើតថ្នាក់រៀនដំបូង និងនាំចូលបញ្ជីឈ្មោះសិស្សពី Excel ។"
          actionLabel="បង្កើតថ្នាក់រៀន"
          onAction={requestOpenCreateClass}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Classes & Today's Absences */}
          <div className="lg:col-span-7 space-y-6">
            <AppleCard
              title="ថ្នាក់រៀនរបស់អ្នក"
              subtitle="ចុចលើថ្នាក់ដើម្បីមើលស្ថិតិវត្តមាន និងពិន្ទុ"
              headerAction={
                <AppleButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveView('students')}
                >
                  គ្រប់គ្រងថ្នាក់ <ArrowRight size={14} className="ml-1" />
                </AppleButton>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {classes.map((cls) => {
                  const activeSt = (allStudents ?? []).filter(
                    (s) => s.classId === cls.id && s.status === 'active'
                  );
                  const boys = activeSt.filter((s) => s.gender === 'ប្រុស').length;
                  const girls = activeSt.filter((s) => s.gender === 'ស្រី').length;
                  const isSelected = cls.id === currentClass?.id;

                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => cls.id !== undefined && setSelectedClassId(cls.id)}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-[#0071e3] bg-[#e8f2ff]/60 dark:bg-blue-500/15 ring-1 ring-[#0071e3]'
                          : 'border-black/[0.06] dark:border-white/[0.08] bg-[#f5f5f7]/60 dark:bg-white/[0.04] hover:bg-[#f5f5f7] dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-3.5 h-8 rounded-full shrink-0"
                          style={{ backgroundColor: cls.color }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                            ថ្នាក់ទី {cls.name}
                          </div>
                          <div className="text-[11px] text-[#86868b] truncate">
                            {fmtNum(cls.academicYear)} • ប {fmtNum(boys)} / ស {fmtNum(girls)}
                          </div>
                        </div>
                      </div>
                      <AppleBadge variant={isSelected ? 'blue' : 'gray'} size="sm">
                        {fmtNum(activeSt.length)} នាក់
                      </AppleBadge>
                    </button>
                  );
                })}
              </div>
            </AppleCard>

            <AppleCard
              title={`អវត្តមានថ្ងៃនេះ (${todayKey})`}
              subtitle={
                currentClass ? `ថ្នាក់ទី ${currentClass.name}` : undefined
              }
              headerAction={
                <AppleButton
                  variant="secondary"
                  size="sm"
                  onClick={() => requestOpenRollCall(todayKey)}
                >
                  កត់វត្តមាន
                </AppleButton>
              }
            >
              {!todaySession ? (
                <div className="py-6 flex flex-col items-center gap-2.5 text-center">
                  <div className="text-xs text-[#86868b] dark:text-[#98989d]">
                    មិនទាន់ហៅឈ្មោះសម្រាប់ថ្ងៃនេះទេ។
                  </div>
                  <AppleButton
                    variant="primary"
                    size="sm"
                    onClick={() => requestOpenRollCall(todayKey)}
                  >
                    ហៅឈ្មោះថ្ងៃនេះ
                  </AppleButton>
                </div>
              ) : todayAbsences.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#34c759] font-medium">
                  គ្មានសិស្សអវត្តមានទេ — មករៀនគ្រប់គ្នា!
                </div>
              ) : (
                <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {todayAbsences.map((item) => (
                    <div
                      key={item.student.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                          {item.student.nameKm}
                        </div>
                        <div className="text-[11px] text-[#86868b] font-mono">
                          {fmtNum(item.student.studentId)}
                        </div>
                      </div>
                      <AppleBadge
                        variant={
                          item.status === 'អច្ប'
                            ? 'red'
                            : item.status === 'ឈ'
                              ? 'orange'
                              : 'blue'
                        }
                        size="sm"
                      >
                        {item.status === 'ច្ប'
                          ? 'មានច្បាប់ (ច្ប)'
                          : item.status === 'អច្ប'
                            ? 'អត់ច្បាប់ (អច្ប)'
                            : 'ឈឺ (ឈ)'}
                      </AppleBadge>
                    </div>
                  ))}
                </div>
              )}
            </AppleCard>
          </div>

          {/* Right Column: Top 3 Absentees This Month */}
          <div className="lg:col-span-5">
            <AppleCard
              title="អវត្តមានច្រើនជាងគេប្រចាំខែ (Top 3)"
              subtitle={`${formatKhmerMonthYear(selectedMonth, useKhmerNumerals)}${
                currentClass ? ` • ថ្នាក់ទី ${currentClass.name}` : ''
              }`}
              headerAction={
                <AppleButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveView('attendance')}
                >
                  មើលទាំងអស់
                </AppleButton>
              }
            >
              {topAbsentees.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#86868b] dark:text-[#98989d]">
                  មិនទាន់មានកំណត់ត្រាអវត្តមានក្នុងខែនេះទេ។
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topAbsentees.map((entry, idx) => (
                    <div
                      key={entry.student.id}
                      className="p-3 rounded-2xl bg-[#f5f5f7]/80 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                            idx === 0
                              ? 'bg-[#ff3b30] text-white'
                              : idx === 1
                                ? 'bg-[#ff9500] text-white'
                                : 'bg-[#0071e3]/15 text-[#0071e3]'
                          }`}
                        >
                          {fmtNum(idx + 1)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                            {entry.student.nameKm}
                          </div>
                          <div className="text-[11px] text-[#86868b] mt-0.5">
                            ច្ប {fmtNum(entry.summary.excused)} • អច្ប{' '}
                            {fmtNum(entry.summary.unexcused)}
                          </div>
                        </div>
                      </div>

                      <AppleBadge variant="red" size="sm">
                        សរុប {fmtNum(entry.summary.total)}
                      </AppleBadge>
                    </div>
                  ))}
                </div>
              )}
            </AppleCard>
          </div>
        </div>
      )}
    </div>
  );
};
