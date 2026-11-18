// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toCardStudent, applyProfileToTemplate } from '../../lib/cardAdapter';
import { defaultReferenceTemplate } from '../../db/defaultTemplates';
import type { Profile, SchoolClass, Student as DomainStudent } from '../../types/domain';

interface MockPixelImage {
  src: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  rgba: Uint8ClampedArray;
}

/**
 * Lightweight deterministic RGBA software 2D canvas that rasterizes rectangles, stroked lines,
 * image blits, and text bounding boxes directly into a Uint8ClampedArray pixel buffer so two
 * CardCanvasRenderer implementations can be compared pixel-by-pixel in Vitest.
 */
function createRgbaCanvas(width: number, height: number) {
  const buf = new Uint8ClampedArray(width * height * 4);
  buf.fill(255);

  const parseColor = (cssColor: string): [number, number, number] => {
    const hex = cssColor.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
    }
    return [22, 61, 126];
  };

  const stateStack: Array<{
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    globalAlpha: number;
    font: string;
    textAlign: string;
    textBaseline: string;
  }> = [];

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '14px Battambang',
    textAlign: 'left',
    textBaseline: 'top',
    _path: [] as Array<{ x: number; y: number; move: boolean }>,
    save() {
      stateStack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        globalAlpha: this.globalAlpha,
        font: this.font,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
      });
    },
    restore() {
      const prev = stateStack.pop();
      if (prev) Object.assign(this, prev);
    },
    setLineDash() {},
    beginPath() {
      this._path = [];
    },
    moveTo(x: number, y: number) {
      this._path.push({ x, y, move: true });
    },
    lineTo(x: number, y: number) {
      this._path.push({ x, y, move: false });
    },
    _blendPixel(px: number, py: number, rgb: [number, number, number], alpha = 1) {
      const ix = Math.round(px);
      const iy = Math.round(py);
      if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
      const idx = (iy * width + ix) * 4;
      const a = Math.max(0, Math.min(1, alpha * this.globalAlpha));
      buf[idx] = Math.round(buf[idx] * (1 - a) + rgb[0] * a);
      buf[idx + 1] = Math.round(buf[idx + 1] * (1 - a) + rgb[1] * a);
      buf[idx + 2] = Math.round(buf[idx + 2] * (1 - a) + rgb[2] * a);
      buf[idx + 3] = 255;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const rgb = parseColor(this.fillStyle);
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(width, Math.ceil(x + w));
      const y1 = Math.min(height, Math.ceil(y + h));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          this._blendPixel(px, py, rgb);
        }
      }
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      const rgb = parseColor(this.strokeStyle);
      const lw = Math.max(1, Math.round(this.lineWidth));
      for (let t = 0; t < lw; t++) {
        for (let px = Math.floor(x); px <= Math.ceil(x + w); px++) {
          this._blendPixel(px, y + t, rgb);
          this._blendPixel(px, y + h - t, rgb);
        }
        for (let py = Math.floor(y); py <= Math.ceil(y + h); py++) {
          this._blendPixel(x + t, py, rgb);
          this._blendPixel(x + w - t, py, rgb);
        }
      }
    },
    stroke() {
      const rgb = parseColor(this.strokeStyle);
      for (let i = 1; i < this._path.length; i++) {
        const a = this._path[i - 1];
        const b = this._path[i];
        if (b.move) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
        for (let s = 0; s <= steps; s++) {
          this._blendPixel(
            a.x + ((b.x - a.x) * s) / steps,
            a.y + ((b.y - a.y) * s) / steps,
            rgb
          );
        }
      }
    },
    measureText(text: string) {
      const match = /\b(\d+)px\b/.exec(this.font);
      const size = match ? Number(match[1]) : 14;
      return { width: text.length * size * 0.55 };
    },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      if (!text) return;
      const rgb = parseColor(this.fillStyle);
      const match = /\b(\d+)px\b/.exec(this.font);
      const size = Math.max(6, match ? Number(match[1]) : 14);
      const rawW = Math.min(text.length * size * 0.55, maxWidth ?? Infinity);
      const startX =
        this.textAlign === 'center' ? x - rawW / 2 : this.textAlign === 'right' ? x - rawW : x;
      const endX = Math.min(width, Math.ceil(startX + rawW));
      const yEnd = Math.min(height, Math.ceil(y + size * 0.7));
      for (let py = Math.max(0, Math.floor(y)); py < yEnd; py++) {
        for (let px = Math.max(0, Math.floor(startX)); px < endX; px++) {
          // Deterministic per-character hash footprint inside text box
          const ch = text.charCodeAt((px + py) % text.length);
          if ((px + py + ch) % 3 === 0) {
            this._blendPixel(px, py, rgb);
          }
        }
      }
    },
    drawImage(
      img: MockPixelImage,
      a1: number,
      a2: number,
      a3?: number,
      a4?: number,
      a5?: number,
      a6?: number,
      a7?: number,
      a8?: number
    ) {
      const hasSrcRect = a8 !== undefined;
      const sx = hasSrcRect ? a1 : 0;
      const sy = hasSrcRect ? a2 : 0;
      const sw = hasSrcRect ? a3! : img.width;
      const sh = hasSrcRect ? a4! : img.height;
      const dx = hasSrcRect ? a5! : a1;
      const dy = hasSrcRect ? a6! : a2;
      const dw = hasSrcRect ? a7! : a3 || img.width;
      const dh = hasSrcRect ? a8! : a4 || img.height;

      const x0 = Math.max(0, Math.floor(dx));
      const y0 = Math.max(0, Math.floor(dy));
      const x1 = Math.min(width, Math.ceil(dx + dw));
      const y1 = Math.min(height, Math.ceil(dy + dh));
      for (let py = y0; py < y1; py++) {
        const ty = Math.min(
          img.height - 1,
          Math.max(0, Math.floor(sy + ((py - dy) / dh) * sh))
        );
        for (let px = x0; px < x1; px++) {
          const tx = Math.min(
            img.width - 1,
            Math.max(0, Math.floor(sx + ((px - dx) / dw) * sw))
          );
          const sIdx = (ty * img.width + tx) * 4;
          if (img.rgba) {
            this._blendPixel(
              px,
              py,
              [img.rgba[sIdx], img.rgba[sIdx + 1], img.rgba[sIdx + 2]],
              img.rgba[sIdx + 3] / 255
            );
          } else {
            this._blendPixel(px, py, [80, 120, 200], 1);
          }
        }
      }
    },
  };

  return {
    width,
    height,
    rgba: buf,
    getContext: () => ctx,
  };
}

