const khmerCollator = new Intl.Collator('km', {
  sensitivity: 'base',
  numeric: true,
});

/**
 * Compares two Khmer strings in Khmer alphabetical order (ក → អ).
 */
export function compareKhmerNames(a: string, b: string): number {
  return khmerCollator.compare(a.trim(), b.trim());
}
