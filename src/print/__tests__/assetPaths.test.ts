import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getAssetUrl } from '../../utils/assets';

/**
 * The app is served from a sub-path (vite `base: '/KruDesk/'`). A root-absolute
 * `src="/images/..."` therefore points outside the app and 404s on GitHub Pages,
 * which made PDF export fail (html-to-image cannot embed a missing image).
 * Use `getAssetUrl('images/...')` instead.
 */
const SRC_DIR = join(__dirname, '..', '..');
const ROOT_ABSOLUTE_ASSET = /src\s*=\s*["'{`]\s*['"`]?\/(images|fonts|icons)\//;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(tsx|ts)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('asset paths', () => {
  it('getAssetUrl prefixes the app base path (/ or /KruDesk/)', () => {
    const base = import.meta.env.BASE_URL || '/KruDesk/';
    expect(getAssetUrl('images/flourishes/flourish_1_clean.png')).toBe(
      `${base}images/flourishes/flourish_1_clean.png`
    );
    expect(getAssetUrl('/images/a.png')).toBe(`${base}images/a.png`);
    expect(getAssetUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
  });

  it('never uses a root-absolute src for public assets', () => {
    const offenders = listSourceFiles(SRC_DIR).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => ROOT_ABSOLUTE_ASSET.test(line))
        .map(({ line, i }) => `${relative(SRC_DIR, file)}:${i + 1}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
