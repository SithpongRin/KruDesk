import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import JSZip from 'jszip';
import {
  BACKUP_SCHEMA_VERSION,
  parseAndValidateBackup,
  type KruDeskBackupPayload,
} from '../backup';
import type {
  AppSetting,
  Attendance,
  AttendanceSession,
  Holiday,
  MonthlyScore,
  SchoolClass,
  SemesterExam,
  Student,
} from '../../types/domain';
import type { CardTemplate } from '../../types/template';
import {
  getDocKindFromId,
  isInternalSyncSettingKey,
  isSyncTombstone,
  type SyncAbsenceRow,
  type SyncAttendanceSessionRow,
  type SyncPhotoRow,
} from './syncCodec';

/** Keep every Firestore backup chunk safely below the 1 MiB document limit (§6 / Step 4). */
export const MAX_BACKUP_CHUNK_CHARS = 700 * 1024;

/** Maximum number of Cloud snapshots retained per user (§1.7 / Step 6a). */
export const MAX_CLOUD_SNAPSHOTS = 10;

export type CloudSnapshotSource = 'pre-replace-cloud' | 'pre-replace-device' | 'daily' | 'manual';

export interface CloudSnapshotMeta {
  backupId: string;
  createdAt: number;
  schemaVersion: number;
  appCommit: string;
  sizeBytes: number;
  chunkCount: number;
  classCount: number;
  studentCount: number;
  sha256: string;
  compression: 'gzip' | 'zip';
  source: CloudSnapshotSource;
}

function getAppCommitSafe(): string {
  try {
    return typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev';
  } catch {
    return 'dev';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hex digest if WebCrypto subtle is unavailable
  let h1 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i]!;
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

async function compressUtf8(json: string): Promise<{ bytes: Uint8Array; compression: 'gzip' | 'zip' }> {
  const inputBytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      const writePromise = writer.write(inputBytes).then(() => writer.close());
      const reader = cs.readable.getReader();
      const parts: Uint8Array[] = [];
      let totalLength = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          parts.push(value);
          totalLength += value.byteLength;
        }
      }
      await writePromise;
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const p of parts) {
        merged.set(p, offset);
        offset += p.byteLength;
      }
      return { bytes: merged, compression: 'gzip' };
    } catch {
      // Fall back to JSZip deflate below
    }
  }

  const zip = new JSZip();
  zip.file('backup.json', inputBytes);
  const zipped = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { bytes: zipped, compression: 'zip' };
}

async function decompressUtf8(bytes: Uint8Array, compression: 'gzip' | 'zip'): Promise<string> {
  if (compression === 'gzip') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Browser does not support gzip decompression');
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const writePromise = writer.write(copy).then(() => writer.close());
    const reader = ds.readable.getReader();
    const parts: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        totalLength += value.byteLength;
      }
    }
    await writePromise;
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const p of parts) {
      merged.set(p, offset);
      offset += p.byteLength;
    }
    return new TextDecoder().decode(merged);
  }

  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file('backup.json');
  if (!file) {
    throw new Error('Invalid zip cloud snapshot: missing backup.json');
  }
  return file.async('string');
}

/**
 * Reconstructs a valid KruDesk v3 backup payload directly from Firestore `users/{uid}/docs/*`
 * (ignoring tombstones and attaching `photo__<id>` data URLs onto matching students).
 */
