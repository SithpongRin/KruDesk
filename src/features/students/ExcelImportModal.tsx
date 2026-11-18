import React, { useRef, useState } from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Upload } from 'lucide-react';
import { AppleModal } from '../../components/common/AppleModal';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import {
  autoDetectColumnMapping,
  buildStudentImportPreview,
  downloadStudentImportTemplate,
  parseStudentExcelFile,
  type StudentImportPreview,
} from '../../services/excelImport';
import { db } from '../../db/database';
import {
  getNextStudentOrder,
  sortClassStudentsAlphabetically,
} from '../../db/classStudentRepo';
import type { SchoolClass } from '../../types/domain';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import { useAppStore } from '../../store/useAppStore';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetClass: SchoolClass;
  onImported: (importedCount: number, skippedDuplicates: number) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  targetClass,
  onImported,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [parseError, setParseError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [autoSortKhmer, setAutoSortKhmer] = useState(true);
  const useKhmerNumerals = useAppStore((s) => s.useKhmerNumerals);
  const fmtNum = (v: number | string) => (useKhmerNumerals ? toKhmerNumerals(v) : String(v));

  const resetState = () => {
    setFileName('');
    setPreview(null);
    setParseError('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || targetClass.id === undefined) return;

    setParseError('');
    setFileName(file.name);
    try {
      const workbook = await parseStudentExcelFile(file);
      const sheet = workbook.sheets[0];
      if (!sheet || sheet.rows.length === 0) {
        setParseError('ឯកសារ Excel ទទេ ឬគ្មានទិន្នន័យសិស្ស។');
        setPreview(null);
        return;
      }

      const existing = await db.students.where('classId').equals(targetClass.id).toArray();
      const existingIds = new Set(existing.map((s) => s.studentId));
      const mapping = autoDetectColumnMapping(sheet.headers);
      const result = buildStudentImportPreview(
        sheet.rows,
        mapping,
        existingIds,
        targetClass
      );
      setPreview(result);
    } catch (err) {
      console.error(err);
      setParseError('មិនអាចអានឯកសារ Excel បានទេ។ សូមពិនិត្យទម្រង់ .xlsx ឬ .csv');
      setPreview(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.validRecords.length === 0 || targetClass.id === undefined) return;

    setIsImporting(true);
    try {
      const classId = targetClass.id;
      let nextOrder = await getNextStudentOrder(classId);
      const now = Date.now();
      const toInsert = preview.validRecords.map((r) => ({
        ...r,
        classId,
        order: nextOrder++,
        createdAt: now,
        updatedAt: now,
      }));
      await db.students.bulkAdd(toInsert);
      if (autoSortKhmer) {
        await sortClassStudentsAlphabetically(classId);
      }
      const importedCount = toInsert.length;
      const skipped = preview.duplicateIds.length;
      resetState();
      onImported(importedCount, skipped);
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={handleClose}
      title={`នាំចូលសិស្សពី Excel → ថ្នាក់ទី ${targetClass.name}`}
      subtitle="ប្រើទម្រង់គំរូ Excel · រំលងអត្តលេខស្ទួន · ផ្ទៀងផ្ទាត់មុនរក្សាទុក"
      maxWidth="4xl"
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={handleClose} disabled={isImporting}>
            បោះបង់
          </AppleButton>
          <AppleButton
            variant="primary"
            size="sm"
            onClick={handleConfirmImport}
            disabled={!preview || preview.validRecords.length === 0 || isImporting}
          >
            {isImporting
              ? 'កំពុងនាំចូល...'
              : preview
              ? `នាំចូលសិស្ស ${fmtNum(preview.validRecords.length)} នាក់`
              : 'នាំចូល'}
          </AppleButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e8f2ff] dark:bg-blue-500/15 text-[#0071e3] flex items-center justify-center shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {fileName || 'ជ្រើសរើសឯកសារ .xlsx ឬ .csv'}
              </div>
              <div className="text-[11px] text-[#86868b]">
                ជួរឈរ «ថ្នាក់ទី» និង «ឆ្នាំសិក្សា» ក្នុង Excel នឹងត្រូវរំលង (សិស្សទាំងអស់ចូលក្នុងថ្នាក់ {targetClass.name})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AppleButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => downloadStudentImportTemplate(targetClass.name, targetClass.academicYear)}
            >
              ទាញយកគំរូ Excel
            </AppleButton>
            <AppleButton
              type="button"
              variant="primary"
              size="sm"
              icon={<Upload size={14} />}
              onClick={() => fileRef.current?.click()}
            >
              ជ្រើសឯកសារ
            </AppleButton>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {parseError && (
          <div className="p-3.5 rounded-xl bg-[#ffefef] dark:bg-red-500/15 border border-[#ffd4d1] text-xs text-[#ff3b30]">
            {parseError}
          </div>
        )}

        {preview && (
          <div className="space-y-3">
            {(preview.classMismatchCount > 0 || preview.yearMismatchCount > 0) && (
              <div className="p-3.5 rounded-2xl bg-[#fff5e9] dark:bg-amber-500/15 border border-[#ffe4c2] dark:border-amber-500/30 flex items-start gap-2.5 text-xs text-[#1d1d1f] dark:text-amber-100">
                <AlertTriangle size={16} className="text-[#ff9500] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">សម្គាល់៖ </span>
                  ឯកសារ Excel មានជួរដែលបញ្ជាក់{' '}
                  {preview.classMismatchCount > 0 ? '«ថ្នាក់ទី»' : ''}
                  {preview.classMismatchCount > 0 && preview.yearMismatchCount > 0 ? ' និង ' : ''}
                  {preview.yearMismatchCount > 0 ? '«ឆ្នាំសិក្សា»' : ''}{' '}
                  ខុសពីថ្នាក់ទី <b>{targetClass.name}</b> ({targetClass.academicYear})។
                  ប្រព័ន្ធនឹងមិនប្រើតម្លៃទាំងនោះទេ ហើយនឹងបញ្ចូលសិស្សទៅក្នុងថ្នាក់ <b>{targetClass.name}</b>។
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <AppleBadge variant="green" size="md">
                  <CheckCircle2 size={13} />
                  <span>ត្រឹមត្រូវ៖ {fmtNum(preview.validRecords.length)}</span>
                </AppleBadge>
                <AppleBadge variant="orange" size="md">
                  <AlertTriangle size={13} />
                  <span>ស្ទួនអត្តលេខ (រំលង)៖ {fmtNum(preview.duplicateIds.length)}</span>
                </AppleBadge>
                <AppleBadge variant="red" size="md">
                  <XCircle size={13} />
                  <span>មានកំហុស៖ {fmtNum(preview.errorCount)}</span>
                </AppleBadge>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSortKhmer}
                  onChange={(e) => setAutoSortKhmer(e.target.checked)}
                  className="rounded border-black/20 text-[#0071e3] focus:ring-[#0071e3]"
                />
                <span>តម្រៀបឈ្មោះតាមអក្សរខ្មែរ (ក–អ)</span>
              </label>
            </div>

            <div className="border border-black/[0.08] dark:border-white/[0.1] rounded-2xl overflow-auto max-h-[45vh]">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#f5f5f7] dark:bg-white/[0.06] sticky top-0 z-10">
                  <tr className="text-left text-[#6e6e73] dark:text-[#98989d]">
                    <th className="px-3 py-2 font-semibold">ជួរ</th>
                    <th className="px-3 py-2 font-semibold">អត្តលេខ</th>
                    <th className="px-3 py-2 font-semibold">គោត្តនាម និងនាម</th>
                    <th className="px-3 py-2 font-semibold">ភេទ</th>
                    <th className="px-3 py-2 font-semibold">ថ្ងៃកំណើត</th>
                    <th className="px-3 py-2 font-semibold">លទ្ធផល</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {preview.rows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={
                        r.status === 'error'
                          ? 'bg-red-50/70 dark:bg-red-500/10'
                          : r.status === 'duplicate'
                          ? 'bg-amber-50/70 dark:bg-amber-500/10'
                          : ''
                      }
                    >
                      <td className="px-3 py-2 text-[#86868b]">{fmtNum(r.rowNumber)}</td>
                      <td className="px-3 py-2 font-mono">{r.studentId}</td>
                      <td className="px-3 py-2 font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {r.nameKm || '—'}
                      </td>
                      <td className="px-3 py-2">{r.gender || '—'}</td>
                      <td className="px-3 py-2">{r.dateOfBirth || '—'}</td>
                      <td className="px-3 py-2">
                        {r.status === 'valid' ? (
                          <span className="text-[#34c759] font-medium">រួចរាល់</span>
                        ) : (
                          <span className="text-[#ff3b30] font-medium">
                            {r.errors.join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppleModal>
  );
};
