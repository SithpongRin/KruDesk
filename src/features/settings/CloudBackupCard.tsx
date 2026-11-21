import React, { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  CloudUpload,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  WifiOff,
} from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../auth/useAuthStore';
import { isFirebaseConfigured } from '../../services/firebase/client';
import {
  buildBackupPayload,
  restoreBackupPayload,
  type KruDeskBackupPayload,
  type RestoreMode,
} from '../../services/backup';
import type {
  CloudSnapshotMeta,
  CloudSnapshotSource,
} from '../../services/sync/cloudSnapshot';
import { getActiveSyncEngine, useSyncStore } from '../../services/sync/useSyncStore';
import { formatDateTimeKm } from '../../lib/khmerDate';
import { formatBytes } from '../../utils/formatters';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { BackupRestoreModal } from '../../components/common/BackupRestoreModal';

const MAX_DISPLAY_SNAPSHOTS = 10;

export function getCloudSnapshotSourceMeta(source: CloudSnapshotSource): {
  label: string;
  variant: 'blue' | 'green' | 'orange';
} {
  switch (source) {
    case 'daily':
      return { label: 'ប្រចាំថ្ងៃ', variant: 'blue' };
    case 'manual':
      return { label: 'ដោយដៃ', variant: 'green' };
    case 'pre-replace-device':
      return { label: 'មុនជំនួស (ឧបករណ៍)', variant: 'orange' };
    case 'pre-replace-cloud':
      return { label: 'មុនជំនួស (Cloud)', variant: 'orange' };
  }
}

export interface CloudBackupCardProps {
  /** Optional overrides for tests (production uses real Firebase Firestore + cloudSnapshot). */
  uidOverride?: string;
  listSnapshotsFn?: (uid: string) => Promise<CloudSnapshotMeta[]>;
  createManualSnapshotFn?: (
    uid: string,
    existing: CloudSnapshotMeta[]
  ) => Promise<CloudSnapshotMeta>;
  readSnapshotFn?: (uid: string, backupId: string) => Promise<KruDeskBackupPayload>;
  onAfterRestore?: () => Promise<void>;
}

async function defaultListSnapshots(uid: string): Promise<CloudSnapshotMeta[]> {
  const [{ getFirebaseServices }, { listCloudSnapshots }] = await Promise.all([
    import('../../services/firebase/client'),
    import('../../services/sync/cloudSnapshot'),
  ]);
  const { firestore } = await getFirebaseServices();
  return listCloudSnapshots(firestore, uid);
}

async function defaultCreateManualSnapshot(
  uid: string,
  existing: CloudSnapshotMeta[]
): Promise<CloudSnapshotMeta> {
  const [
    { getFirebaseServices },
    { MAX_CLOUD_SNAPSHOTS, saveBackupPayloadToCloudSnapshot, pruneOldCloudSnapshots },
  ] = await Promise.all([
    import('../../services/firebase/client'),
    import('../../services/sync/cloudSnapshot'),
  ]);
  const { firestore } = await getFirebaseServices();
  const now = Date.now();
  const payload = await buildBackupPayload(now, db);
  const meta = await saveBackupPayloadToCloudSnapshot(firestore, uid, payload, 'manual', { now });
  try {
    await pruneOldCloudSnapshots(firestore, uid, MAX_CLOUD_SNAPSHOTS, [meta, ...existing]);
  } catch (err) {
    console.warn('[CloudBackupCard] Failed to prune old snapshots after manual backup:', err);
  }
  return meta;
}

async function defaultReadSnapshot(uid: string, backupId: string): Promise<KruDeskBackupPayload> {
  const [{ getFirebaseServices }, { readCloudSnapshotPayload }] = await Promise.all([
    import('../../services/firebase/client'),
    import('../../services/sync/cloudSnapshot'),
  ]);
  const { firestore } = await getFirebaseServices();
  return readCloudSnapshotPayload(firestore, uid, backupId);
}

