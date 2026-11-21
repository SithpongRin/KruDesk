import { z } from 'zod';
import {
  db,
  deriveSessionsFromAbsenceRows,
  markMigratedSessionsInBatch,
  setSetting,
  type KruDeskDatabase,
} from '../db/database';
import { normalizeMigratedClassSubjects } from '../db/subjectMigration';
import { toLocalDateKey } from '../lib/khmerDate';
import {
  isInternalSyncSettingKey,
  SYNC_DEVICE_ID_KEY,
  SYNC_INITIAL_DONE_KEY,
  SYNC_LAST_PULLED_AT_KEY,
  SYNC_PENDING_FULL_REPLACE_KEY,
} from './sync/syncCodec';
import type {
  AppSetting,
  Attendance,
  AttendanceSession,
  Holiday,
  MonthlyScore,
  SchoolClass,
  SemesterExam,
  Student,
} from '../types/domain';
import type { CardTemplate } from '../types/template';

export const BACKUP_SCHEMA_VERSION = 3 as const;

const SubjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  group: z.string().optional(),
  maxScore: z.number().nonnegative(),
  order: z.number().int().nonnegative(),
  isActive: z.boolean().optional(),
  isBonus: z.boolean().optional(),
});

const SchoolClassBackupSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().min(1),
    gradeLevel: z.number().int().min(1).max(12),
    academicYear: z.string().min(1),
    color: z.string().min(1),
    subjects: z.array(SubjectSchema),
    createdAt: z.number(),
  })
  .passthrough();

