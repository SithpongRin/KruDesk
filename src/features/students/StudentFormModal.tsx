import React, { useEffect, useState } from 'react';
import { User, X } from 'lucide-react';
import { AppleModal } from '../../components/common/AppleModal';
import { AppleButton } from '../../components/common/AppleButton';
import {
  addStudentToClass,
  isStudentIdUniqueInClass,
  updateStudentInClass,
} from '../../db/classStudentRepo';
import { normalizeBirthDate } from '../../services/excelImport';
import type { Student, StudentStatus } from '../../types/domain';
import { cropAndCompressPhoto3x4 } from '../../utils/photo';

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  studentToEdit?: Student | null;
  onSaved: () => void;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  onClose,
  classId,
  studentToEdit,
  onSaved,
}) => {
  const [studentId, setStudentId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [nameKm, setNameKm] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [gender, setGender] = useState<'ប្រុស' | 'ស្រី'>('ប្រុស');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [placeOfBirth, setPlaceOfBirth] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [fatherOccupation, setFatherOccupation] = useState('');
  const [motherName, setMotherName] = useState('');
  const [motherOccupation, setMotherOccupation] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<StudentStatus>('active');
  const [photoBlob, setPhotoBlob] = useState<Blob | undefined>(undefined);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>('');
  const [photoError, setPhotoError] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (studentToEdit) {
      setStudentId(studentToEdit.studentId);
      setCardNumber(studentToEdit.cardNumber || '');
      setNameKm(studentToEdit.nameKm);
      setNameEn(studentToEdit.nameEn || '');
      setGender(studentToEdit.gender);
      setDateOfBirth(studentToEdit.dateOfBirth || '');
      setPlaceOfBirth(studentToEdit.placeOfBirth || '');
      setFatherName(studentToEdit.fatherName || '');
      setFatherOccupation(studentToEdit.fatherOccupation || '');
      setMotherName(studentToEdit.motherName || '');
      setMotherOccupation(studentToEdit.motherOccupation || '');
      setAddress(studentToEdit.address || '');
      setPhone(studentToEdit.phone || '');
      setStatus(studentToEdit.status);
      setPhotoBlob(studentToEdit.photoBlob);
    } else {
      setStudentId('');
      setCardNumber('');
      setNameKm('');
      setNameEn('');
      setGender('ប្រុស');
      setDateOfBirth('');
      setPlaceOfBirth('');
      setFatherName('');
      setFatherOccupation('');
      setMotherName('');
      setMotherOccupation('');
      setAddress('');
      setPhone('');
      setStatus('active');
      setPhotoBlob(undefined);
    }
    setErrors({});
    setPhotoError('');
  }, [isOpen, studentToEdit]);

  useEffect(() => {
    if (!photoBlob) {
      setPhotoPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(photoBlob);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoBlob]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('សូមជ្រើសរើសឯកសាររូបភាពប៉ុណ្ណោះ');
      return;
    }
    setPhotoError('');
    try {
      const compressed = await cropAndCompressPhoto3x4(file, 600, 0.85);
      setPhotoBlob(compressed);
    } catch {
      setPhotoError('មិនអាចដំណើរការរូបភាពនេះបានទេ');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    const trimmedId = studentId.trim();
    if (!trimmedId) {
      nextErrors.studentId = 'សូមបញ្ចូលអត្តលេខសិស្ស';
    } else {
      const unique = await isStudentIdUniqueInClass(
        classId,
        trimmedId,
        studentToEdit?.id
      );
      if (!unique) {
        nextErrors.studentId = `អត្តលេខ "${trimmedId}" មានរួចហើយក្នុងថ្នាក់នេះ`;
      }
    }

    if (!nameKm.trim()) {
      nextErrors.nameKm = 'សូមបញ្ចូលគោត្តនាម និងនាម';
    }

    const dobCheck = normalizeBirthDate(dateOfBirth);
    if (!dobCheck.valid) {
      nextErrors.dateOfBirth = 'ទម្រង់ថ្ងៃកំណើតមិនត្រឹមត្រូវ (ឧ. 15/04/2013)';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        classId,
        studentId: trimmedId,
        cardNumber: cardNumber.trim() || undefined,
        nameKm: nameKm.trim(),
        nameEn: nameEn.trim() || undefined,
        gender,
        dateOfBirth: dobCheck.value,
        placeOfBirth: placeOfBirth.trim() || undefined,
        fatherName: fatherName.trim() || undefined,
        fatherOccupation: fatherOccupation.trim() || undefined,
        motherName: motherName.trim() || undefined,
        motherOccupation: motherOccupation.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        photoBlob,
        status,
      };

      if (studentToEdit?.id !== undefined) {
        await updateStudentInClass(studentToEdit.id, payload);
      } else {
        await addStudentToClass(payload);
      }

      onSaved();
      onClose();
    } catch (err) {
      setErrors({
        studentId:
          err instanceof Error ? err.message : 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppleModal
      isOpen={isOpen}
      onClose={onClose}
      title={studentToEdit ? `កែសម្រួលព័ត៌មាន៖ ${studentToEdit.nameKm}` : 'បន្ថែមសិស្សថ្មី'}
      subtitle="រូបថតនឹងត្រូវកាត់ជាសមាមាត្រ 3×4 ដោយស្វ័យប្រវត្តិ"
      maxWidth="2xl"
      footer={
        <>
          <AppleButton variant="secondary" size="sm" onClick={onClose} disabled={isSaving}>
            បោះបង់
          </AppleButton>
          <AppleButton variant="primary" size="sm" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក'}
          </AppleButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Photo & ID row */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-2xl bg-[#f5f5f7] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06]">
          <div className="relative w-[96px] h-[128px] rounded-xl bg-white dark:bg-[#2c2c2e] border border-dashed border-[#86868b] flex items-center justify-center overflow-hidden shrink-0">
            {photoPreviewUrl ? (
              <>
                <img
                  src={photoPreviewUrl}
                  alt="Student 3x4"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoBlob(undefined)}
                  aria-label="លុបរូបថត"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <label
                htmlFor="student-photo"
                className="cursor-pointer w-full h-full flex flex-col items-center justify-center text-[#86868b] hover:text-[#0071e3] p-2 text-center"
              >
                <User size={26} className="opacity-60 mb-1" />
                <span className="text-[10px] font-medium">រូបថត ៣×៤</span>
                <input
                  id="student-photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex-1 w-full space-y-3">
            {photoError && <p className="text-[11px] text-[#ff3b30]">{photoError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="student-id"
                  className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
                >
                  អត្តលេខ <span className="text-[#ff3b30]">*</span>
                </label>
                <input
                  id="student-id"
                  type="text"
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    if (errors.studentId) setErrors((p) => ({ ...p, studentId: '' }));
                  }}
                  placeholder="ឧ. KDL-2026-001"
                  className={`w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                    errors.studentId
                      ? 'border-[#ff3b30]'
                      : 'border-black/[0.1] dark:border-white/[0.12]'
                  } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
                />
                {errors.studentId && (
                  <p className="text-[11px] text-[#ff3b30] mt-1">{errors.studentId}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="student-cardNumber"
                  className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
                >
                  លេខកាត
                </label>
                <input
                  id="student-cardNumber"
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="ឧ. ០០១"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.1] dark:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div>
                <label
                  htmlFor="student-status"
                  className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
                >
                  ស្ថានភាព
                </label>
                <select
                  id="student-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StudentStatus)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#1c1c1e] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.1] dark:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                >
                  <option value="active">កំពុងរៀន</option>
                  <option value="dropped">បោះបង់</option>
                  <option value="transferred">ផ្ទេរចេញ</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="student-nameKm"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              គោត្តនាម និងនាម <span className="text-[#ff3b30]">*</span>
            </label>
            <input
              id="student-nameKm"
              type="text"
              value={nameKm}
              onChange={(e) => {
                setNameKm(e.target.value);
                if (errors.nameKm) setErrors((p) => ({ ...p, nameKm: '' }));
              }}
              placeholder="ឧ. សុខ សុវណ្ណារ៉ា"
              className={`w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                errors.nameKm
                  ? 'border-[#ff3b30]'
                  : 'border-black/[0.08] dark:border-white/[0.1]'
              } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
            />
            {errors.nameKm && (
              <p className="text-[11px] text-[#ff3b30] mt-1">{errors.nameKm}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="student-nameEn"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ឈ្មោះឡាតាំង
            </label>
            <input
              id="student-nameEn"
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="SOKH SOVANNARA"
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-gender"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ភេទ <span className="text-[#ff3b30]">*</span>
            </label>
            <select
              id="student-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as 'ប្រុស' | 'ស្រី')}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            >
              <option value="ប្រុស" className="dark:bg-[#1c1c1e]">ប្រុស</option>
              <option value="ស្រី" className="dark:bg-[#1c1c1e]">ស្រី</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="student-dob"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ថ្ងៃខែឆ្នាំកំណើត
            </label>
            <input
              id="student-dob"
              type="text"
              value={dateOfBirth}
              onChange={(e) => {
                setDateOfBirth(e.target.value);
                if (errors.dateOfBirth) setErrors((p) => ({ ...p, dateOfBirth: '' }));
              }}
              placeholder="15/04/2013 ឬ ១៥/០៤/២០១៣"
              className={`w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border ${
                errors.dateOfBirth
                  ? 'border-[#ff3b30]'
                  : 'border-black/[0.08] dark:border-white/[0.1]'
              } focus:outline-none focus:ring-2 focus:ring-[#0071e3]`}
            />
            {errors.dateOfBirth && (
              <p className="text-[11px] text-[#ff3b30] mt-1">{errors.dateOfBirth}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="student-pob"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ទីកន្លែងកំណើត
            </label>
            <input
              id="student-pob"
              type="text"
              value={placeOfBirth}
              onChange={(e) => setPlaceOfBirth(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-fatherName"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ឪពុកឈ្មោះ
            </label>
            <input
              id="student-fatherName"
              type="text"
              value={fatherName}
              onChange={(e) => setFatherName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-fatherOccupation"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              មុខរបរឪពុក
            </label>
            <input
              id="student-fatherOccupation"
              type="text"
              value={fatherOccupation}
              onChange={(e) => setFatherOccupation(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-motherName"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ម្តាយឈ្មោះ
            </label>
            <input
              id="student-motherName"
              type="text"
              value={motherName}
              onChange={(e) => setMotherName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-motherOccupation"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              មុខរបរម្តាយ
            </label>
            <input
              id="student-motherOccupation"
              type="text"
              value={motherOccupation}
              onChange={(e) => setMotherOccupation(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-phone"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              លេខទូរស័ព្ទ
            </label>
            <input
              id="student-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>

          <div>
            <label
              htmlFor="student-address"
              className="block text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1"
            >
              ទីលំនៅបច្ចុប្បន្ន
            </label>
            <input
              id="student-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>
        </div>
      </form>
    </AppleModal>
  );
};
