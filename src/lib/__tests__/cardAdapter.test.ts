import { describe, it, expect } from 'vitest';
import { applyProfileToTemplate, toCardStudent } from '../cardAdapter';
import { formatMinistryDepartment } from '../provinces';
import { defaultReferenceTemplate, templateBattambangBottomPhoto } from '../../db/defaultTemplates';
import type { Profile, SchoolClass, Student } from '../../types/domain';

describe('cardAdapter (KruDesk -> Card App)', () => {
  const profile: Profile = {
    teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
    schoolName: 'អនុវិទ្យាល័យ ព្រះនរោត្តម',
    directorName: 'លោក ជា សម្បត្តិ',
    academicYear: '2026-2027',
    province: 'ភ្នំពេញ',
  };

  const cls: SchoolClass = {
    id: 5,
    name: '៧ក',
    gradeLevel: 7,
    academicYear: '2026-2027',
    color: '#0071e3',
    subjects: [],
    createdAt: 100,
  };

  it('maps KruDesk Student + SchoolClass to CardStudent faithfully', () => {
    const photoBlob = new Blob(['fake-jpeg'], { type: 'image/jpeg' });
    const student: Student = {
      id: 42,
      classId: 5,
      order: 1,
      studentId: 'KD-042',
      nameKm: 'កែវ ម៉ាលី',
      gender: 'ស្រី',
      dateOfBirth: '15/04/2013',
      placeOfBirth: 'ភ្នំពេញ',
      fatherName: 'កែវ សុខា',
      motherName: 'ចាន់ នារី',
      address: 'ភូមិ១',
      phone: '012345678',
      cardNumber: '007',
      photoBlob,
      status: 'active',
      createdAt: 10,
      updatedAt: 20,
    };

    const cardStudent = toCardStudent(student, cls, 'data:image/jpeg;base64,abc');
    expect(cardStudent.class).toBe('៧ក');
    expect(cardStudent.academicYear).toBe('2026-2027');
    expect(cardStudent.photoBlob).toBe(photoBlob);
    expect(cardStudent.photoUrl).toBe('data:image/jpeg;base64,abc');
    expect(cardStudent.cardNumber).toBe('007');
    expect(cardStudent.studentId).toBe('KD-042');
    expect(cardStudent.nationality).toBe('ខ្មែរ');
  });

  it('applies KruDesk profile schoolName, directorName, province, and Khmer academicYear without mutating source template', () => {
    expect(formatMinistryDepartment('កណ្ដាល')).toBe('មន្ទីរអប់រំ យុវជន និងកីឡាខេត្ត កណ្ដាល');
    expect(formatMinistryDepartment('ភ្នំពេញ')).toBe('មន្ទីរអប់រំ យុវជន និងកីឡារាជធានីភ្នំពេញ');

    const applied1 = applyProfileToTemplate(defaultReferenceTemplate, profile, cls.academicYear);
    expect(applied1.ministryDepartment).toBe('មន្ទីរអប់រំ យុវជន និងកីឡារាជធានីភ្នំពេញ');
    expect(applied1.schoolNameOnly).toBe('អនុវិទ្យាល័យ ព្រះនរោត្តម');
    expect(applied1.directorName).toBe('លោក ជា សម្បត្តិ');
    expect(applied1.academicYearPrefix).toBe('ឆ្នាំសិក្សា ២០២៦-២០២៧');
    expect(defaultReferenceTemplate.schoolNameOnly).toBe('ដំណាក់ព្រីង');

    const appliedKandal = applyProfileToTemplate(
      defaultReferenceTemplate,
      { ...profile, province: 'កណ្ដាល' },
      cls.academicYear
    );
    expect(appliedKandal.ministryDepartment).toBe('មន្ទីរអប់រំ យុវជន និងកីឡាខេត្ត កណ្ដាល');

    const applied2 = applyProfileToTemplate(
      templateBattambangBottomPhoto,
      profile,
      cls.academicYear
    );
    expect(applied2.studentDeclaration).toBe('ជាសិស្ស អនុវិទ្យាល័យ ព្រះនរោត្តម');
  });
});
