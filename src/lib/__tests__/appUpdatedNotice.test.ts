import { describe, expect, it } from 'vitest';
import { consumeAppUpdatedNotice, LAST_SEEN_COMMIT_KEY } from '../appVersion';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('consumeAppUpdatedNotice', () => {
  it('reports the first recorded start and records the build', () => {
    const s = memoryStorage();
    expect(consumeAppUpdatedNotice(s, 'aaa1111')).toBe('first');
    expect(s.data.get(LAST_SEEN_COMMIT_KEY)).toBe('aaa1111');
  });

  it('tells once when the build changed, then stays quiet', () => {
    const s = memoryStorage({ [LAST_SEEN_COMMIT_KEY]: 'aaa1111' });
    expect(consumeAppUpdatedNotice(s, 'bbb2222')).toBe('updated');
    expect(consumeAppUpdatedNotice(s, 'bbb2222')).toBe('same');
  });

  it('ignores dev builds', () => {
    const s = memoryStorage({ [LAST_SEEN_COMMIT_KEY]: 'aaa1111' });
    expect(consumeAppUpdatedNotice(s, 'dev')).toBe('same');
  });
});
