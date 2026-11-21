import { describe, expect, it, vi } from 'vitest';
import { shrinkImagesInSettingValue } from '../settingImageCompression';

const big = (prefix: string, kb: number) => `${prefix}${'A'.repeat(kb * 1024)}`;

describe('shrinkImagesInSettingValue (sync copy of stamp / signature / border images)', () => {
  it('returns the very same value when it already fits the budget', async () => {
    const value = { key: 'teacherSignature', value: { dataUrl: big('data:image/png;base64,', 10), width: 900, height: 300 } };
    const reencode = vi.fn();
    const out = await shrinkImagesInSettingValue(value, 100 * 1024, reencode);
    expect(out).toBe(value);
    expect(reencode).not.toHaveBeenCalled();
  });

  it('re-encodes an oversized image until the setting fits, keeping other fields and the original intact', async () => {
    const original = big('data:image/png;base64,', 2000);
    const value = { key: 'directorStamp', value: { dataUrl: original, width: 900, height: 900 } };
    // Re-encodes from the ORIGINAL each time; step N is smaller (like scaling the long side by 0.8^N)
    const reencode = vi.fn(
      async (dataUrl: string, step: number) =>
        `data:image/webp;base64,${'B'.repeat(Math.floor(dataUrl.length / Math.pow(2, step + 1)))}`
    );
    const out = await shrinkImagesInSettingValue(value, 300 * 1024, reencode);

    expect(JSON.stringify(out).length).toBeLessThanOrEqual(300 * 1024);
    expect(out.value.dataUrl.startsWith('data:image/webp')).toBe(true);
    expect(out.value.width).toBe(900);
    expect(out.value.height).toBe(900);
    expect(out.key).toBe('directorStamp');
    // the local original is not mutated
    expect(value.value.dataUrl).toBe(original);
  });

  it('shrinks the largest image first and stops as soon as it fits', async () => {
    const value = {
      key: 'x',
      value: {
        a: { dataUrl: big('data:image/png;base64,', 600) },
        b: { dataUrl: big('data:image/png;base64,', 100) },
      },
    };
    const calls: number[] = [];
    const reencode = async (dataUrl: string) => {
      calls.push(dataUrl.length);
      return 'data:image/webp;base64,small';
    };
    const out = await shrinkImagesInSettingValue(value, 300 * 1024, reencode);
    expect(calls).toHaveLength(1);
    expect(out.value.a.dataUrl).toBe('data:image/webp;base64,small');
    expect(out.value.b.dataUrl).toBe(value.value.b.dataUrl);
  });

  it('gives up without throwing when no smaller encoding is possible (oversize error path stays)', async () => {
    const value = { key: 'directorStamp', value: { dataUrl: big('data:image/png;base64,', 1200), width: 1, height: 1 } };
    const out = await shrinkImagesInSettingValue(value, 100 * 1024, async () => null);
    expect(JSON.stringify(out).length).toBeGreaterThan(100 * 1024);
  });

  it('ignores non-image strings (e.g. text settings) and values without images', async () => {
    const value = { key: 'documentPlace', value: 'X'.repeat(200 * 1024) };
    const reencode = vi.fn();
    const out = await shrinkImagesInSettingValue(value, 100 * 1024, reencode);
    expect(out).toBe(value);
    expect(reencode).not.toHaveBeenCalled();
  });
});
