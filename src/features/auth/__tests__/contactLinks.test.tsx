// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthStatusScreen } from '../AuthStatusScreen';
import { AppleSidebar } from '../../../components/layout/AppleSidebar';
import { ADMIN_TELEGRAM_URL } from '../../../lib/contact';

afterEach(() => cleanup());

const expectTelegramLink = (el: HTMLElement) => {
  expect(el.getAttribute('href')).toBe('https://t.me/Sithpong');
  expect(el.getAttribute('target')).toBe('_blank');
  expect(el.getAttribute('rel')).toContain('noopener');
};

describe('Contact admin on Telegram (teacher request 2026-11-21)', () => {
  it('uses the teacher’s Telegram link', () => {
    expect(ADMIN_TELEGRAM_URL).toBe('https://t.me/Sithpong');
  });

  it.each(['pending', 'rejected', 'disabled'] as const)(
    'shows the Telegram button on the %s screen',
    (status) => {
      render(<AuthStatusScreen status={status} />);
      const link = screen.getByTestId('contact-admin-telegram');
      expectTelegramLink(link);
      expect(link.textContent).toContain('ទាក់ទង Admin តាម Telegram');
    }
  );

  it('shows the Telegram link in the Sidebar', () => {
    render(
      <AppleSidebar
        profile={{
          teacherName: 'គ្រូ សាកល្បង',
          schoolName: 'សាលាសាកល្បង',
          directorName: 'នាយក',
          academicYear: '2026-2027',
        }}
      />
    );
    const links = screen.getAllByTestId('sidebar-contact-telegram');
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach(expectTelegramLink);
  });
});
