// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  APPROVER_LINE,
  BLANK_LUNAR_LINE,
  DIRECTOR_TITLE,
  DocumentSignature,
  TEACHER_TITLE,
  formatDocumentGregorianDate,
} from '../DocumentSignature';
import { toKhmerNumerals } from '../../utils/khmerNumerals';
import type { Profile } from '../../types/domain';

const profile: Profile = {
  teacherName: 'គ្រូ សាកល្បង',
  schoolName: 'អនុវិទ្យាល័យ សាកល្បង',
  directorName: 'នាយក សាកល្បង',
  province: 'កណ្ដាល',
  academicYear: '2026-2027',
};

describe('DocumentSignature (teacher layout 2026-11-20)', () => {
  it('formats the Gregorian line with blank day/month by default and the place first', () => {
    const year = toKhmerNumerals(new Date().getFullYear());
    expect(formatDocumentGregorianDate('ដំណាក់ព្រីង', '')).toBe(
      `ដំណាក់ព្រីង ថ្ងៃទី...........ខែ.........ឆ្នាំ ${year}`
    );
    expect(formatDocumentGregorianDate('', '2026-11-20')).toBe('ថ្ងៃទី ២០ ខែ វិច្ឆិកា ឆ្នាំ ២០២៦');
  });

  it('puts dates over the teacher only, approver titles without dates or director name', () => {
    const { container } = render(
      <DocumentSignature
        profile={profile}
        signOptions={{
          month: '2026-11',
          lunarDate: 'ថ្ងៃ.............ខែ...............ឆ្នាំ មមែ អដ្ឋស័ក ព.ស. ២៥៧០',
          place: 'ដំណាក់ព្រីង',
          gregorianDate: '',
        }}
      />
    );
    const [left, , right] = Array.from(container.firstElementChild!.children) as HTMLElement[];

    // Left: the hidden date lines only keep the titles level; visible text is the two titles.
    const hidden = left.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(hidden.className).toContain('invisible');
    const leftVisible = Array.from(left.children)
      .filter((el) => el !== hidden)
      .map((el) => el.textContent);
    expect(leftVisible).toEqual([APPROVER_LINE, DIRECTOR_TITLE]);
    expect(container.textContent).not.toContain(profile.directorName);

    // Right: lunar line, place + date, title, signing space, teacher's name.
    expect(right.textContent).toContain('ឆ្នាំ មមែ អដ្ឋស័ក ព.ស. ២៥៧០');
    expect(right.textContent).toContain('ដំណាក់ព្រីង ថ្ងៃទី...........ខែ.........ឆ្នាំ');
    expect(right.textContent).toContain(TEACHER_TITLE);
    expect(right.lastElementChild?.textContent).toBe(profile.teacherName);
  });

  it('director-only block (certificate) keeps the dates, title and name', () => {
    const { container } = render(
      <DocumentSignature
        profile={profile}
        showTeacher={false}
        signOptions={{ month: '2026-11', lunarDate: '', place: '', gregorianDate: '' }}
      />
    );
    expect(container.textContent).toContain(BLANK_LUNAR_LINE);
    expect(container.textContent).toContain(DIRECTOR_TITLE);
    expect(container.textContent).toContain(profile.directorName);
    expect(container.textContent).not.toContain(TEACHER_TITLE);
  });
});
