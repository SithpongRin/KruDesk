import React from 'react';
import { AdminUsersCard } from './AdminUsersCard';
import { useAuthStore } from './useAuthStore';

export const AdminUsersView: React.FC = () => {
  const { isAdmin } = useAuthStore();

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
          គ្រប់គ្រងអ្នកប្រើ
        </h1>
        <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
          ពិនិត្យ និងគ្រប់គ្រងសិទ្ធិគណនី Google របស់គ្រូដែលស្នើសុំចូលប្រើប្រាស់ KruDesk
        </p>
      </div>

      <AdminUsersCard />
    </div>
  );
};

export default AdminUsersView;
