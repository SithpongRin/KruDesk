// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CertificateSheet } from '../CertificateSheet';
import { HonorRollSheet } from '../HonorRollSheet';
import { createDefaultSignOptions } from '../DocumentSignature';
import type { Profile, SchoolClass } from '../../types/domain';
import type { MonthlyResultRow } from '../../lib/monthlyResults';
import {
  documentBorderSelection,
  framePaddingMm,
  isDocumentBorderImage,
  measureFrameInset,
  resolveDocumentBorder,
  type DocumentBorderImage,
} from '../../utils/documentBorder';

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

  it('resolves built-in choices, defaults and uploads per document', () => {
    expect(resolveDocumentBorder('certificateBorder', undefined)?.dataUrl).toMatch(/frame-orange\.jpg$/);
    expect(resolveDocumentBorder('honorRollBorder', undefined)).toBeUndefined();
    expect(resolveDocumentBorder('honorRollNameBanner', undefined)?.dataUrl).toMatch(/name-plaque\.png$/);
    expect(resolveDocumentBorder('certificateBorder', border)).toBe(border);
    // A landscape frame on the portrait honor roll is turned, and its widths follow the turn.
    const blue = resolveDocumentBorder('honorRollBorder', { presetId: 'frame-blue' });
    expect(blue?.rotate).toBe(true);
    expect(blue?.inner?.top).toBeCloseTo(0.059);
    expect(blue?.inner?.right).toBeCloseTo(0.083);
    // The crest frame is offered for the certificate only.
    expect(documentBorderSelection('honorRollBorder', { presetId: 'frame-gold-crest' })).toBeNull();
    expect(documentBorderSelection('certificateBorder', { presetId: 'frame-gold-crest' })).toBe('frame-gold-crest');
    expect(documentBorderSelection('honorRollBorder', { presetId: null })).toBeNull();
  });

  it('keeps text clear of the frame: padding grows with the frame width', () => {
    const inner = { top: 0.146, right: 0.072, bottom: 0.164, left: 0.071 };
    const pad = framePaddingMm(inner, 297, 210, { top: 22, right: 30, bottom: 22, left: 30 });
    expect(pad.top).toBe(Math.ceil(0.146 * 210 + 4));
    expect(pad.bottom).toBe(Math.ceil(0.164 * 210 + 4));
    expect(pad.left).toBe(30);
  });

  it('measures the frame width of an image', () => {
    const W = 100;
    const H = 80;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    // 10 px dark band on the left/right, 8 px on top/bottom
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < 10 || x >= W - 10 || y < 8 || y >= H - 8) {
          const o = (y * W + x) * 4;
          data[o] = data[o + 1] = data[o + 2] = 0;
        }
      }
    }
    const inset = measureFrameInset({ data, width: W, height: H } as ImageData);
    expect(inset.left).toBeCloseTo(0.1, 1);
    expect(inset.right).toBeCloseTo(0.1, 1);
    expect(inset.top).toBeCloseTo(0.1, 1);
    expect(inset.bottom).toBeCloseTo(0.1, 1);
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
    expect(page.style.padding).toBe('22mm 30mm');
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
      cert.container.querySelector('img[src$="images/frames/frame-orange.jpg"]')
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
