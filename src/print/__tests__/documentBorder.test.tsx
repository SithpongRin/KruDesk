// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CertificateSheet } from '../CertificateSheet';
import { HonorRollSheet } from '../HonorRollSheet';
import { createDefaultSignOptions } from '../DocumentSignature';
import type { Profile, SchoolClass } from '../../types/domain';
import type { MonthlyResultRow } from '../../lib/monthlyResults';
import { isDocumentBorderImage, type DocumentBorderImage } from '../../utils/documentBorder';

const cls: SchoolClass = {
  id: 1,
  name: '៧ក',
  gradeLevel: 7,
  academicYear: '2026-2027',
  color: '#0071e3',
  subjects: [],
  createdAt: 1,
};
const profile: Profile = {
  teacherName: 'គ្រូ សាកល្បង',
  schoolName: 'អនុវិទ្យាល័យ សាកល្បង',
  directorName: 'នាយក សាកល្បង',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};
const row: MonthlyResultRow = {
  student: {
    id: 1,
    classId: 1,
    order: 1,
    studentId: 'T-01',
    nameKm: 'សិស្ស ទីមួយ',
    gender: 'ស្រី',
    dateOfBirth: '2014-01-01',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
  },
  total: 90,
  average: 45,
  rank: 1,
  grade: 'A',
  passed: true,
  attendance: {
    present: 0,
    excused: 0,
    unexcused: 0,
    total: 0,
    sickCount: 0,
    takenDaysCount: 0,
  },
  note: '',
};
const border: DocumentBorderImage = {
  dataUrl: 'data:image/jpeg;base64,AAAA',
  width: 2400,
  height: 1644,
  fileName: 'kbach.jpg',
};
const signOptions = createDefaultSignOptions('2026-11');

describe('document border images', () => {
  it('validates stored border settings', () => {
    expect(isDocumentBorderImage(border)).toBe(true);
    expect(isDocumentBorderImage({ dataUrl: 'https://example.com/a.jpg', width: 1, height: 1 })).toBe(
      false
    );
    expect(isDocumentBorderImage(undefined)).toBe(false);
  });

  it('certificate uses the chosen frame image instead of the built-in frame', () => {
    const { container } = render(
      <CertificateSheet
        cls={cls}
        profile={profile}
        month="2026-11"
        items={[row]}
        signOptions={signOptions}
        borderImage={border}
      />
    );
    const page = container.querySelector('[data-print-page]') as HTMLElement;
    expect(page.querySelector(`img[src="${border.dataUrl}"]`)).not.toBeNull();
    expect(page.querySelector(':scope > svg')).toBeNull();
    expect(page.style.padding).toBe('24mm 30mm');
  });

  it('without chosen images: certificate uses the default kbach frame, honor roll the gold plaque', () => {
    const cert = render(
      <CertificateSheet
        cls={cls}
        profile={profile}
        month="2026-11"
        items={[row]}
        signOptions={signOptions}
      />
    );
    expect(
      cert.container.querySelector('img[src$="images/frames/certificate-kbach.jpg"]')
    ).not.toBeNull();
    const roll = render(
      <HonorRollSheet
        cls={cls}
        profile={profile}
        month="2026-11"
        items={[row]}
        signOptions={signOptions}
      />
    );
    expect(roll.container.querySelector('img[src$="images/frames/name-plaque.png"]')).not.toBeNull();
  });

  it('honor roll keeps the built-in frame without an image and shows the month only', () => {
    const { container } = render(
      <HonorRollSheet
        cls={cls}
        profile={profile}
        month="2026-11"
        items={[row]}
        signOptions={signOptions}
      />
    );
    const page = container.querySelector('[data-print-page]') as HTMLElement;
    expect(page.querySelector(':scope > svg')).not.toBeNull();
    expect(page.querySelector('h2')?.textContent?.trim()).toBe(
      'តារាងកិត្តិយសប្រចាំខែ វិច្ឆិកា'
    );
  });
});
