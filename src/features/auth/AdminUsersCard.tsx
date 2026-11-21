import React, { useState } from 'react';
import { ShieldCheck, Check, X, PauseCircle, RotateCcw, Users } from 'lucide-react';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleButton } from '../../components/common/AppleButton';
import { formatDateTimeKm } from '../../lib/khmerDate';
import { useAppStore } from '../../store/useAppStore';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import type { UserApprovalStatus } from './authCache';
import { updateUserApprovalStatus, type ManagedUserRecord } from './authService';
import { useAuthStore } from './useAuthStore';

type AdminTab = 'pending' | 'approved' | 'blocked';

export const AdminUsersCard: React.FC = () => {
  const { isAdmin, user, managedUsers } = useAuthStore();
  const { addToast, useKhmerNumerals } = useAppStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('pending');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  if (!isAdmin || !user) {
    return null;
  }

  const formatCount = (n: number) => (useKhmerNumerals ? toKhmerNumerals(n) : String(n));

  const pendingUsers = managedUsers.filter((u) => u.status === 'pending');
  const approvedUsers = managedUsers.filter((u) => u.status === 'approved');
  const blockedUsers = managedUsers.filter(
    (u) => u.status === 'rejected' || u.status === 'disabled'
  );

  const visibleUsers =
    activeTab === 'pending'
      ? pendingUsers
      : activeTab === 'approved'
        ? approvedUsers
        : blockedUsers;

  const isOwnAdminRow = (row: ManagedUserRecord): boolean => {
    if (row.uid === user.uid) return true;
    if (row.email && user.email && row.email.toLowerCase() === user.email.toLowerCase()) {
      return true;
    }
    return false;
  };

  const handleStatusChange = async (row: ManagedUserRecord, nextStatus: UserApprovalStatus) => {
    if (isOwnAdminRow(row)) return;
    setBusyUid(row.uid);
    try {
      await updateUserApprovalStatus(row.uid, nextStatus, user.email);
      const statusText =
        nextStatus === 'approved'
          ? 'បានអនុញ្ញាត'
          : nextStatus === 'rejected'
            ? 'បានបដិសេធ'
            : nextStatus === 'disabled'
              ? 'បានផ្អាក'
              : 'រង់ចាំ';
      addToast({
        type: 'success',
        title: `${statusText}គណនីជោគជ័យ`,
        message: `${row.displayName || row.email}`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'មិនអាចកែប្រែស្ថានភាពគណនីបានទេ',
        message: err instanceof Error ? err.message : 'មានបញ្ហាកើតឡើង',
      });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <AppleCard
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck size={17} className="text-[#0071e3]" />
          <span>គ្រប់គ្រងអ្នកប្រើ</span>
        </span>
      }
      subtitle="អនុញ្ញាត បដិសេធ ឬផ្អាកគណនីគ្រូដែលស្នើសុំចូលប្រើប្រាស់ KruDesk"
      headerAction={
        pendingUsers.length > 0 ? (
          <AppleBadge variant="orange" size="sm">
            រង់ចាំ {formatCount(pendingUsers.length)}
          </AppleBadge>
        ) : (
          <AppleBadge variant="green" size="sm">
            គ្មានសំណើរង់ចាំ
          </AppleBadge>
        )
      }
    >
      <div className="space-y-4">
        {/* Tabs: «រង់ចាំ» · «បានអនុញ្ញាត» · «បានបដិសេធ/ផ្អាក» */}
        <div
          role="tablist"
          aria-label="ផ្ទាំងគ្រប់គ្រងអ្នកប្រើ"
          className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08]"
        >
          {(
            [
              { id: 'pending' as const, label: 'រង់ចាំ', count: pendingUsers.length },
              { id: 'approved' as const, label: 'បានអនុញ្ញាត', count: approvedUsers.length },
              { id: 'blocked' as const, label: 'បានបដិសេធ/ផ្អាក', count: blockedUsers.length },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  active
                    ? 'bg-white dark:bg-[#2c2c2e] text-[#0071e3] shadow-sm'
                    : 'text-[#6e6e73] dark:text-[#98989d] hover:text-[#1d1d1f] dark:hover:text-white'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    active
                      ? 'bg-[#0071e3]/10 text-[#0071e3]'
                      : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#6e6e73] dark:text-[#98989d]'
                  }`}
                >
                  {formatCount(tab.count)}
                </span>
              </button>
            );
          })}
        </div>

        {/* User rows */}
        {visibleUsers.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#86868b] dark:text-[#98989d] flex flex-col items-center gap-2">
            <Users size={22} className="text-[#86868b]/60" />
            <span>មិនមានគណនីនៅក្នុងផ្ទាំងនេះទេ។</span>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.08]">
            {visibleUsers.map((row) => {
              const isOwn = isOwnAdminRow(row);
              const isBusy = busyUid === row.uid;

              return (
                <div
                  key={row.uid}
                  className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {row.photoURL ? (
                      <img
                        src={row.photoURL}
                        alt={row.displayName || row.email}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-black/[0.08] dark:border-white/[0.1]"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#0071e3]/15 text-[#0071e3] font-bold text-sm flex items-center justify-center shrink-0">
                        {(row.displayName || row.email || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                          {row.displayName || row.email}
                        </span>
                        {isOwn && (
                          <AppleBadge variant="blue" size="sm">
                            Admin
                          </AppleBadge>
                        )}
                        {row.status === 'rejected' && (
                          <AppleBadge variant="red" size="sm">
                            បានបដិសេធ
                          </AppleBadge>
                        )}
                        {row.status === 'disabled' && (
                          <AppleBadge variant="orange" size="sm">
                            បានផ្អាក
                          </AppleBadge>
                        )}
                      </div>
                      <div className="text-xs text-[#6e6e73] dark:text-[#98989d] truncate">
                        {row.email}
                      </div>
                      {row.createdAtMs && (
                        <div className="text-[11px] text-[#86868b] dark:text-[#86868b] mt-0.5">
                          ស្នើសុំនៅ៖ {formatDateTimeKm(row.createdAtMs)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons — hidden on the Admin's own row (§3.2 note) */}
                  {!isOwn && (
                    <div className="flex items-center gap-2 shrink-0">
                      {row.status === 'pending' && (
                        <>
                          <AppleButton
                            variant="primary"
                            size="sm"
                            icon={<Check size={14} />}
                            disabled={isBusy}
                            onClick={() => void handleStatusChange(row, 'approved')}
                          >
                            អនុញ្ញាត
                          </AppleButton>
                          <AppleButton
                            variant="danger"
                            size="sm"
                            icon={<X size={14} />}
                            disabled={isBusy}
                            onClick={() => void handleStatusChange(row, 'rejected')}
                          >
                            បដិសេធ
                          </AppleButton>
                        </>
                      )}

                      {row.status === 'approved' && (
                        <AppleButton
                          variant="secondary"
                          size="sm"
                          icon={<PauseCircle size={14} />}
                          disabled={isBusy}
                          onClick={() => void handleStatusChange(row, 'disabled')}
                        >
                          ផ្អាក
                        </AppleButton>
                      )}

                      {(row.status === 'rejected' || row.status === 'disabled') && (
                        <AppleButton
                          variant="primary"
                          size="sm"
                          icon={<RotateCcw size={14} />}
                          disabled={isBusy}
                          onClick={() => void handleStatusChange(row, 'approved')}
                        >
                          បើកវិញ
                        </AppleButton>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppleCard>
  );
};

export default AdminUsersCard;
