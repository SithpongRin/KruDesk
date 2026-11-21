// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAllAppData, KruDeskDatabase, LEGACY_DB_NAME } from '../../../db/database';
import { buildBackupPayload, restoreBackupPayload } from '../../backup';
import { rawBlobToDataUrl } from '../photoCompression';
import { applyRemoteDocToDexie, estimateFullDocBytes } from '../syncEngine';
import {
  decodeSafeKey,
  encodeSafeKey,
  getDocApplyPriority,
  isExpiredTombstone,
  isInternalSyncSettingKey,
  isSyncedSettingKey,
  makeTombstone,
  MAX_SYNC_DOC_BYTES,
  SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY,
  SYNC_LAST_PULL_WALL_AT_KEY,
  SYNC_PENDING_FULL_REPLACE_KEY,
  SYNC_PENDING_PHOTOS_KEY,
  TOMBSTONE_RETENTION_MS,
} from '../syncCodec';

describe('SyncCodec & atomic Dexie DBCore Outbox middleware (§00 fixes 1–6)', () => {
  let testDb: KruDeskDatabase;

  beforeEach(async () => {
    testDb = new KruDeskDatabase(`KruDeskDB_outbox_test_${Date.now()}_${Math.random()}`);
    await testDb.open();
    await clearAllAppData(testDb);
  });

  afterEach(async () => {
    await clearAllAppData(testDb);
    testDb.close();
  });

  it('encodes and decodes arbitrary template IDs and orders doc apply priority (class -> students -> photo -> others)', () => {
    const raw = 'custom.template/2026-11 [v1]';
    const encoded = encodeSafeKey(raw);
    expect(/^[A-Za-z0-9_]+$/.test(encoded)).toBe(true);
    expect(decodeSafeKey(encoded)).toBe(raw);

    expect(getDocApplyPriority('class__1')).toBeLessThan(getDocApplyPriority('students__1'));
    expect(getDocApplyPriority('students__1')).toBeLessThan(getDocApplyPriority('photo__1'));
    expect(getDocApplyPriority('photo__1')).toBeLessThan(getDocApplyPriority('ms__1__2026-11'));
    expect(getDocApplyPriority('photo__1')).toBeLessThan(getDocApplyPriority('att__1__2026-11'));
  });

  it('queues allow-listed settings atomically in outbox inside the same transaction and ignores device-only settings', async () => {
    expect(isSyncedSettingKey('profile')).toBe(true);
    expect(isSyncedSettingKey('scoreConfig')).toBe(true);
    expect(isSyncedSettingKey('theme')).toBe(false);
    expect(isSyncedSettingKey('selectedClassId')).toBe(false);
    expect(isSyncedSettingKey('selectedMonth')).toBe(false);
    expect(isSyncedSettingKey('lastBackupAt')).toBe(false);

    await testDb.settings.put({ key: 'theme', value: 'dark' });
    await testDb.settings.put({ key: 'selectedClassId', value: 123 });
    await testDb.settings.put({ key: 'documentPlace', value: 'ភ្នំពេញ' });

    // No buffer flush needed — entry is already committed atomically with the setting write
    const entries = await testDb.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.docId).toBe('settings__documentPlace');
    expect(entries[0]?.rowKey).toBe('v');
    expect(entries[0]?.op).toBe('put');
  });

  it('rolls back outbox atomically when a readwrite transaction aborts (fix 3)', async () => {
    await expect(
      testDb.transaction('rw', [testDb.classes, testDb.settings], async () => {
        await testDb.classes.add({
          name: '8A-Rollback',
          gradeLevel: 8,
          academicYear: '2026-2027',
          color: '#0071e3',
          subjects: [],
          createdAt: Date.now(),
        });
        await testDb.settings.put({ key: 'documentPlace', value: 'កណ្ដាល' });
        throw new Error('Simulated crash / abort');
      })
    ).rejects.toThrow('Simulated crash / abort');

    expect(await testDb.classes.count()).toBe(0);
    expect(await testDb.outbox.count()).toBe(0);
  });

  it('records pendingPhoto immediately in the same transaction on student add/photo update, and skips photo on non-photo updates (fix 3)', async () => {
    const classId = await testDb.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const photoBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
    const studentId = await testDb.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'សិស្ស មានរូប',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      photoBlob,
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    const photoOutbox = await testDb.outbox.get([`photo__${studentId}`, `p_${studentId}`]);
    expect(photoOutbox).toBeDefined();
    expect(photoOutbox?.op).toBe('put');
    expect(photoOutbox?.pendingPhoto).toBe(true);

    // Clear outbox and update only nameKm -> should NOT re-queue photo__<id>
    await testDb.outbox.clear();
    await testDb.students.update(studentId, { nameKm: 'ឈ្មោះថ្មី' });
    expect(await testDb.outbox.get([`students__${classId}`, `s_${studentId}`])).toBeDefined();
    expect(await testDb.outbox.get([`photo__${studentId}`, `p_${studentId}`])).toBeUndefined();

    // Removing photoBlob queues photo delete
    await testDb.students.update(studentId, { photoBlob: undefined });
    const deletedPhotoOutbox = await testDb.outbox.get([`photo__${studentId}`, `p_${studentId}`]);
    expect(deletedPhotoOutbox?.op).toBe('delete');
  });

  it('Table.clear() records delete entries in outbox through DBCore deleteRange (fix 6)', async () => {
    const h1 = await testDb.holidays.add({ date: '2026-11-09', label: 'បុណ្យឯករាជ្យជាតិ' });
    const h2 = await testDb.holidays.add({ date: '2026-11-10', label: 'ឈប់សម្រាក' });
    await testDb.outbox.clear();

    await testDb.holidays.clear();

    const entries = await testDb.outbox.toArray();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => `${e.docId}:${e.rowKey}:${e.op}`).sort()).toEqual(
      [`holidays:h_${h1}:delete`, `holidays:h_${h2}:delete`].sort()
    );
  });

  it('applyRemoteDocToDexie respects pending outbox, deletes only on tombstones, and self-heals missing rows (fix 4)', async () => {
    const classId = await testDb.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const s1 = await testDb.students.add({
      classId,
      order: 1,
      studentId: 'S001',
      nameKm: 'ឈ្មោះកែក្នុងម៉ាស៊ីន',
      gender: 'ប្រុស',
      dateOfBirth: '2013-01-01',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const sLocalMissingInCloud = await testDb.students.add({
      classId,
      order: 2,
      studentId: 'S002',
      nameKm: 'សិស្សក្នុងម៉ាស៊ីនមិនទាន់នៅលើ Cloud',
      gender: 'ស្រី',
      dateOfBirth: '2013-02-02',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });
    const sToDelete = await testDb.students.add({
      classId,
      order: 3,
      studentId: 'S003',
      nameKm: 'សិស្សត្រូវលុបដោយ Tombstone',
      gender: 'ប្រុស',
      dateOfBirth: '2013-03-03',
      status: 'active',
      createdAt: 1732000000000,
      updatedAt: 1732000000000,
    });

    // Keep ONLY s1 pending in outbox; clear other outbox entries to simulate missing cloud row
    await testDb.outbox.clear();
    await testDb.outbox.put({
      docId: `students__${classId}`,
      rowKey: `s_${s1}`,
      op: 'put',
      value: { id: s1, classId, nameKm: 'ឈ្មោះកែក្នុងម៉ាស៊ីន' },
      ts: testDb.nextOutboxTs(),
    });

    const sRemoteNew = 999888777;
    const { requeuedCount } = await applyRemoteDocToDexie(testDb, `students__${classId}`, {
      kind: 'students',
      schemaVersion: 1,
      rows: {
        [`s_${s1}`]: {
          id: s1,
          classId,
          order: 1,
          studentId: 'S001',
          nameKm: 'ឈ្មោះចាស់ពី Cloud',
          gender: 'ប្រុស',
          dateOfBirth: '2013-01-01',
          status: 'active',
          createdAt: 1732000000000,
          updatedAt: 1732000000000,
        },
        [`s_${sToDelete}`]: makeTombstone(Date.now()),
        [`s_${sRemoteNew}`]: {
          id: sRemoteNew,
          classId,
          order: 4,
          studentId: 'S004',
          nameKm: 'សិស្សថ្មីពី Cloud',
          gender: 'ស្រី',
          dateOfBirth: '2013-04-04',
          status: 'active',
          createdAt: 1732000000000,
          updatedAt: 1732000000000,
        },
      },
    });

    // s1 keeps local name (pending outbox); sRemoteNew is added; sToDelete is deleted (tombstone);
    // sLocalMissingInCloud is NOT deleted and IS self-healed into outbox!
    expect((await testDb.students.get(s1))?.nameKm).toBe('ឈ្មោះកែក្នុងម៉ាស៊ីន');
    expect((await testDb.students.get(sRemoteNew))?.nameKm).toBe('សិស្សថ្មីពី Cloud');
    expect(await testDb.students.get(sToDelete)).toBeUndefined();
    expect((await testDb.students.get(sLocalMissingInCloud))?.nameKm).toBe(
      'សិស្សក្នុងម៉ាស៊ីនមិនទាន់នៅលើ Cloud'
    );
    expect(requeuedCount).toBe(1);
    const healed = await testDb.outbox.get([`students__${classId}`, `s_${sLocalMissingInCloud}`]);
    expect(healed?.op).toBe('put');
  });

  it('keeps a remote photo pending when photo__<id> arrives before students__<classId>, then attaches it when the student arrives (fix 2)', async () => {
    const classId = 10001;
    const studentId = 20002;
    const sampleDataUrl = 'data:image/jpeg;base64,SGVsbG8=';

    // 1. Photo arrives BEFORE student exists locally
    await applyRemoteDocToDexie(testDb, `photo__${studentId}`, {
      kind: 'photo',
      schemaVersion: 1,
      rows: {
        [`p_${studentId}`]: {
          studentId,
          classId,
          dataUrl: sampleDataUrl,
          updatedAt: 1732000000000,
        },
      },
    });

    const pendingRow = await testDb.settings.get(SYNC_PENDING_PHOTOS_KEY);
    expect((pendingRow?.value as Record<string, unknown>)?.[String(studentId)]).toBeDefined();

    // 2. Later, student doc arrives -> photo is attached and removed from syncPendingPhotos
    await applyRemoteDocToDexie(testDb, `students__${classId}`, {
      kind: 'students',
      schemaVersion: 1,
      rows: {
        [`s_${studentId}`]: {
          id: studentId,
          classId,
          order: 1,
          studentId: 'S001',
          nameKm: 'សិស្ស រូបមកមុន',
          gender: 'ស្រី',
          dateOfBirth: '2013-05-05',
          status: 'active',
          createdAt: 1732000000000,
          updatedAt: 1732000000000,
        },
      },
    });

    const student = await testDb.students.get(studentId);
    expect(student?.photoBlob).toBeDefined();
    expect(student?.photoBlob?.size).toBe(5);
    expect(await testDb.settings.get(SYNC_PENDING_PHOTOS_KEY)).toBeUndefined();
  });

  it('estimateFullDocBytes checks the whole document size (existing local rows + incoming row), not just the new row (fix 5)', async () => {
    const classId = await testDb.classes.add({
      name: '8A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1732000000000,
    });
    const bigNote = 'A'.repeat(500 * 1024); // 500 KB existing row
    await testDb.monthlyScores.put({
      classId,
      studentRef: 1,
      month: '2026-11',
      scores: { math: 90 },
      note: bigNote,
    });

    // New row alone is 450 KB (< 900 KB), but combined with existing 500 KB row it exceeds 900 KB!
    const newRow = {
      classId,
      studentRef: 2,
      month: '2026-11',
      scores: { math: 85 },
      note: 'B'.repeat(450 * 1024),
    };
    const totalBytes = await estimateFullDocBytes(
      testDb,
      `ms__${classId}__2026-11`,
      [{ rowKey: 'm_2', firestoreValue: newRow }],
      'device-A'
    );
    expect(totalBytes).toBeGreaterThan(MAX_SYNC_DOC_BYTES);
  });

  it('disables outbox recording on legacy KruDeskDB while enabling it on KruDeskDB_<uid> and keeping §5 import working (fix C)', async () => {
    const legacyDb = new KruDeskDatabase(LEGACY_DB_NAME);
    const userDb = new KruDeskDatabase(`KruDeskDB_uid_import_${Date.now()}`);
    await Promise.all([legacyDb.open(), userDb.open()]);
    await Promise.all([clearAllAppData(legacyDb), clearAllAppData(userDb)]);

    try {
      expect(legacyDb.outboxEnabled).toBe(false);
      expect(userDb.outboxEnabled).toBe(true);

      // Writes to legacy KruDeskDB must NOT populate legacy outbox
      await legacyDb.classes.add({
        name: '8A-Legacy',
        gradeLevel: 8,
        academicYear: '2026-2027',
        color: '#0071e3',
        subjects: [],
        createdAt: 1732000000000,
      });
      await legacyDb.settings.put({ key: 'documentPlace', value: 'ភ្នំពេញ' });
      expect(await legacyDb.outbox.count()).toBe(0);

      // §5 import: export from legacy KruDeskDB -> restore into KruDeskDB_<uid>
      const payload = await buildBackupPayload(1732000001000, legacyDb);
      await restoreBackupPayload(payload, 'replace', userDb);

      expect(await userDb.classes.count()).toBe(1);
      expect(await userDb.outbox.count()).toBeGreaterThanOrEqual(2);
      expect(await userDb.settings.get(SYNC_PENDING_FULL_REPLACE_KEY)).toBeDefined();
      expect(await legacyDb.outbox.count()).toBe(0);
    } finally {
      await Promise.all([clearAllAppData(legacyDb), clearAllAppData(userDb)]);
      legacyDb.close();
      userDb.close();
    }
  });

  it('rawBlobToDataUrl rejects cleanly on corrupted/non-Blob objects (fix A)', async () => {
    await expect(rawBlobToDataUrl({} as unknown as Blob)).rejects.toThrow();
    await expect(rawBlobToDataUrl(null as unknown as Blob)).rejects.toThrow();
  });

  it('keeps syncLastDailySnapshotDay strictly local (not synced, not in backups, preserved on replace restore)', async () => {
    expect(isInternalSyncSettingKey(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY)).toBe(true);
    expect(isSyncedSettingKey(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY)).toBe(false);

    await testDb.settings.put({
      key: SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY,
      value: '2026-11-21',
    });
    expect(await testDb.outbox.count()).toBe(0);

    const payload = await buildBackupPayload(1732176000000, testDb);
    expect(
      payload.data.settings.some((s) => s.key === SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY)
    ).toBe(false);

    await restoreBackupPayload(payload, 'replace', testDb);
    const preserved = await testDb.settings.get(SYNC_LAST_DAILY_SNAPSHOT_DAY_KEY);
    expect(preserved?.value).toBe('2026-11-21');
  });

  it('identifies tombstones older than 90 days and keeps syncLastPullWallAt strictly local', () => {
    const now = 1_800_000_000_000;
    const oldTombstone = makeTombstone(now - TOMBSTONE_RETENTION_MS - 1_000);
    const freshTombstone = makeTombstone(now - TOMBSTONE_RETENTION_MS + 60_000);

    expect(isExpiredTombstone(oldTombstone, now)).toBe(true);
    expect(isExpiredTombstone(freshTombstone, now)).toBe(false);
    expect(isExpiredTombstone({ id: 1, name: 'live' }, now)).toBe(false);

    expect(isInternalSyncSettingKey(SYNC_LAST_PULL_WALL_AT_KEY)).toBe(true);
    expect(isSyncedSettingKey(SYNC_LAST_PULL_WALL_AT_KEY)).toBe(false);
  });
});
