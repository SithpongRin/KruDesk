import { describe, it, expect } from 'vitest';
import { compareKhmerNames } from '../khmerSort';

describe('Khmer alphabetical sorting (ក → អ)', () => {
  it('orders Khmer student names according to Khmer consonant order ក..អ', () => {
    const names = [
      'អ៊ុយ សុខា',
      'សុខ សុវណ្ណារ៉ា',
      'ចាន់ ស្រីនិច',
      'កែវ វិបុល',
      'គង់ ដារ៉ា',
      'ខាន់ ម៉ាលី',
    ];

    const sorted = [...names].sort(compareKhmerNames);
    expect(sorted).toEqual([
      'កែវ វិបុល',
      'ខាន់ ម៉ាលី',
      'គង់ ដារ៉ា',
      'ចាន់ ស្រីនិច',
      'សុខ សុវណ្ណារ៉ា',
      'អ៊ុយ សុខា',
    ]);
  });

  it('orders Khmer names with numeric suffixes naturally', () => {
    const names = ['សុខ 10', 'សុខ 2', 'សុខ 1'];
    expect([...names].sort(compareKhmerNames)).toEqual(['សុខ 1', 'សុខ 2', 'សុខ 10']);
  });
});
