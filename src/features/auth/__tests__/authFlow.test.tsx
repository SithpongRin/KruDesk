// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  clearCachedAuthStatus,
  readCachedAuthStatus,
  writeCachedAuthStatus,
} from '../authCache';
import { isIosStandalonePwa, sanitizeDisplayName, sanitizePhotoURL } from '../authService';
import { LoginScreen } from '../LoginScreen';
import { AuthStatusScreen } from '../AuthStatusScreen';
import { AdminUsersCard } from '../AdminUsersCard';
import { useAuthStore } from '../useAuthStore';
import { AppleSidebar } from '../../../components/layout/AppleSidebar';

describe('Auth & Admin UI and offline cache (§4)', () => {
  beforeEach(() => {
    clearCachedAuthStatus();
    useAuthStore.setState({
      authReady: true,
      authRequired: true,
      user: null,
      status: null,
      isAdmin: false,
      isChecking: false,
      isSigningIn: false,
      authError: null,
      pendingUsersCount: 0,
      managedUsers: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('caches offline auth status per-uid only and never returns it for a different uid', () => {
    writeCachedAuthStatus({
      uid: 'uid-teacher-1',
      email: 't1@example.com',
      status: 'approved',
      isAdmin: false,
      checkedAt: 1700000000000,
    });

    const hit = readCachedAuthStatus('uid-teacher-1');
    expect(hit).toEqual({
      uid: 'uid-teacher-1',
      email: 't1@example.com',
      status: 'approved',
      isAdmin: false,
      checkedAt: 1700000000000,
    });

    // Different uid on the same computer must NEVER inherit uid-teacher-1's approved cache
    expect(readCachedAuthStatus('uid-teacher-2')).toBeNull();

    clearCachedAuthStatus();
    expect(readCachedAuthStatus('uid-teacher-1')).toBeNull();
  });

  it('sanitizes displayName (<= 200 chars) and photoURL (<= 2048 chars)', () => {
    expect(sanitizeDisplayName('  គ្រូ សុខា  ')).toBe('គ្រូ សុខា');
    expect(sanitizeDisplayName('')).toBeNull();
    expect(sanitizeDisplayName('ក'.repeat(500))?.length).toBe(200);

    expect(sanitizePhotoURL('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(sanitizePhotoURL('https://example.com/' + 'a'.repeat(2100))).toBeNull();
  });

  it('detects iOS standalone PWA for signInWithRedirect fallback', () => {
    // iPhone in standalone PWA mode (navigator.standalone = true)
    expect(
      isIosStandalonePwa(
        {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
          standalone: true,
        },
        false
      )
    ).toBe(true);

    // iPadOS (MacIntel + maxTouchPoints > 1) in display-mode: standalone
    expect(
      isIosStandalonePwa(
        {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        },
        true
      )
    ).toBe(true);

    // Regular iPhone Safari tab (not standalone) -> uses popup
    expect(
      isIosStandalonePwa(
        {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
          standalone: false,
        },
        false
      )
    ).toBe(false);

    // Desktop Chrome PWA -> uses popup
    expect(
      isIosStandalonePwa(
        {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          platform: 'Win32',
          maxTouchPoints: 0,
        },
        true
      )
    ).toBe(false);
  });

  it('renders LoginScreen with Google sign-in button and admin approval notice', () => {
    const signInSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ signIn: signInSpy, authError: 'ការចូលប្រើត្រូវបានបោះបង់។' });

    render(<LoginScreen />);

    expect(screen.getByText('ចូលប្រើដោយ Google')).toBeTruthy();
    expect(screen.getByText('ត្រូវការការអនុញ្ញាតពី Admin')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('ការចូលប្រើត្រូវបានបោះបង់។');

    fireEvent.click(screen.getByText('ចូលប្រើដោយ Google'));
    expect(signInSpy).toHaveBeenCalledTimes(1);
  });

  it('renders pending, rejected, and disabled status screens with email and sign-out button', () => {
    const recheckSpy = vi.fn().mockResolvedValue(undefined);
    const signOutSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        uid: 'u1',
        email: 'teacher@example.com',
        displayName: 'គ្រូ សាកល្បង',
        photoURL: null,
      },
      recheckStatus: recheckSpy,
      signOut: signOutSpy,
    });

    const { rerender } = render(<AuthStatusScreen status="pending" />);
    expect(
      screen.getByText('គណនីរបស់អ្នកកំពុងរង់ចាំការអនុញ្ញាតពី Admin')
    ).toBeTruthy();
    expect(screen.getByText('teacher@example.com')).toBeTruthy();
    fireEvent.click(screen.getByText('ពិនិត្យម្ដងទៀត'));
    expect(recheckSpy).toHaveBeenCalledTimes(1);

    rerender(<AuthStatusScreen status="rejected" />);
    expect(screen.getByText('សំណើរបស់អ្នកមិនត្រូវបានអនុញ្ញាតទេ')).toBeTruthy();
    expect(screen.queryByText('ពិនិត្យម្ដងទៀត')).toBeNull();

    rerender(<AuthStatusScreen status="disabled" />);
    expect(
      screen.getByText('គណនីរបស់អ្នកត្រូវបានផ្អាក សូមទាក់ទង Admin')
    ).toBeTruthy();

    fireEvent.click(screen.getByText('ចាកចេញ'));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it('renders AdminUsersCard only for admin, hides action buttons on admin own row, and shows pending badge in sidebar', () => {
    // Non-admin: AdminUsersCard renders nothing
    useAuthStore.setState({
      isAdmin: false,
      user: {
        uid: 'u-normal',
        email: 'teacher@example.com',
        displayName: 'គ្រូ ធម្មតា',
        photoURL: null,
      },
    });
    const { container, unmount } = render(<AdminUsersCard />);
    expect(container.innerHTML).toBe('');
    unmount();

    // Admin user with pending, approved (including own admin doc), and disabled users
    useAuthStore.setState({
      isAdmin: true,
      pendingUsersCount: 1,
      user: {
        uid: 'u-admin',
        email: 'admin@example.com',
        displayName: 'Admin Teacher',
        photoURL: null,
      },
      managedUsers: [
        {
          uid: 'u-pending',
          email: 'pending@example.com',
          displayName: 'គ្រូ រង់ចាំ',
          photoURL: null,
          status: 'pending',
          createdAtMs: 1700000000000,
          reviewedAtMs: null,
          reviewedBy: null,
        },
        {
          uid: 'u-admin',
          email: 'admin@example.com',
          displayName: 'Admin Teacher',
          photoURL: null,
          status: 'approved',
          createdAtMs: 1700000000000,
          reviewedAtMs: null,
          reviewedBy: null,
        },
        {
          uid: 'u-approved',
          email: 'approved@example.com',
          displayName: 'គ្រូ អនុញ្ញាត',
          photoURL: null,
          status: 'approved',
          createdAtMs: 1700000000000,
          reviewedAtMs: null,
          reviewedBy: 'admin@example.com',
        },
        {
          uid: 'u-disabled',
          email: 'disabled@example.com',
          displayName: 'គ្រូ ផ្អាក',
          photoURL: null,
          status: 'disabled',
          createdAtMs: 1700000000000,
          reviewedAtMs: null,
          reviewedBy: 'admin@example.com',
        },
      ],
    });

    render(
      <>
        <AppleSidebar
          profile={{
            teacherName: 'Admin Teacher',
            schoolName: 'សាលាសាកល្បង',
            directorName: 'នាយក',
            academicYear: '2026-2027',
          }}
        />
        <AdminUsersCard />
      </>
    );

    // Sidebar pending count badge is visible on Settings
    expect(screen.getAllByLabelText('ចំនួនអ្នករង់ចាំអនុញ្ញាត').length).toBeGreaterThanOrEqual(1);

    // Pending tab shows pending user with «អនុញ្ញាត» and «បដិសេធ»
    expect(screen.getByText('គ្រូ រង់ចាំ')).toBeTruthy();
    expect(screen.getByText('អនុញ្ញាត')).toBeTruthy();
    expect(screen.getByText('បដិសេធ')).toBeTruthy();

    // Switch to «បានអនុញ្ញាត» tab: both Admin Teacher and គ្រូ អនុញ្ញាត are listed,
    // but only 1 «ផ្អាក» button is rendered (Admin's own row has no «ផ្អាក» button!)
    fireEvent.click(screen.getByRole('tab', { name: /បានអនុញ្ញាត/ }));
    expect(screen.getByText('គ្រូ អនុញ្ញាត')).toBeTruthy();
    expect(screen.getAllByText('ផ្អាក').length).toBe(1);

    // Switch to «បានបដិសេធ/ផ្អាក» tab: shows «បើកវិញ»
    fireEvent.click(screen.getByRole('tab', { name: /បានបដិសេធ\/ផ្អាក/ }));
    expect(screen.getByText('គ្រូ ផ្អាក')).toBeTruthy();
    expect(screen.getByText('បើកវិញ')).toBeTruthy();
  });
});