export async function buildBackupPayloadFromCloudDocs(
  firestore: Firestore,
  uid: string,
  now: number = Date.now()
): Promise<KruDeskBackupPayload> {
  const snapshot = await getDocs(collection(firestore, 'users', uid, 'docs'));

  const settings: AppSetting[] = [];
  const classes: SchoolClass[] = [];
  const rawStudents: Array<Omit<Student, 'photoBlob'> & { id: number }> = [];
  const photoByStudentId = new Map<number, string>();
  const attendance: Attendance[] = [];
  const attendanceSessions: AttendanceSession[] = [];
  const holidays: Holiday[] = [];
  const monthlyScores: MonthlyScore[] = [];
  const semesterExams: SemesterExam[] = [];
  const templates: CardTemplate[] = [];

  for (const docSnap of snapshot.docs) {
    const docId = docSnap.id;
    let kind: ReturnType<typeof getDocKindFromId>;
    try {
      kind = getDocKindFromId(docId);
    } catch {
      continue;
    }
    const data = docSnap.data() as Record<string, unknown>;
    const rows =
      data.rows && typeof data.rows === 'object' ? (data.rows as Record<string, unknown>) : {};

    switch (kind) {
      case 'setting': {
        const key = docId.slice('settings__'.length);
        if (isInternalSyncSettingKey(key)) break;
        const val = rows['v'];
        if (!val || isSyncTombstone(val) || typeof val !== 'object') break;
        const entry = val as { key?: string; value?: unknown };
        if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
          settings.push({ key, value: entry.value });
        }
        break;
      }

      case 'class': {
        const classId = Number(docId.slice('class__'.length));
        const val = rows[`c_${classId}`];
        if (!val || isSyncTombstone(val) || typeof val !== 'object') break;
        classes.push({ ...(val as SchoolClass), id: classId });
        break;
      }

      case 'students': {
        const classId = Number(docId.slice('students__'.length));
        for (const [rk, val] of Object.entries(rows)) {
          if (!rk.startsWith('s_') || !val || isSyncTombstone(val) || typeof val !== 'object') {
            continue;
          }
          const st = val as Student;
          const id = typeof st.id === 'number' ? st.id : Number(rk.slice(2));
          if (!Number.isFinite(id)) continue;
          rawStudents.push({ ...st, id, classId });
        }
        break;
      }

      case 'photo': {
        const studentId = Number(docId.slice('photo__'.length));
        const val = rows[`p_${studentId}`];
        if (!val || isSyncTombstone(val) || typeof val !== 'object') break;
        const photoRow = val as SyncPhotoRow;
        if (photoRow.dataUrl) {
          photoByStudentId.set(studentId, photoRow.dataUrl);
        }
        break;
      }

      case 'attendance': {
        for (const [rk, val] of Object.entries(rows)) {
          if (!val || isSyncTombstone(val) || typeof val !== 'object') continue;
          if (rk.startsWith('a_')) {
            const a = val as SyncAbsenceRow;
            attendance.push({
              classId: a.classId,
              studentRef: a.studentRef,
              date: a.date,
              status: a.status,
            });
          } else if (rk.startsWith('sess_')) {
            const s = val as SyncAttendanceSessionRow;
            attendanceSessions.push({
              classId: s.classId,
              date: s.date,
              savedAt: s.savedAt,
              ...(s.migrated ? { migrated: true } : {}),
            });
          }
        }
        break;
      }

      case 'monthlyScores': {
        for (const [rk, val] of Object.entries(rows)) {
          if (!rk.startsWith('m_') || !val || isSyncTombstone(val) || typeof val !== 'object') {
            continue;
          }
          monthlyScores.push(val as MonthlyScore);
        }
        break;
      }

      case 'semesterExams': {
        for (const [rk, val] of Object.entries(rows)) {
          if (!rk.startsWith('e_') || !val || isSyncTombstone(val) || typeof val !== 'object') {
            continue;
          }
          semesterExams.push(val as SemesterExam);
        }
        break;
      }

      case 'holidays': {
        for (const [rk, val] of Object.entries(rows)) {
          if (!rk.startsWith('h_') || !val || isSyncTombstone(val) || typeof val !== 'object') {
            continue;
          }
          const h = val as Holiday;
          const id = typeof h.id === 'number' ? h.id : Number(rk.slice(2));
          if (!Number.isFinite(id)) continue;
          holidays.push({ ...h, id });
        }
        break;
      }

      case 'template': {
        for (const [rk, val] of Object.entries(rows)) {
          if (!rk.startsWith('t_') || !val || isSyncTombstone(val) || typeof val !== 'object') {
            continue;
          }
          templates.push(val as CardTemplate);
        }
        break;
      }
    }
  }

  const students = rawStudents.map((st) => {
    const photoBase64 = photoByStudentId.get(st.id);
    return {
      ...st,
      ...(photoBase64 ? { photoBase64 } : {}),
    };
  });

  return {
    appName: 'KruDesk',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    data: {
      settings: settings as unknown as KruDeskBackupPayload['data']['settings'],
      classes: classes as unknown as KruDeskBackupPayload['data']['classes'],
      students,
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

/**
 * Compresses a KruDesk backup payload (gzip, base64, chunks <= 700 KB) and writes it to
 * `users/{uid}/backups/{backupId}` — writing chunks FIRST and metadata LAST so an
 * interrupted upload is never listed as a complete backup (§6 / Step 4).
 */
export async function saveBackupPayloadToCloudSnapshot(
  firestore: Firestore,
  uid: string,
  payload: KruDeskBackupPayload,
  source: CloudSnapshotSource = 'manual',
  options?: { now?: number }
): Promise<CloudSnapshotMeta> {
  const now = options?.now ?? Date.now();
  const backupId = `snap_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const json = JSON.stringify(payload);
  const { bytes, compression } = await compressUtf8(json);
  const sha256 = await sha256Hex(bytes);
  const base64 = bytesToBase64(bytes);

  const chunks: string[] = [];
  for (let offset = 0; offset < base64.length; offset += MAX_BACKUP_CHUNK_CHARS) {
    chunks.push(base64.slice(offset, offset + MAX_BACKUP_CHUNK_CHARS));
  }
  if (chunks.length === 0) {
    chunks.push('');
  }

  // 1. Write chunks FIRST so a partial upload never appears in the meta list
  for (let i = 0; i < chunks.length; i++) {
    const chunkRef = doc(firestore, 'users', uid, 'backups', backupId, 'chunks', String(i));
    await setDoc(chunkRef, {
      index: i,
      data: chunks[i],
    });
  }

  // 2. Write backup metadata LAST
  const meta: CloudSnapshotMeta = {
    backupId,
    createdAt: now,
    schemaVersion: payload.schemaVersion,
    appCommit: getAppCommitSafe(),
    sizeBytes: bytes.byteLength,
    chunkCount: chunks.length,
    classCount: payload.data.classes.length,
    studentCount: payload.data.students.length,
    sha256,
    compression,
    source,
  };

  const metaRef = doc(firestore, 'users', uid, 'backups', backupId);
  await setDoc(metaRef, {
    ...meta,
    createdAtServer: serverTimestamp(),
  });

  return meta;
}

/**
 * Snapshots the user's current Cloud `users/{uid}/docs` state into `users/{uid}/backups/{backupId}`.
 */
export async function saveCloudSnapshotFromCloudDocs(
  firestore: Firestore,
  uid: string,
  source: CloudSnapshotSource = 'pre-replace-cloud'
): Promise<CloudSnapshotMeta> {
  const payload = await buildBackupPayloadFromCloudDocs(firestore, uid);
  return saveBackupPayloadToCloudSnapshot(firestore, uid, payload, source);
}

/**
 * Reads, reassembles, verifies SHA-256, decompresses, and validates a Cloud snapshot payload.
 */
export async function readCloudSnapshotPayload(
  firestore: Firestore,
  uid: string,
  backupId: string
): Promise<KruDeskBackupPayload> {
  const metaRef = doc(firestore, 'users', uid, 'backups', backupId);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) {
    throw new Error('រកមិនឃើញ Cloud Snapshot ទេ។');
  }
  const meta = metaSnap.data() as CloudSnapshotMeta;
  const chunkCount = Number(meta.chunkCount || 0);
  const parts: string[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const chunkSnap = await getDoc(
      doc(firestore, 'users', uid, 'backups', backupId, 'chunks', String(i))
    );
    if (!chunkSnap.exists()) {
      throw new Error(`បាត់បង់ផ្នែកទី ${i + 1} នៃ Cloud Snapshot។`);
    }
    parts.push(String(chunkSnap.data()?.data ?? ''));
  }

  const bytes = base64ToBytes(parts.join(''));
  const actualHash = await sha256Hex(bytes);
  if (meta.sha256 && actualHash !== meta.sha256) {
    throw new Error('Cloud Snapshot មិនត្រឹមត្រូវ (SHA-256 មិនត្រូវគ្នា)។');
  }

  const json = await decompressUtf8(bytes, meta.compression === 'zip' ? 'zip' : 'gzip');
  return parseAndValidateBackup(json);
}

/**
 * Lists all Cloud snapshot metadata documents for a user, newest first.
 * Cost: 1 Firestore query (reads only metadata docs, never chunks).
 */
export async function listCloudSnapshots(
  firestore: Firestore,
  uid: string
): Promise<CloudSnapshotMeta[]> {
  const q = query(
    collection(firestore, 'users', uid, 'backups'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  const validSources: ReadonlySet<string> = new Set<CloudSnapshotSource>([
    'daily',
    'manual',
    'pre-replace-cloud',
    'pre-replace-device',
  ]);

  return snap.docs.map((docSnap) => {
    const d = docSnap.data() as Record<string, unknown>;
    const rawSource = String(d.source ?? 'manual');
    const source: CloudSnapshotSource = validSources.has(rawSource)
      ? (rawSource as CloudSnapshotSource)
      : 'manual';
    return {
      backupId: typeof d.backupId === 'string' && d.backupId ? d.backupId : docSnap.id,
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
      schemaVersion: typeof d.schemaVersion === 'number' ? d.schemaVersion : BACKUP_SCHEMA_VERSION,
      appCommit: typeof d.appCommit === 'string' ? d.appCommit : 'unknown',
      sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
      chunkCount: typeof d.chunkCount === 'number' ? d.chunkCount : 0,
      classCount: typeof d.classCount === 'number' ? d.classCount : 0,
      studentCount: typeof d.studentCount === 'number' ? d.studentCount : 0,
      sha256: typeof d.sha256 === 'string' ? d.sha256 : '',
      compression: d.compression === 'zip' ? 'zip' : 'gzip',
      source,
    };
  });
}

/**
 * Deletes a Cloud snapshot's metadata document AND all of its chunk documents.
 * Uses known chunk IDs (`0..chunkCount-1`) when `chunkCount` is supplied (0 extra reads),
 * falling back to listing the `chunks` subcollection otherwise.
 * Metadata is deleted first (or in the first atomic batch) so a partial failure never leaves
 * a broken snapshot listed.
 */
export async function deleteCloudSnapshot(
  firestore: Firestore,
  uid: string,
  backupId: string,
  chunkCount?: number
): Promise<{ deletedDocsCount: number }> {
  const metaRef = doc(firestore, 'users', uid, 'backups', backupId);
  const refsToDelete = [metaRef];

  if (typeof chunkCount === 'number' && Number.isInteger(chunkCount) && chunkCount >= 0) {
    for (let i = 0; i < chunkCount; i++) {
      refsToDelete.push(doc(firestore, 'users', uid, 'backups', backupId, 'chunks', String(i)));
    }
  } else {
    const chunkSnap = await getDocs(
      collection(firestore, 'users', uid, 'backups', backupId, 'chunks')
    );
    for (const chunkDoc of chunkSnap.docs) {
      refsToDelete.push(chunkDoc.ref);
    }
  }

  const MAX_BATCH_OPS = 450;
  for (let i = 0; i < refsToDelete.length; i += MAX_BATCH_OPS) {
    const batch = writeBatch(firestore);
    const slice = refsToDelete.slice(i, i + MAX_BATCH_OPS);
    for (const ref of slice) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  return { deletedDocsCount: refsToDelete.length };
}

/**
 * Keeps only the newest `maxKeep` Cloud snapshots (default 10) for a user,
 * deleting older metadata docs AND all of their chunk docs.
 * Accepts an optional pre-fetched `existing` list to avoid an extra Firestore query.
 */
export async function pruneOldCloudSnapshots(
  firestore: Firestore,
  uid: string,
  maxKeep: number = MAX_CLOUD_SNAPSHOTS,
  existing?: CloudSnapshotMeta[]
): Promise<{ deletedBackupIds: string[]; deletedDocsCount: number }> {
  const snapshots = existing ? [...existing] : await listCloudSnapshots(firestore, uid);
  if (snapshots.length <= maxKeep) {
    return { deletedBackupIds: [], deletedDocsCount: 0 };
  }

  // Ensure newest-first order before slicing
  snapshots.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = snapshots.slice(Math.max(0, maxKeep));

  const deletedBackupIds: string[] = [];
  let deletedDocsCount = 0;

  for (const snap of toDelete) {
    const res = await deleteCloudSnapshot(firestore, uid, snap.backupId, snap.chunkCount);
    deletedBackupIds.push(snap.backupId);
    deletedDocsCount += res.deletedDocsCount;
  }

  return { deletedBackupIds, deletedDocsCount };
}
