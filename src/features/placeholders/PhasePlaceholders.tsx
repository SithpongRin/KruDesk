import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardList,
  CreditCard,
} from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { useAppStore } from '../../store/useAppStore';

export const DashboardPlaceholder: React.FC = () => {
  const setActiveView = useAppStore((s) => s.setActiveView);
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <EmptyState
        icon={<LayoutDashboard size={28} />}
        title="ផ្ទាំងដើម (Dashboard)"
        hint="សង្ខេបចំនួនថ្នាក់ សិស្ស ប្រុស/ស្រី អវត្តមានថ្ងៃនេះ និងការរំលឹក Backup នឹងត្រូវបន្ថែមនៅដំណាក់កាលបន្ទាប់។"
        actionLabel="ទៅកាន់ការកំណត់ & Backup"
        onAction={() => setActiveView('settings')}
      />
    </div>
  );
};

export const StudentsPlaceholder: React.FC = () => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
    <EmptyState
      icon={<Users size={28} />}
      title="គ្រប់គ្រងថ្នាក់ និងសិស្ស"
      hint="មុខងារបង្កើតថ្នាក់ បញ្ចូល/កែសិស្ស និងនាំចូលពី Excel នឹងរួចរាល់នៅដំណាក់កាលទី ២។"
    />
  </div>
);

export const AttendancePlaceholder: React.FC = () => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
    <EmptyState
      icon={<CalendarCheck size={28} />}
      title="បញ្ជីហៅឈ្មោះ"
      hint="តារាងវត្តមានប្រចាំខែ បោះពុម្ព A4 និង Export Excel/PDF នឹងរួចរាល់នៅដំណាក់កាលទី ៣។"
    />
  </div>
);

export const ScoresPlaceholder: React.FC = () => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
    <EmptyState
      icon={<ClipboardList size={28} />}
      title="បញ្ជីពិន្ទុ"
      hint="ពិន្ទុប្រចាំខែ ប្រឡងឆមាស និងតារាងស្រង់ពិន្ទុប្រចាំឆមាស/ឆ្នាំ នឹងរួចរាល់នៅដំណាក់កាលទី ៤។"
    />
  </div>
);

export const CardsPlaceholder: React.FC = () => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
    <EmptyState
      icon={<CreditCard size={28} />}
      title="កាតសិស្ស"
      hint="ម៉ូឌុលបង្កើត និងបោះពុម្ពកាតសិស្ស A4 300 DPI នឹងរួចរាល់នៅដំណាក់កាលទី ៥។"
    />
  </div>
);