function makeDeterministicPhotoRgba(w = 120, h = 160): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dist = Math.hypot(x - w / 2, y - h * 0.4);
      const isPortrait = dist < 34;
      rgba[idx] = isPortrait ? 30 : 210;
      rgba[idx + 1] = isPortrait ? 58 : 230;
      rgba[idx + 2] = isPortrait ? 138 : 250;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

// The original card app only exists on the developer's machine (sibling folder of this repo).
// On CI (GitHub Actions) it is absent, so these parity checks are skipped there.
const ORIGINAL_RENDERER_PATH = path.resolve(
  __dirname,
  '../../../../កាតសិស្ស System/src/services/CardCanvasRenderer.ts'
);
const hasOriginalCardApp = fs.existsSync(ORIGINAL_RENDERER_PATH);

describe.skipIf(!hasOriginalCardApp)('CardCanvasRenderer parity with original Student Card app', () => {
  const origCreateElement = document.createElement.bind(document);
  const OrigImage = globalThis.Image;

  beforeEach(() => {
    const samplePhotoRgba = makeDeterministicPhotoRgba(120, 160);
    // Deterministic Image loader returning real dimensions + pixel buffer
    class MockImage {
      src = '';
      crossOrigin = '';
      width = 120;
      height = 160;
      naturalWidth = 120;
      naturalHeight = 160;
      rgba = samplePhotoRgba;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    document.createElement = ((tag: string) => {
      if (tag === 'canvas') {
        const stub: any = {
          width: 300,
          height: 150,
          _backing: null as ReturnType<typeof createRgbaCanvas> | null,
          getContext() {
            this._backing = createRgbaCanvas(this.width, this.height);
            return this._backing.getContext();
          },
          get _rgba() {
            return this._backing?.rgba;
          },
        };
        return stub;
      }
      return origCreateElement(tag);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = origCreateElement;
    vi.stubGlobal('Image', OrigImage);
  });

  it('keeps identical rendering implementation except the Student type import path', () => {
    const origPath = ORIGINAL_RENDERER_PATH;
    const copyPath = path.resolve(__dirname, '../CardCanvasRenderer.ts');

    const norm = (text: string) =>
      text
        .replace(/\r\n/g, '\n')
        .replace(
          /^import (?:type )?\{ Student \} from '\.\.\/types\/(?:student|cardStudent)';/,
          "import type { Student } from 'STUDENT_TYPE';"
        );

    const orig = fs.readFileSync(origPath, 'utf8');
    const copy = fs.readFileSync(copyPath, 'utf8');
    expect(norm(copy)).toBe(norm(orig));
  });

  it('renders identical pixels (0 differing pixels) at 300 DPI for Front and Back cards between Original app and KruDesk', async () => {
    // Runtime path so Vite does not try to resolve it when the folder is missing (CI).
    // import.meta.glob matches nothing (instead of failing) when the folder is missing (CI).
    const originalLoaders = import.meta.glob<typeof import('../CardCanvasRenderer')>(
      '../../../../កាតសិស្ស System/src/services/CardCanvasRenderer.ts'
    );
    const loadOriginal = Object.values(originalLoaders)[0];
    expect(loadOriginal).toBeTypeOf('function');
    const origModule = await loadOriginal();
    const copyModule = await import('../CardCanvasRenderer');

    const domainStudent: DomainStudent = {
      id: 1,
      classId: 1,
      order: 1,
      studentId: 'KD-001',
      nameKm: 'កែវ ម៉ាលី',
      gender: 'ស្រី',
      dateOfBirth: '15/04/2013',
      placeOfBirth: 'ភ្នំពេញ',
      fatherName: 'កែវ សុខា',
      fatherOccupation: 'កសិករ',
      motherName: 'ចាន់ នារី',
      motherOccupation: 'មេផ្ទះ',
      address: 'ភូមិ១ ឃុំដំណាក់ព្រីង',
      cardNumber: '001',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    };
    const cls: SchoolClass = {
      id: 1,
      name: '៧ក',
      gradeLevel: 7,
      academicYear: '2026-2027',
      color: '#0071e3',
      subjects: [],
      createdAt: 1,
    };
    const profile: Profile = {
      teacherName: 'លោកគ្រូ សុខ ដារ៉ា',
      schoolName: 'អនុវិទ្យាល័យ ដំណាក់ព្រីង',
      directorName: 'ជា សារ៉ា',
      academicYear: '2026-2027',
    };

    const photoUrl = 'data:image/jpeg;base64,DETERMINISTIC_TEST_PHOTO';
    const cardStudent = toCardStudent(domainStudent, cls, photoUrl);
    const tpl = applyProfileToTemplate(defaultReferenceTemplate, profile, cls.academicYear);

    const origFront: any = await origModule.renderFrontCardToCanvas(cardStudent as any, tpl, {
      widthMm: 81,
      heightMm: 116,
    });
    const copyFront: any = await copyModule.renderFrontCardToCanvas(cardStudent, tpl, {
      widthMm: 81,
      heightMm: 116,
    });

    const origBack: any = await origModule.renderBackCardToCanvas(tpl, {
      widthMm: 81,
      heightMm: 116,
    });
    const copyBack: any = await copyModule.renderBackCardToCanvas(tpl, {
      widthMm: 81,
      heightMm: 116,
    });

    expect(copyFront.width).toBe(origFront.width);
    expect(copyFront.height).toBe(origFront.height);

    const countDiffPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
          diff++;
        }
      }
      return diff;
    };

    const frontDiff = countDiffPixels(origFront._rgba, copyFront._rgba);
    const backDiff = countDiffPixels(origBack._rgba, copyBack._rgba);

    expect(frontDiff).toBe(0);
    expect(backDiff).toBe(0);
  });
});
