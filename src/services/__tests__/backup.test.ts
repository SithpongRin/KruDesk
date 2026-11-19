// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearAllAppData, getSetting } from '../../db/database';
import {
  BACKUP_SCHEMA_VERSION,
  dataUrlToBlob,
  downloadBackupJson,
  parseAndValidateBackup,
  restoreBackupPayload,
  summarizeBackup,
  type KruDeskBackupPayload,
} from '../backup';

function makeValidBackup(): KruDeskBackupPayload {
  return {
    appName: 'KruDesk',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: 1731900000000,
    data: {
      settings: [
        {
          key: 'profile',
          value: {
            teacherName: 'សុខ ដារ៉ា',
            schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
            directorName: 'ជា សារ៉ា',
            academicYear: '២០២៦-២០២៧',
          },
        },
        { key: 'lastBackupAt', value: 1731900000000 },
      ],
      classes: [
        {
          id: 1,
          name: '៧ក',
          gradeLevel: 7,
          academicYear: '២០២៦-២០២៧',
          color: '#0071e3',
          subjects: [{ id: 'kh', name: 'គណិតវិទ្យា', maxScore: 50, order: 1 }],
          createdAt: 1731800000000,
        },
      ],
      students: [
        {
          id: 10,
          classId: 1,
          order: 1,
          studentId: 'S001',
          nameKm: 'ក ខ',
          gender: 'ប្រុស',
          dateOfBirth: '01/01/2013',
          status: 'active',
          createdAt: 1731800000000,
          updatedAt: 1731800000000,
        },
      ],
      attendance: [{ classId: 1, studentRef: 10, date: '2026-11-18', status: 'ច្ប' }],
      attendanceSessions: [
        { classId: 1, date: '2026-11-18', savedAt: 1731890000000 },
        { classId: 1, date: '2026-11-19', savedAt: 1731900000000 },
      ],
      holidays: [{ id: 1, date: '2026-11-09', label: 'បុណ្យឯករាជ្យជាតិ' }],
      monthlyScores: [{ classId: 1, studentRef: 10, month: '2026-11', scores: { kh: 45 } }],
      semesterExams: [{ classId: 1, studentRef: 10, semester: 1, scores: { kh: 42 } }],
      templates: [],
    },
  };
}

describe('Backup validation & helpers', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllAppData();
  });

  it('accepts a valid KruDesk backup JSON with schemaVersion and exportedAt', () => {
    const payload = makeValidBackup();
    const parsed = parseAndValidateBackup(JSON.stringify(payload));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.exportedAt).toBe(1731900000000);
    expect(summarizeBackup(parsed)).toEqual({
      classesCount: 1,
      studentsCount: 1,
      attendanceCount: 1,
      monthlyScoresCount: 1,
      semesterExamsCount: 1,
      holidaysCount: 1,
    });
  });

  it('rejects malformed JSON', () => {
    expect(() => parseAndValidateBackup('{not json')).toThrow();
  });

  it('rejects backup with wrong schemaVersion or missing exportedAt', () => {
    const wrongVersion = { ...makeValidBackup(), schemaVersion: 99 };
    expect(() => parseAndValidateBackup(JSON.stringify(wrongVersion))).toThrow();

    const { exportedAt: _omit, ...noExportedAt } = makeValidBackup();
    expect(() => parseAndValidateBackup(JSON.stringify(noExportedAt))).toThrow();
  });

  it('rejects backup with invalid attendance code or student gender', () => {
    const badAttendance = makeValidBackup();
    (badAttendance.data.attendance[0] as any).status = 'INVALID';
    expect(() => parseAndValidateBackup(JSON.stringify(badAttendance))).toThrow();

    const badGender = makeValidBackup();
    (badGender.data.students[0] as any).gender = 'Other';
    expect(() => parseAndValidateBackup(JSON.stringify(badGender))).toThrow();
  });

  it('preserves unknown future fields on records during validation and restore', async () => {
    const payloadWithExtra = makeValidBackup();
    (payloadWithExtra.data.students[0] as any).futureBadge = 'honor-roll';
    (payloadWithExtra.data.classes[0] as any).futureRoom = 'B2';

    const parsed = parseAndValidateBackup(JSON.stringify(payloadWithExtra));
    expect((parsed.data.students[0] as any).futureBadge).toBe('honor-roll');

    await restoreBackupPayload(parsed, 'replace');

    const students = await db.students.toArray();
    const classes = await db.classes.toArray();
    expect(students).toHaveLength(1);
    expect((students[0] as any).futureBadge).toBe('honor-roll');
    expect((classes[0] as any).futureRoom).toBe('B2');
  });

  it('converts base64 data URLs back to Blob safely', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const blob = dataUrlToBlob(dataUrl);
    expect(blob).toBeDefined();
    expect(blob?.type).toBe('text/plain');
    expect(blob?.size).toBe(5);
    expect(dataUrlToBlob('not-a-data-url')).toBeUndefined();
  });

  it('stores lastBackupAt in settings only after download trigger succeeds', async () => {
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementationOnce(() => {
      throw new Error('Download blocked');
    });

    await expect(downloadBackupJson()).rejects.toThrow('Download blocked');
    expect(await getSetting('lastBackupAt')).toBeUndefined();

    clickSpy.mockImplementationOnce(() => {});
    const res = await downloadBackupJson();
    expect(await getSetting('lastBackupAt')).toBe(res.exportedAt);

    clickSpy.mockRestore();
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('restores v2 attendanceSessions (including 0-absence taken days) and derives sessions for v1 backups', async () => {
    // 1. Restore v2 backup -> keeps both taken days (Nov 18 with absence, Nov 19 with 0 absences)
    const v2Payload = makeValidBackup();
    await restoreBackupPayload(v2Payload, 'replace');
    const v2Sessions = await db.attendanceSessions.toArray();
    expect(v2Sessions).toHaveLength(2);
    expect(v2Sessions.map((s) => s.date).sort()).toEqual(['2026-11-18', '2026-11-19']);

    // 2. Restore a v1 backup lacking attendanceSessions -> derives 1 session from the absence row
    const v1Raw = makeValidBackup();
    const { attendanceSessions: _omit, ...v1Data } = v1Raw.data;
    const v1Payload = {
      ...v1Raw,
      schemaVersion: 1 as const,
      data: v1Data,
    };
    const parsedV1 = parseAndValidateBackup(JSON.stringify(v1Payload));
    await restoreBackupPayload(parsedV1, 'replace');

    const derived = await db.attendanceSessions.toArray();
    expect(derived).toHaveLength(1);
    expect(derived[0].date).toBe('2026-11-18');
    expect(derived[0].savedAt).toBe(v1Raw.exportedAt);
  });
});
