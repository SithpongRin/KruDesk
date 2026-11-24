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

    // Left: the hidden date lines only keep the titles level; visible text is the two titles,
    // plus an always-rendered director signing space (`data-director-seal-anchor`) underneath.
    const hidden = left.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(hidden.className).toContain('invisible');
    const anchor = left.querySelector('[data-director-seal-anchor]') as HTMLElement;
    expect(anchor).toBeTruthy();
    expect(anchor.style.height).toBe('20mm');
    const leftVisible = Array.from(left.children)
      .filter((el) => el !== hidden && el !== anchor)
      .map((el) => el.textContent);
    expect(leftVisible).toEqual([APPROVER_LINE, DIRECTOR_TITLE]);
    expect(container.textContent).not.toContain(profile.directorName);

    // Right: lunar line, place + date, title, signing space (default 20mm), teacher's name.
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

  it('prints the director stamp and signature only when they are in the sign options', () => {
    const seal = { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 };
    const base = { month: '2026-11', lunarDate: '', place: '', gregorianDate: '' };
    const without = render(<DocumentSignature profile={profile} signOptions={base} />);
    expect(without.container.querySelectorAll('img')).toHaveLength(0);

    const withSeal = render(
      <DocumentSignature
        profile={profile}
        signOptions={{ ...base, directorStamp: seal, directorSignature: seal }}
      />
    );
    const left = withSeal.container.firstElementChild!.children[0] as HTMLElement;
    const right = withSeal.container.firstElementChild!.children[2] as HTMLElement;
    expect(left.querySelectorAll('img')).toHaveLength(2);
    expect(right.querySelectorAll('img')).toHaveLength(0);

    const withTeacher = render(
      <DocumentSignature profile={profile} signOptions={{ ...base, teacherSignature: seal }} />
    );
    const teacherBlock = withTeacher.container.firstElementChild!.children[2] as HTMLElement;
    expect(teacherBlock.querySelectorAll('img')).toHaveLength(1);
    expect(teacherBlock.lastElementChild?.textContent).toBe(profile.teacherName);
  });

  it('never draws the stamp smaller than on the school sheets', () => {
    const seal = { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 };
    const base = { month: '2026-11', lunarDate: '', place: '', gregorianDate: '' };
    const heightOf = (opts: object, gapMm: number) => {
      const r = render(
        <DocumentSignature profile={profile} signOptions={{ ...base, ...opts }} gapMm={gapMm} />
      );
      const img = r.container.querySelector('img') as HTMLImageElement;
      return parseFloat(img.style.height);
    };
    // small signing gap (report cards): still ≥ 34 mm for stamp+signature, ≥ 30 mm for a stamp
    expect(heightOf({ directorStamp: seal }, 10)).toBeGreaterThanOrEqual(34);
    expect(heightOf({ directorStamp: seal, directorSignature: seal }, 10)).toBeGreaterThanOrEqual(30);
  });

  it('scales and nudges the director stamp when stampScale / offsets are set, and respects ptMm', () => {
    const seal = { dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 100 };
    const base = { month: '2026-11', lunarDate: '', place: '', gregorianDate: '' };
    const baseRender = render(
      <DocumentSignature profile={profile} signOptions={{ ...base, directorStamp: seal }} gapMm={20} ptMm={0.5} />
    );
    const root = baseRender.container.firstElementChild as HTMLElement;
    expect(root.style.paddingTop).toBe('0.5mm');
    const baseImg = baseRender.container.querySelector('[data-director-seal]') as HTMLImageElement;
    const baseH = parseFloat(baseImg.style.height);

    const enlarged = render(
      <DocumentSignature
        profile={profile}
        signOptions={{
          ...base,
          directorStamp: seal,
          stampScale: 1.5,
          stampOffsetXMm: 4,
          stampOffsetYMm: -3,
        }}
        gapMm={20}
      />
    );
    const bigImg = enlarged.container.querySelector('[data-director-seal]') as HTMLImageElement;
    expect(parseFloat(bigImg.style.height)).toBeCloseTo(baseH * 1.5, 2);
    expect(bigImg.style.left).toContain('calc(50% +');
    const bigAnchor = enlarged.container.querySelector('[data-director-seal-anchor]') as HTMLElement;
    expect(bigAnchor.dataset.stampOffsetX).toBe('4');
    expect(bigAnchor.dataset.stampOffsetY).toBe('-3');

    // Clamp extreme scale values safely within [0.4, 2.2]
    const clampedHigh = render(
      <DocumentSignature
        profile={profile}
        signOptions={{ ...base, directorStamp: seal, stampScale: 9 }}
        gapMm={20}
      />
    );
    const maxImg = clampedHigh.container.querySelector('[data-director-seal]') as HTMLImageElement;
    expect(parseFloat(maxImg.style.height)).toBeCloseTo(baseH * 2.2, 2);
  });

  it('always marks the teacher signing space as an anchor, without an image when none is ticked', () => {
    const base = { month: '2026-11', lunarDate: '', place: '', gregorianDate: '' };
    const { container } = render(
      <DocumentSignature profile={profile} signOptions={base} gapMm={16} fontSizePt={10} />
    );
    const anchors = container.querySelectorAll('[data-teacher-sign-anchor]');
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0] as HTMLElement;
    expect(anchor.dataset.gapMm).toBe('16');
    expect(anchor.dataset.fontPt).toBe('10');
    expect(anchor.dataset.hasTeacherSig).toBe('0');
    expect(anchor.dataset.teacherScale).toBe('1');
    expect(anchor.dataset.teacherOffsetX).toBe('0');
    expect(anchor.dataset.teacherOffsetY).toBe('0');
    expect(container.querySelector('[data-teacher-signature]')).toBeNull();
    // The teacher's space is not the director's.
    expect(anchor.hasAttribute('data-director-seal-anchor')).toBe(false);

    // Director-only certificate block has no teacher space.
    const certificate = render(
      <DocumentSignature profile={profile} showTeacher={false} signOptions={base} />
    );
    expect(certificate.container.querySelector('[data-teacher-sign-anchor]')).toBeNull();
  });

  it('sizes, scales and nudges the teacher signature with computeSignatureBox', () => {
    const sig = { dataUrl: 'data:image/png;base64,AAAA', width: 200, height: 100 };
    const base = { month: '2026-11', lunarDate: '', place: '', gregorianDate: '' };
    const plain = render(
      <DocumentSignature profile={profile} signOptions={{ ...base, teacherSignature: sig }} gapMm={20} />
    );
    const img = plain.container.querySelector('[data-teacher-signature]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(parseFloat(img.style.height)).toBeCloseTo(18, 4);
    expect(parseFloat(img.style.width)).toBeCloseTo(36, 4);
    expect(parseFloat(img.style.top)).toBeCloseTo(1, 4);
    expect(img.style.left).toBe('50%');
    expect(img.style.transform).toBe('translateX(-50%)');
    expect(img.style.opacity).toBe('1');
    const anchor = img.closest('[data-teacher-sign-anchor]') as HTMLElement;
    expect(anchor.dataset.hasTeacherSig).toBe('1');

    const moved = render(
      <DocumentSignature
        profile={profile}
        signOptions={{
          ...base,
          teacherSignature: sig,
          teacherSignatureScale: 1.5,
          teacherSignatureOffsetXMm: 4,
          teacherSignatureOffsetYMm: -3,
        }}
        gapMm={20}
      />
    );
    const movedImg = moved.container.querySelector('[data-teacher-signature]') as HTMLImageElement;
    expect(parseFloat(movedImg.style.height)).toBeCloseTo(27, 4);
    // JSDOM normalises calc(50% + 4mm) to px: 4mm = 15.118px
    expect(movedImg.style.left).toContain('calc(50% +');
    expect(parseFloat(movedImg.style.left.replace('calc(50% + ', ''))).toBeCloseTo((4 * 96) / 25.4, 3);
    // centre stays at gap/2, then 3 mm up
    expect(parseFloat(movedImg.style.top)).toBeCloseTo(10 - 13.5 - 3, 4);
    const movedAnchor = moved.container.querySelector('[data-teacher-sign-anchor]') as HTMLElement;
    expect(movedAnchor.dataset.teacherScale).toBe('1.5');
    expect(movedAnchor.dataset.teacherOffsetX).toBe('4');
    expect(movedAnchor.dataset.teacherOffsetY).toBe('-3');
  });

  it('never marks the director signature as the teacher signature', () => {
    const seal = { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 };
    const base = { month: '2026-11', lunarDate: '', place: '', gregorianDate: '' };
    const { container } = render(
      <DocumentSignature
        profile={profile}
        signOptions={{ ...base, directorStamp: seal, directorSignature: seal }}
      />
    );
    expect(container.querySelector('[data-teacher-signature]')).toBeNull();
    const directorAnchor = container.querySelector('[data-director-seal-anchor]') as HTMLElement;
    expect(directorAnchor.querySelectorAll('img')).toHaveLength(2);
  });
});
