import type { Profile, SchoolClass, Student as DomainStudent } from '../types/domain';
import type { Student as CardStudent } from '../types/cardStudent';
import type { CardTemplate } from '../types/template';
import { toKhmerNumerals } from '../utils/khmerNumerals';
import { formatMinistryDepartment } from './provinces';

const blobUrlCache = new WeakMap<Blob, string>();

/**
 * Lazily caches object URLs for student photo blobs so CanvasCardImage and PDF generation
 * can load embedded 3x4 JPEG blobs without leaking object URLs across re-renders.
 */
export function getPhotoUrlForBlob(blob?: Blob): string | undefined {
  if (!blob) return undefined;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return undefined;
  }
  let cached = blobUrlCache.get(blob);
  if (!cached) {
    cached = URL.createObjectURL(blob);
    blobUrlCache.set(blob, cached);
  }
  return cached;
}

/**
 * Maps a KruDesk Student + its SchoolClass to the card app's Student shape.
 * Keeps CardCanvasRenderer's original field conventions & numeral handling intact.
 */
export function toCardStudent(
  student: DomainStudent,
  cls: Pick<SchoolClass, 'name' | 'academicYear'>,
  resolvedPhotoUrl?: string
): CardStudent {
  const photoUrl = resolvedPhotoUrl ?? getPhotoUrlForBlob(student.photoBlob);

  return {
    id: student.id,
    studentId: student.studentId,
    nameKm: student.nameKm,
    nameEn: student.nameEn,
    gender: student.gender,
    nationality: 'ខ្មែរ',
    dateOfBirth: student.dateOfBirth,
    placeOfBirth: student.placeOfBirth,
    class: cls.name,
    academicYear: cls.academicYear,
    fatherName: student.fatherName,
    fatherOccupation: student.fatherOccupation,
    motherName: student.motherName,
    motherOccupation: student.motherOccupation,
    address: student.address,
    phone: student.phone,
    photoBlob: student.photoBlob,
    photoUrl,
    cardNumber: student.cardNumber,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

/**
 * Injects KruDesk school name, director name, and class academic year into a CardTemplate
 * for previewing and generating cards, without mutating the underlying template object.
 */
export function applyProfileToTemplate(
  template: CardTemplate,
  profile: Profile,
  academicYear?: string
): CardTemplate {
  const schoolName = profile.schoolName.trim();
  const directorName = profile.directorName.trim();
  const year = (academicYear || profile.academicYear || '').trim();
  const ministryDepartment = formatMinistryDepartment(profile.province);

  return {
    ...template,
    ...(ministryDepartment ? { ministryDepartment } : {}),
    ...(schoolName ? { schoolNameOnly: schoolName } : {}),
    ...(directorName ? { directorName } : {}),
    ...(schoolName && template.variant === 'bottom-photo'
      ? { studentDeclaration: `ជាសិស្ស ${schoolName}` }
      : {}),
    ...(year
      ? { academicYearPrefix: `ឆ្នាំសិក្សា ${toKhmerNumerals(year)}` }
      : {}),
  };
}
