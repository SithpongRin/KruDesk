import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, getNavItems } from '../AppleSidebar';

describe('AppleSidebar NAV_ITEMS', () => {
  it('has the exact sidebar order and Khmer labels including monthlyResults, honorRoll, and certificates', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      'dashboard',
      'students',
      'roster',
      'attendance',
      'scores',
      'monthlyResults',
      'honorRoll',
      'certificates',
      'cards',
      'settings',
    ]);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'ផ្ទាំងដើម',
      'សិស្ស',
      'បញ្ជីហៅឈ្មោះ',
      'បញ្ជីវត្តមាន',
      'បញ្ជីពិន្ទុ',
      'លទ្ធផលប្រចាំខែ',
      'តារាងកិត្តិយស',
      'ប័ណ្ណសរសើរ',
      'កាតសិស្ស',
      'ការកំណត់',
    ]);
  });

  it('inserts គ្រប់គ្រងអ្នកប្រើ right above ការកំណត់ only when isAdmin is true', () => {
    expect(getNavItems(false).map((item) => item.id)).not.toContain('adminUsers');
    const adminItems = getNavItems(true);
    expect(adminItems.map((item) => item.id)).toEqual([
      'dashboard',
      'students',
      'roster',
      'attendance',
      'scores',
      'monthlyResults',
      'honorRoll',
      'certificates',
      'cards',
      'adminUsers',
      'settings',
    ]);
    expect(adminItems.find((item) => item.id === 'adminUsers')?.label).toBe('គ្រប់គ្រងអ្នកប្រើ');
  });
});
