// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportRosterExcel, safeSheetName } from '../excelExport';
import type { Profile, SchoolClass, Student } from '../../types/domain';

describe('excelExport safety helpers', () => {
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('sanitizes Excel sheet names, respects 31-char limit without splitting surrogate pairs, and falls back when empty', () => {
    expect(safeSheetName('8/A\\B*C?D:E[F]G')).toBe('8_A_B_C_D_E_F_G');
    expect(safeSheetName('   ', 'Fallback')).toBe('Fallback');
    expect(safeSheetName('///', 'Sheet1')).toBe('___');

    // Surrogate pair at index 30..31: should back up to 30 rather than leaving an orphan high surrogate
    const emojiAtBoundary = `${'a'.repeat(30)}😀tail`;
    const result = safeSheetName(emojiAtBoundary);
    expect(result.length).toBeLessThanOrEqual(31);
    expect(result).toBe('a'.repeat(30));
  });

  it('exports roster Excel without throwing when class name contains "/" like "8/A"', async () => {
    const cls: SchoolClass = {
      id: 1,
      name: '8/A',
      gradeLevel: 8,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    };
    const students: Student[] = [
      {
        id: 1,
        classId: 1,
        order: 1,
        studentId: 'KD-01',
        nameKm: 'កែវ ម៉ាលី',
        gender: 'ស្រី',
        dateOfBirth: '01/01/2013',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const profile: Profile = {
      teacherName: 'សុខ ដារ៉ា',
      schoolName: 'អនុវិទ្យាល័យ កំពង់',
      directorName: 'ជា សារ៉ា',
      province: 'កណ្ដាល',
      academicYear: '2026-2027',
    };

    const fileName = await exportRosterExcel(cls, students, profile, false);
    expect(fileName).toBe('បញ្ជីហៅឈ្មោះ_8_A_2026-2027.xlsx');
  }, 15000);
});
