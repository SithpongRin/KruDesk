import React, { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../db/database';
import { formatKhmerMonthYear, toLocalDateKey } from '../../lib/khmerDate';
import type { DocumentSignOptions } from '../../print/DocumentSignature';
import { AppleModal } from './AppleModal';
import { AppleButton } from './AppleButton';

interface DocumentSignDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  month: string;
  onConfirm: (options: DocumentSignOptions) => void | Promise<void>;
  confirmLabel?: string;
  children?: React.ReactNode;
}

export const DocumentSignDialog: React.FC<DocumentSignDialogProps> = ({
  isOpen,
  onClose,
  title,
  month,
  onConfirm,
  confirmLabel = 'បង្កើតឯកសារ',
  children,
}) => {
  const [lunarDate, setLunarDate] = useState('');
  const [place, setPlace] = useState('');
  const [gregorianDate, setGregorianDate] = useState(() => toLocalDateKey());
  // Teacher's default (2026-11-20): day and month left blank, written by hand after printing.
  const [handwrittenDate, setHandwrittenDate] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setGregorianDate(toLocalDateKey());
    Promise.all([
      getSetting<string>('documentPlace'),
      getSetting<string>('documentLunarDate'),
      getSetting<boolean>('documentDateHandwritten'),
    ])
      .then(([savedPlace, savedLunar, savedHandwritten]) => {
        if (cancelled) return;
        if (savedPlace) setPlace(savedPlace);
        if (savedLunar) setLunarDate(savedLunar);
        if (typeof savedHandwritten === 'boolean') setHandwrittenDate(savedHandwritten);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await Promise.all([
        setSetting('documentPlace', place.trim()).catch(() => {}),
        setSetting('documentLunarDate', lunarDate.trim()).catch(() => {}),
        setSetting('documentDateHandwritten', handwrittenDate).catch(() => {}),
      ]);
      await onConfirm({
        month,
        lunarDate: lunarDate.trim(),
        place: place.trim(),
        gregorianDate: handwrittenDate ? '' : gregorianDate || toLocalDateKey(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`ប្រចាំខែ ${formatKhmerMonthYear(month, true)}`}
      maxWidth="md"
      footer={
        <>
          <AppleButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            បោះបង់
          </AppleButton>
          <AppleButton
            type="submit"
            form="doc-sign-form"
            variant="primary"
            size="sm"
            disabled={submitting}
          >
            {submitting ? 'កំពុងរៀបចំ...' : confirmLabel}
          </AppleButton>
        </>
      }
    >
      <form id="doc-sign-form" onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label
            htmlFor="doc-sign-lunar"
            className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
          >
            ថ្ងៃខែចន្ទគតិ
          </label>
          <input
            id="doc-sign-lunar"
            type="text"
            value={lunarDate}
            onChange={(e) => setLunarDate(e.target.value)}
            placeholder="ឧ. ថ្ងៃ.............ខែ...............ឆ្នាំ មមែ អដ្ឋស័ក ព.ស. ២៥៧០"
            className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          />
          <p className="text-[11px] text-[#86868b] mt-1">
            វាយម្ដងប៉ុណ្ណោះ — កម្មវិធីចងចាំ ហើយប្រើលើឯកសារទាំងអស់។ ទុកទទេ ដើម្បីបង្ហាញបន្ទាត់ចុចៗ។
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="doc-sign-place"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ទីកន្លែង
            </label>
            <input
              id="doc-sign-place"
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="ឧ. ភ្នំពេញ ឬ ដំណាក់ព្រីង"
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="doc-sign-gregorian"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              កាលបរិច្ឆេទសុរិយគតិ
            </label>
            <input
              id="doc-sign-gregorian"
              type="date"
              disabled={handwrittenDate}
              value={gregorianDate}
              onChange={(e) => setGregorianDate(e.target.value)}
              className="disabled:opacity-40 w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={handwrittenDate}
            onChange={(e) => setHandwrittenDate(e.target.checked)}
            className="w-4 h-4 accent-[#0071e3]"
          />
          ទុកថ្ងៃទី និងខែទទេ ដើម្បីសរសេរដៃ (ឧ. «ថ្ងៃទី...........ខែ.........ឆ្នាំ ២០២៦»)
        </label>

        {children}
      </form>
    </AppleModal>
  );
};
