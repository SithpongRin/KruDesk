import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from '../AppleSidebar';

describe('AppleSidebar NAV_ITEMS', () => {
  it('places roster («បញ្ជីហៅឈ្មោះ») right after students and renames attendance to «បញ្ជីវត្តមាន»', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      'dashboard',
      'students',
      'roster',
      'attendance',
      'scores',
      'cards',
      'settings',
    ]);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'ផ្ទាំងដើម',
      'សិស្ស',
      'បញ្ជីហៅឈ្មោះ',
      'បញ្ជីវត្តមាន',
      'បញ្ជីពិន្ទុ',
      'កាតសិស្ស',
      'ការកំណត់',
    ]);
  });
});