export const CloudBackupCard: React.FC<CloudBackupCardProps> = ({
  uidOverride,
  listSnapshotsFn = defaultListSnapshots,
  createManualSnapshotFn = defaultCreateManualSnapshot,
  readSnapshotFn = defaultReadSnapshot,
  onAfterRestore,
}) => {
  const authUid = useAuthStore((s) => s.user?.uid ?? null);
  const uid = uidOverride ?? authUid;
  const syncStatusState = useSyncStore((s) => s.status.state);
  const { useKhmerNumerals, hydratePreferences, addToast } = useAppStore();

  const [snapshots, setSnapshots] = useState<CloudSnapshotMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [readingBackupId, setReadingBackupId] = useState<string | null>(null);

  const [pendingPayload, setPendingPayload] = useState<KruDeskBackupPayload | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');

  const isOffline =
    syncStatusState === 'offline' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false);

  const fmtNum = (v: number | string) => (useKhmerNumerals ? toKhmerNumerals(v) : String(v));

  const fetchSnapshots = useCallback(async () => {
    if (!uid) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await listSnapshotsFn(uid);
      setSnapshots(list);
    } catch (err) {
      console.error('[CloudBackupCard] Failed to list cloud snapshots:', err);
      setLoadError(
        err instanceof Error
          ? err.message
          : 'មិនអាចទាញបញ្ជី Cloud Backup បានទេ។ សូមពិនិត្យអ៊ីនធឺណិត រួចព្យាយាមម្ដងទៀត។'
      );
    } finally {
      setIsLoading(false);
    }
  }, [uid, listSnapshotsFn]);

  useEffect(() => {
    if (!uid || isOffline) return;
    void fetchSnapshots();
  }, [uid, isOffline, fetchSnapshots]);

  if (!uid || (!uidOverride && !isFirebaseConfigured())) {
    return null;
  }

  const handleManualBackup = async () => {
    if (!uid || isOffline) return;
    setIsCreatingManual(true);
    try {
      const savedMeta = await createManualSnapshotFn(uid, snapshots);
      setSnapshots((prev) =>
        [savedMeta, ...prev.filter((s) => s.backupId !== savedMeta.backupId)]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, MAX_DISPLAY_SNAPSHOTS)
      );
      addToast({
        type: 'success',
        title: 'បម្រុងទុកទៅ Cloud ជោគជ័យ!',
        message: `បានរក្សាទុក ${fmtNum(savedMeta.classCount)} ថ្នាក់ · សិស្ស ${fmtNum(savedMeta.studentCount)} នាក់ (${formatBytes(savedMeta.sizeBytes)})`,
      });
    } catch (err) {
      console.error('[CloudBackupCard] Manual backup failed:', err);
      addToast({
        type: 'error',
        title: 'បម្រុងទុកទៅ Cloud មិនបានសម្រេច',
        message: err instanceof Error ? err.message : 'សូមពិនិត្យអ៊ីនធឺណិត រួចព្យាយាមម្ដងទៀត។',
      });
    } finally {
      setIsCreatingManual(false);
    }
  };

  const handleSelectRestore = async (snap: CloudSnapshotMeta) => {
    if (!uid || isOffline) return;
    setReadingBackupId(snap.backupId);
    try {
      const payload = await readSnapshotFn(uid, snap.backupId);
      const srcLabel = getCloudSnapshotSourceMeta(snap.source).label;
      setPendingPayload(payload);
      setPendingLabel(`Cloud Backup (${srcLabel}) — ${formatDateTimeKm(snap.createdAt, useKhmerNumerals)}`);
    } catch (err) {
      console.error('[CloudBackupCard] Failed to read cloud snapshot:', err);
      addToast({
        type: 'error',
        title: 'មិនអាចអាន Cloud Backup បានទេ',
        message: err instanceof Error ? err.message : 'ឯកសារបម្រុងទុកមានបញ្ហា ឬបាត់ផ្នែកខ្លះ។',
      });
    } finally {
      setReadingBackupId(null);
    }
  };

  const handleConfirmRestore = async (_mode: RestoreMode) => {
    if (!pendingPayload) return;
    const summary = await restoreBackupPayload(pendingPayload, 'replace', db);
    await hydratePreferences();
    if (onAfterRestore) {
      await onAfterRestore();
    } else {
      // Trigger pushFullReplace immediately so every device on this account updates without delay
      const engine = getActiveSyncEngine();
      if (engine) {
        void engine.pushOutbox().catch((err) => {
          console.warn('[CloudBackupCard] Immediate push after restore failed (will retry):', err);
        });
      }
    }
    addToast({
      type: 'success',
      title: 'ស្ដារពី Cloud Backup ជោគជ័យ!',
      message: `បានស្ដារ ${fmtNum(summary.classesCount)} ថ្នាក់ និងសិស្ស ${fmtNum(summary.studentsCount)} នាក់ (កំពុងធ្វើបច្ចុប្បន្នភាពទៅឧបករណ៍ទាំងអស់)។`,
    });
  };

  return (
    <>
      <AppleCard
        title="ស្ដារពី Cloud Backup"
        subtitle="ប្រព័ន្ធបម្រុងទុកលើ Cloud ដោយស្វ័យប្រវត្តិ ១ ដង/ថ្ងៃ (រក្សាទុក ១០ ច្បាប់ចុងក្រោយ)"
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            <AppleButton
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
              onClick={() => void fetchSnapshots()}
              disabled={isLoading || isOffline}
            >
              ផ្ទុកឡើងវិញ
            </AppleButton>
            <AppleButton
              variant="primary"
              size="sm"
              icon={
                isCreatingManual ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CloudUpload size={14} />
                )
              }
              onClick={() => void handleManualBackup()}
              disabled={isCreatingManual || isOffline}
            >
              {isCreatingManual ? 'កំពុងបម្រុងទុក...' : 'បម្រុងទុកឥឡូវ'}
            </AppleButton>
          </div>
        }
      >
        <div className="space-y-3">
          {isOffline && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <WifiOff size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>គ្មានអ៊ីនធឺណិត — សូមភ្ជាប់អ៊ីនធឺណិតដើម្បីមើល បម្រុងទុក ឬស្ដារ Cloud Backup។</span>
            </div>
          )}

          {loadError && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-red-800 dark:text-red-200">
              <span>{loadError}</span>
              <AppleButton variant="secondary" size="sm" onClick={() => void fetchSnapshots()}>
                ព្យាយាមម្ដងទៀត
              </AppleButton>
            </div>
          )}

          {isLoading && snapshots.length === 0 ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#86868b]">
              <Loader2 size={16} className="animate-spin text-[#0071e3]" />
              <span>កំពុងទាញបញ្ជី Cloud Backup...</span>
            </div>
          ) : snapshots.length === 0 && !loadError ? (
            <div className="p-4 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.04] flex items-start gap-3 text-xs text-[#6e6e73] dark:text-[#98989d]">
              <Cloud size={18} className="text-[#0071e3] shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                មិនទាន់មាន Cloud Backup នៅឡើយទេ — កម្មវិធីនឹងបម្រុងទុកដោយស្វ័យប្រវត្តិ ១ ដងក្នុង ១ ថ្ងៃ
                ឬលោកគ្រូអាចចុច <strong>«បម្រុងទុកឥឡូវ»</strong> ដើម្បីរក្សាទុកភ្លាមៗ។
              </div>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] overflow-hidden">
              {snapshots.map((snap) => {
                const srcMeta = getCloudSnapshotSourceMeta(snap.source);
                const isReadingThis = readingBackupId === snap.backupId;
                return (
                  <div
                    key={snap.backupId}
                    data-testid={`cloud-snapshot-${snap.backupId}`}
                    className="px-4 py-3 bg-white dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <History size={14} className="text-[#86868b] shrink-0" />
                        <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {formatDateTimeKm(snap.createdAt, useKhmerNumerals)}
                        </span>
                        <AppleBadge variant={srcMeta.variant} size="sm">
                          {srcMeta.label}
                        </AppleBadge>
                      </div>
                      <div className="text-[11px] text-[#6e6e73] dark:text-[#98989d] flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5">
                        <span>{fmtNum(snap.classCount)} ថ្នាក់</span>
                        <span>·</span>
                        <span>សិស្ស {fmtNum(snap.studentCount)} នាក់</span>
                        <span>·</span>
                        <span>{formatBytes(snap.sizeBytes)}</span>
                      </div>
                    </div>

                    <AppleButton
                      variant="secondary"
                      size="sm"
                      icon={
                        isReadingThis ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )
                      }
                      onClick={() => void handleSelectRestore(snap)}
                      disabled={isOffline || readingBackupId !== null}
                    >
                      {isReadingThis ? 'កំពុងទាញ...' : 'ស្ដារ'}
                    </AppleButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppleCard>

      {/* Reuse the exact same confirm dialog as JSON restore (replace-only with every-device warning) */}
      <BackupRestoreModal
        isOpen={pendingPayload !== null}
        onClose={() => setPendingPayload(null)}
        payload={pendingPayload}
        fileName={pendingLabel}
        onConfirmRestore={handleConfirmRestore}
        allowMerge={false}
      />
    </>
  );
};
