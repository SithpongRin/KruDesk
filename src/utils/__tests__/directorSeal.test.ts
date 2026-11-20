import { describe, expect, it } from 'vitest';
import {
  enhanceInk,
  inkBounds,
  isSealImage,
  paperLuminance,
  whiteToTransparent,
} from '../directorSeal';

function rgba(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => data.set([r, g, b, 255], i * 4));
  return data;
}

describe('director stamp / signature images', () => {
  it('makes white paper transparent and keeps the ink', () => {
    const data = rgba([
      [255, 255, 255], // paper
      [240, 240, 236], // greyish paper from a phone photo
      [200, 30, 30], // red stamp ink
      [30, 58, 138], // blue signature ink
    ]);
    whiteToTransparent(data);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(0);
    expect(data[11]).toBe(255);
    expect(data[15]).toBe(255);
  });

  it('finds the ink box to trim to', () => {
    const W = 5;
    const H = 4;
    const data = new Uint8ClampedArray(W * H * 4);
    data[(1 * W + 2) * 4 + 3] = 255;
    data[(2 * W + 3) * 4 + 3] = 255;
    expect(inkBounds(data, W, H)).toEqual({ x: 2, y: 1, w: 2, h: 2 });
    expect(inkBounds(new Uint8ClampedArray(W * H * 4), W, H)).toBeNull();
  });

  it('accepts only stored image data URLs', () => {
    expect(isSealImage({ dataUrl: 'data:image/png;base64,AA', width: 1, height: 1 })).toBe(true);
    expect(isSealImage({ dataUrl: 'https://x/y.png', width: 1, height: 1 })).toBe(false);
    expect(isSealImage(null)).toBe(false);
  });

  it('measures greyish phone-photo paper', () => {
    const pixels: Array<[number, number, number]> = [];
    for (let i = 0; i < 90; i++) pixels.push([220, 216, 204]); // paper
    for (let i = 0; i < 10; i++) pixels.push([200, 40, 40]); // ink
    expect(paperLuminance(rgba(pixels))).toBeGreaterThan(205);
  });

  it('makes faded ink darker and more vivid', () => {
    const data = rgba([[217, 140, 140]]);
    enhanceInk(data);
    expect(data[0]).toBeGreaterThanOrEqual(200);
    expect(data[1]).toBeLessThan(140);
    expect(data[2]).toBeLessThan(140);
  });
});
