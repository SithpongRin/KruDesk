export const CAMBODIA_PROVINCES: string[] = [
  'ភ្នំពេញ',
  'កណ្ដាល',
  'កំពង់ចាម',
  'កំពង់ឆ្នាំង',
  'កំពង់ធំ',
  'កំពង់ស្ពឺ',
  'កំពត',
  'កែប',
  'កោះកុង',
  'ក្រចេះ',
  'តាកែវ',
  'ត្បូងឃ្មុំ',
  'បន្ទាយមានជ័យ',
  'បាត់ដំបង',
  'ប៉ៃលិន',
  'ពោធិ៍សាត់',
  'ព្រះវិហារ',
  'ព្រះសីហនុ',
  'ព្រៃវែង',
  'មណ្ឌលគិរី',
  'រតនគិរី',
  'សៀមរាប',
  'ស្ទឹងត្រែង',
  'ស្វាយរៀង',
  'ឧត្តរមានជ័យ',
];

/**
 * Formats Cambodian MoEYS Provincial/Municipal Department of Education header from profile province:
 * - ភ្នំពេញ -> មន្ទីរអប់រំ យុវជន និងកីឡារាជធានីភ្នំពេញ
 * - កណ្ដាល (or ខេត្ត កណ្ដាល) -> មន្ទីរអប់រំ យុវជន និងកីឡាខេត្ត កណ្ដាល
 */
export function formatMinistryDepartment(province?: string): string {
  const raw = (province || '').trim();
  if (!raw) return '';

  if (raw === 'ភ្នំពេញ' || raw === 'រាជធានីភ្នំពេញ' || raw === 'រាជធានី ភ្នំពេញ') {
    return 'មន្ទីរអប់រំ យុវជន និងកីឡារាជធានីភ្នំពេញ';
  }
  if (raw.startsWith('រាជធានី')) {
    return `មន្ទីរអប់រំ យុវជន និងកីឡា${raw}`;
  }

  const cleanProvince = raw.replace(/^ខេត្ត\s*/, '').trim();
  if (!cleanProvince) return '';
  return `មន្ទីរអប់រំ យុវជន និងកីឡាខេត្ត ${cleanProvince}`;
}
