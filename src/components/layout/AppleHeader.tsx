import React, { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Menu, Calendar, BookOpen } from 'lucide-react';
import { db } from '../../db/database';
import { useAppStore, type ActiveView } from '../../store/useAppStore';
import { KHMER_MONTHS, parseYearMonth } from '../../lib/khmerDate';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';

const VIEW_TITLES: Record<ActiveView, string> = {
  dashboard: 'ផ្ទាំងដើម',
  students: 'សិស្ស',
  roster: 'បញ្ជីហៅឈ្មោះ',
  attendance: 'បញ្ជីវត្តមាន',
  scores: 'បញ្ជីពិន្ទុ',
  monthlyResults: 'លទ្ធផលប្រចាំខែ',
  honorRoll: 'តារាងកិត្តិយស',
  certificates: 'ប័ណ្ណសរសើរ',
  cards: 'កាតសិស្ស',
  settings: 'ការកំណត់',
};

export const AppleHeader: React.FC = () => {
  const {
    activeView,
    selectedClassId,
    setSelectedClassId,
    selectedMonth,
    setSelectedMonth,
    useKhmerNumerals,
    toggleMobileSidebar,
  } = useAppStore();

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  // Ensure selectedClassId stays valid if classes exist
  useEffect(() => {
    if (!classes) return;
    if (classes.length === 0) {
      if (selectedClassId !== null) setSelectedClassId(null);
      return;
    }
    const exists = classes.some((c) => c.id === selectedClassId);
    if (!exists && classes[0]?.id !== undefined) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId, setSelectedClassId]);

  const { year, month } = parseYearMonth(selectedMonth);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);

  const handleMonthChange = (newMonth: number) => {
    const mStr = String(newMonth).padStart(2, '0');
    setSelectedMonth(`${year}-${mStr}`);
  };

  const handleYearChange = (newYear: number) => {
    const mStr = String(month).padStart(2, '0');
    setSelectedMonth(`${newYear}-${mStr}`);
  };

  const formatNum = (val: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  return (
    <header className="h-16 px-4 sm:px-6 lg:px-8 bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 sticky top-0 z-10 shrink-0 print:hidden">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={toggleMobileSidebar}
          className="md:hidden p-2 -ml-1 rounded-xl text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all shrink-0"
          aria-label="បើកម៉ឺនុយរុករក"
        >
          <Menu size={20} />
        </button>

        <h2 className="text-sm sm:text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] tracking-tight font-battambang truncate">
          {VIEW_TITLES[activeView]}
        </h2>
      </div>

      {/* Class picker & Month picker */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Class Picker */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#f5f5f7] dark:bg-white/[0.08] border border-black/[0.05] dark:border-white/[0.08]">
          <BookOpen size={14} className="text-[#0071e3] shrink-0" />
          <select
            aria-label="ជ្រើសថ្នាក់"
            value={selectedClassId ?? ''}
            onChange={(e) =>
              setSelectedClassId(e.target.value ? Number(e.target.value) : null)
            }
            className="bg-transparent text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none cursor-pointer max-w-[110px] sm:max-w-[160px] truncate"
          >
            {!classes || classes.length === 0 ? (
              <option value="" className="dark:bg-[#1c1c1e]">
                មិនទាន់មានថ្នាក់
              </option>
            ) : (
              classes.map((cls) => (
                <option key={cls.id} value={cls.id} className="dark:bg-[#1c1c1e]">
                  ថ្នាក់ {cls.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Month & Year Picker */}
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#f5f5f7] dark:bg-white/[0.08] border border-black/[0.05] dark:border-white/[0.08]">
          <Calendar size={14} className="text-[#0071e3] shrink-0 hidden sm:block" />
          <select
            aria-label="ជ្រើសខែ"
            value={month}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            className="bg-transparent text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none cursor-pointer"
          >
            {KHMER_MONTHS.map((mName, idx) => (
              <option key={mName} value={idx + 1} className="dark:bg-[#1c1c1e]">
                {mName}
              </option>
            ))}
          </select>
          <select
            aria-label="ជ្រើសឆ្នាំ"
            value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className="bg-transparent text-xs font-medium text-[#6e6e73] dark:text-[#98989d] focus:outline-none cursor-pointer"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="dark:bg-[#1c1c1e]">
                {formatNum(y)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};