const StudentBackupSchema = z
  .object({
    id: z.number().int().positive().optional(),
    classId: z.number().int().positive(),
    order: z.number().int().nonnegative(),
    studentId: z.string().min(1),
    nameKm: z.string().min(1),
    nameEn: z.string().optional(),
    gender: z.enum(['ប្រុស', 'ស្រី']),
    dateOfBirth: z.string(),
    placeOfBirth: z.string().optional(),
    fatherName: z.string().optional(),
    fatherOccupation: z.string().optional(),
    motherName: z.string().optional(),
    motherOccupation: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    cardNumber: z.string().optional(),
    photoBase64: z.string().optional(),
    status: z.enum(['active', 'dropped', 'transferred']),
    statusChangedAt: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .passthrough();

const AttendanceBackupSchema = z.object({
  classId: z.number().int().positive(),
  studentRef: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['ច្ប', 'អច្ប', 'ឈ']),
});

const AttendanceSessionBackupSchema = z
  .object({
    classId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    savedAt: z.number(),
    migrated: z.boolean().optional(),
  })
  .passthrough();

const HolidayBackupSchema = z
  .object({
    id: z.number().int().positive().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: z.string().min(1),
  })
  .passthrough();

const MonthlyScoreBackupSchema = z
  .object({
    classId: z.number().int().positive(),
    studentRef: z.number().int().positive(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    scores: z.record(z.string(), z.number().nullable()),
    note: z.string().optional(),
  })
  .passthrough();

const SemesterExamBackupSchema = z
  .object({
    classId: z.number().int().positive(),
    studentRef: z.number().int().positive(),
    semester: z.union([z.literal(1), z.literal(2)]),
    scores: z.record(z.string(), z.number().nullable()),
    note: z.string().optional(),
  })
  .passthrough();

const AppSettingBackupSchema = z
  .object({
    key: z.string().min(1),
    value: z.unknown(),
  })
  .passthrough();

export const KruDeskBackupSchema = z.object({
  appName: z.literal('KruDesk'),
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: z.number().int().positive(),
  data: z.object({
    settings: z.array(AppSettingBackupSchema),
    classes: z.array(SchoolClassBackupSchema),
    students: z.array(StudentBackupSchema),
    attendance: z.array(AttendanceBackupSchema),
    attendanceSessions: z.array(AttendanceSessionBackupSchema).optional(),
    holidays: z.array(HolidayBackupSchema),
    monthlyScores: z.array(MonthlyScoreBackupSchema),
    semesterExams: z.array(SemesterExamBackupSchema),
    templates: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
});

export type KruDeskBackupPayload = z.infer<typeof KruDeskBackupSchema>;
export type RestoreMode = 'replace' | 'merge';

export interface RestoreSummary {
  classesCount: number;
  studentsCount: number;
  attendanceCount: number;
  monthlyScoresCount: number;
  semesterExamsCount: number;
  holidaysCount: number;
}

function applyMigratedFlagToRestoredSessions(sessions: AttendanceSession[]): AttendanceSession[] {
  const toFlag = new Set(
    markMigratedSessionsInBatch(sessions).map((s) => `${s.classId}|${s.date}`)
  );
  if (toFlag.size === 0) return sessions;
  return sessions.map((s) =>
    toFlag.has(`${s.classId}|${s.date}`) ? { ...s, migrated: true } : s
  );
}

async function normalizeRestoredClassSubjects(
  classIds: Iterable<number>,
  targetDb: KruDeskDatabase = db
): Promise<void> {
  const uniqueIds = new Set(classIds);
  if (uniqueIds.size === 0) return;
  const [allMonthly, allExams] = await Promise.all([
    targetDb.monthlyScores.toArray(),
    targetDb.semesterExams.toArray(),
  ]);
  for (const cid of uniqueIds) {
    const cls = await targetDb.classes.get(cid);
    if (!cls) continue;
    const { subjects, changed } = normalizeMigratedClassSubjects(
      cls.subjects ?? [],
      allMonthly.filter((m) => m.classId === cid),
      allExams.filter((s) => s.classId === cid)
    );
    if (changed) {
      await targetDb.classes.update(cid, { subjects });
    }
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob | undefined {
  if (!dataUrl || !dataUrl.startsWith('data:')) return undefined;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return undefined;
  const header = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return undefined;
  }
}

export async function buildBackupPayload(
  now: number = Date.now(),
  targetDb: KruDeskDatabase = db
): Promise<KruDeskBackupPayload> {
  const [
    rawSettings,
    classes,
    students,
    attendance,
    attendanceSessions,
    holidays,
    monthlyScores,
    semesterExams,
    templates,
  ] = await Promise.all([
    targetDb.settings.toArray(),
    targetDb.classes.toArray(),
    targetDb.students.toArray(),
    targetDb.attendance.toArray(),
    targetDb.attendanceSessions.toArray(),
    targetDb.holidays.toArray(),
    targetDb.monthlyScores.toArray(),
    targetDb.semesterExams.toArray(),
    targetDb.templates.toArray(),
  ]);
  const settings = rawSettings.filter((s) => !isInternalSyncSettingKey(s.key));

  const serializedStudents = await Promise.all(
    students.map(async (s) => {
      const { photoBlob, ...rest } = s;
      const photoBase64 = photoBlob ? await blobToDataUrl(photoBlob) : undefined;
      return {
        ...rest,
        ...(photoBase64 ? { photoBase64 } : {}),
      };
    })
  );

  return {
    appName: 'KruDesk',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    data: {
      settings: settings as unknown as KruDeskBackupPayload['data']['settings'],
      classes: classes as unknown as KruDeskBackupPayload['data']['classes'],
      students: serializedStudents,
      attendance,
      attendanceSessions:
        attendanceSessions as unknown as KruDeskBackupPayload['data']['attendanceSessions'],
      holidays: holidays as unknown as KruDeskBackupPayload['data']['holidays'],
      monthlyScores: monthlyScores as unknown as KruDeskBackupPayload['data']['monthlyScores'],
      semesterExams: semesterExams as unknown as KruDeskBackupPayload['data']['semesterExams'],
      templates: templates as unknown as Record<string, unknown>[],
    },
  };
}

export async function downloadBackupJson(): Promise<{
  fileName: string;
  sizeBytes: number;
  exportedAt: number;
  summary: RestoreSummary;
}> {
  const now = Date.now();
  const payload = await buildBackupPayload(now);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const dateStr = toLocalDateKey(new Date(now));
  const fileName = `KruDesk_Backup_${dateStr}.json`;

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  await setSetting('lastBackupAt', now);

  return {
    fileName,
    sizeBytes: blob.size,
    exportedAt: now,
    summary: summarizeBackup(payload),
  };
}

export function parseAndValidateBackup(rawJson: string): KruDeskBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('ឯកសារ JSON មិនត្រឹមត្រូវ ឬមិនអាចអានបានទេ។');
  }

  const result = KruDeskBackupSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path?.join('.') || 'root';
    throw new Error(`ទម្រង់ Backup មិនត្រឹមត្រូវ (${path}: ${firstIssue?.message || 'Invalid schema'})`);
  }

  return result.data;
}

export function summarizeBackup(payload: KruDeskBackupPayload): RestoreSummary {
  return {
    classesCount: payload.data.classes.length,
    studentsCount: payload.data.students.length,
    attendanceCount: payload.data.attendance.length,
    monthlyScoresCount: payload.data.monthlyScores.length,
    semesterExamsCount: payload.data.semesterExams.length,
    holidaysCount: payload.data.holidays.length,
  };
}

export async function restoreBackupPayload(
  payload: KruDeskBackupPayload,
  mode: RestoreMode,
  targetDb: KruDeskDatabase = db
): Promise<RestoreSummary> {
  // Re-validate with Zod before touching IndexedDB
  const validated = KruDeskBackupSchema.parse(payload);
  const { data } = validated;

  await targetDb.transaction(
    'rw',
    [
      targetDb.settings,
      targetDb.classes,
      targetDb.students,
      targetDb.attendance,
      targetDb.attendanceSessions,
      targetDb.holidays,
      targetDb.monthlyScores,
      targetDb.semesterExams,
      targetDb.templates,
    ],
    async () => {
      const classIdMap = new Map<number, number>();
      const studentIdMap = new Map<number, number>();

      if (mode === 'replace') {
        const [deviceIdRow, lastPulledRow, initialDoneRow] = await Promise.all([
          targetDb.settings.get(SYNC_DEVICE_ID_KEY),
          targetDb.settings.get(SYNC_LAST_PULLED_AT_KEY),
          targetDb.settings.get(SYNC_INITIAL_DONE_KEY),
        ]);

        await Promise.all([
          targetDb.settings.clear(),
          targetDb.classes.clear(),
          targetDb.students.clear(),
          targetDb.attendance.clear(),
          targetDb.attendanceSessions.clear(),
          targetDb.holidays.clear(),
          targetDb.monthlyScores.clear(),
          targetDb.semesterExams.clear(),
          targetDb.templates.clear(),
        ]);

        for (const cls of data.classes) {
          const oldId = cls.id;
          const record: SchoolClass = { ...cls };
          delete record.id;
          const newId = await targetDb.classes.add(record);
          if (oldId !== undefined) classIdMap.set(oldId, newId);
        }

        for (const st of data.students) {
          const oldId = st.id;
          const mappedClassId = classIdMap.get(st.classId) ?? st.classId;
          const { photoBase64, id: _discardId, ...rest } = st;
          const photoBlob = photoBase64 ? dataUrlToBlob(photoBase64) : undefined;
          const record: Student = {
            ...rest,
            classId: mappedClassId,
            ...(photoBlob ? { photoBlob } : {}),
          };
          const newId = await targetDb.students.add(record);
          if (oldId !== undefined) studentIdMap.set(oldId, newId);
        }

        const attendanceRows: Attendance[] = data.attendance.map((a) => ({
          ...a,
          classId: classIdMap.get(a.classId) ?? a.classId,
          studentRef: studentIdMap.get(a.studentRef) ?? a.studentRef,
        }));
        if (attendanceRows.length > 0) await targetDb.attendance.bulkPut(attendanceRows);

        const sessionRows: AttendanceSession[] =
          validated.schemaVersion === 1 || data.attendanceSessions === undefined
            ? deriveSessionsFromAbsenceRows(attendanceRows, validated.exportedAt)
            : applyMigratedFlagToRestoredSessions(
                data.attendanceSessions.map((s) => ({
                  ...s,
                  classId: classIdMap.get(s.classId) ?? s.classId,
                }))
              );
        if (sessionRows.length > 0) await targetDb.attendanceSessions.bulkPut(sessionRows);

        const holidayRows: Holiday[] = data.holidays.map(({ id: _id, ...h }) => h);
        if (holidayRows.length > 0) await targetDb.holidays.bulkAdd(holidayRows);

        const monthlyRows: MonthlyScore[] = data.monthlyScores.map((m) => ({
          ...m,
          classId: classIdMap.get(m.classId) ?? m.classId,
          studentRef: studentIdMap.get(m.studentRef) ?? m.studentRef,
        }));
        if (monthlyRows.length > 0) await targetDb.monthlyScores.bulkPut(monthlyRows);

        const semesterRows: SemesterExam[] = data.semesterExams.map((s) => ({
          ...s,
          classId: classIdMap.get(s.classId) ?? s.classId,
          studentRef: studentIdMap.get(s.studentRef) ?? s.studentRef,
        }));
        if (semesterRows.length > 0) await targetDb.semesterExams.bulkPut(semesterRows);

        if (validated.schemaVersion < 3) {
          await normalizeRestoredClassSubjects(classIdMap.values(), targetDb);
        }

        const settingRows: AppSetting[] = data.settings
          .filter((s) => !isInternalSyncSettingKey(s.key))
          .map((s) => {
            if (s.key === 'selectedClassId' && typeof s.value === 'number') {
              return { key: s.key, value: classIdMap.get(s.value) ?? s.value };
            }
            return { key: s.key, value: s.value };
          });
        if (settingRows.length > 0) await targetDb.settings.bulkPut(settingRows);

        if (data.templates.length > 0) {
          await targetDb.templates.bulkPut(data.templates as unknown as CardTemplate[]);
        }

        // Preserve local sync metadata and flag a full cloud replace so every device matches this restore
        if (deviceIdRow) {
          await targetDb.settings.put(deviceIdRow);
        }
        if (lastPulledRow) {
          await targetDb.settings.put(lastPulledRow);
        }
        if (initialDoneRow) {
          await targetDb.settings.put(initialDoneRow);
        }
        if (targetDb.outboxEnabled) {
          await targetDb.settings.put({
            key: SYNC_PENDING_FULL_REPLACE_KEY,
            value: Date.now(),
          });
        }
      } else {
        // Merge mode
        const existingClasses = await targetDb.classes.toArray();
        for (const cls of data.classes) {
          const match = existingClasses.find(
            (c) => c.name === cls.name && c.academicYear === cls.academicYear
          );
          if (match && match.id !== undefined) {
            if (cls.id !== undefined) classIdMap.set(cls.id, match.id);
          } else {
            const { id: oldId, ...rest } = cls;
            const newId = await targetDb.classes.add(rest);
            if (oldId !== undefined) classIdMap.set(oldId, newId);
          }
        }

        const existingStudents = await targetDb.students.toArray();
        for (const st of data.students) {
          const mappedClassId = classIdMap.get(st.classId) ?? st.classId;
          const match = existingStudents.find(
            (s) => s.classId === mappedClassId && s.studentId === st.studentId
          );
          if (match && match.id !== undefined) {
            if (st.id !== undefined) studentIdMap.set(st.id, match.id);
          } else {
            const { id: oldId, photoBase64, ...rest } = st;
            const photoBlob = photoBase64 ? dataUrlToBlob(photoBase64) : undefined;
            const newId = await targetDb.students.add({
              ...rest,
              classId: mappedClassId,
              ...(photoBlob ? { photoBlob } : {}),
            });
            if (oldId !== undefined) studentIdMap.set(oldId, newId);
          }
        }

        const attendanceRows: Attendance[] = data.attendance.map((a) => ({
          ...a,
          classId: classIdMap.get(a.classId) ?? a.classId,
          studentRef: studentIdMap.get(a.studentRef) ?? a.studentRef,
        }));
        if (attendanceRows.length > 0) await targetDb.attendance.bulkPut(attendanceRows);

        const sessionRows: AttendanceSession[] =
          validated.schemaVersion === 1 || data.attendanceSessions === undefined
            ? deriveSessionsFromAbsenceRows(attendanceRows, validated.exportedAt)
            : applyMigratedFlagToRestoredSessions(
                data.attendanceSessions.map((s) => ({
                  ...s,
                  classId: classIdMap.get(s.classId) ?? s.classId,
                }))
              );
        if (sessionRows.length > 0) await targetDb.attendanceSessions.bulkPut(sessionRows);

        for (const h of data.holidays) {
          const existingHoliday = await targetDb.holidays.where('date').equals(h.date).first();
          if (!existingHoliday) {
            await targetDb.holidays.add({ date: h.date, label: h.label });
          }
        }

        const monthlyRows: MonthlyScore[] = data.monthlyScores.map((m) => ({
          ...m,
          classId: classIdMap.get(m.classId) ?? m.classId,
          studentRef: studentIdMap.get(m.studentRef) ?? m.studentRef,
        }));
        if (monthlyRows.length > 0) await targetDb.monthlyScores.bulkPut(monthlyRows);

        const semesterRows: SemesterExam[] = data.semesterExams.map((s) => ({
          ...s,
          classId: classIdMap.get(s.classId) ?? s.classId,
          studentRef: studentIdMap.get(s.studentRef) ?? s.studentRef,
        }));
        if (semesterRows.length > 0) await targetDb.semesterExams.bulkPut(semesterRows);

        if (validated.schemaVersion < 3) {
          await normalizeRestoredClassSubjects(classIdMap.values(), targetDb);
        }

        for (const s of data.settings) {
          if (isInternalSyncSettingKey(s.key)) continue;
          const existing = await targetDb.settings.get(s.key);
          if (!existing) {
            const val =
              s.key === 'selectedClassId' && typeof s.value === 'number'
                ? (classIdMap.get(s.value) ?? s.value)
                : s.value;
            await targetDb.settings.put({ key: s.key, value: val });
          }
        }

        if (data.templates.length > 0) {
          await targetDb.templates.bulkPut(data.templates as unknown as CardTemplate[]);
        }
      }
    }
  );

  if (mode === 'replace' && targetDb.outboxEnabled) {
    targetDb.notifyOutboxListeners();
  }

  return summarizeBackup(validated);
}
