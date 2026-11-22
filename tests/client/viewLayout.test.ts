/**
 * @file        tests/client/viewLayout.test.ts
 * @purpose     Proves the square map fits between the header and controls on phones and desktops and above the result card.
 * @covers      src/client/view/layout.ts
 * @spec        P4-client.md step 10; 06-design-and-ux.md viewport
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_MAX_PX,
  PLAY_CONTROLS_PX,
  PLAY_HEADER_PX,
  mapRect,
} from '../../src/client/view/layout';

describe('play map layout', () => {
  it('fits a square inside a phone viewport without covering the controls', () => {
    const rect = mapRect(390, 600, 'play');

    expect(rect.width).toBe(rect.height);
    expect(rect.width).toBeLessThanOrEqual(390 - 16);
    expect(rect.y).toBeGreaterThanOrEqual(PLAY_HEADER_PX);
    expect(rect.y + rect.height).toBeLessThanOrEqual(600 - PLAY_CONTROLS_PX);
  });

  it('centres the square horizontally', () => {
    const rect = mapRect(390, 600, 'play');

    expect(rect.x * 2 + rect.width).toBeCloseTo(390, 5);
  });

  it('caps the map on a desktop viewport', () => {
    const rect = mapRect(1600, 1000, 'play');

    expect(rect.width).toBeLessThanOrEqual(MAP_MAX_PX);
    expect(rect.height).toBeLessThanOrEqual(MAP_MAX_PX);
  });

  it('never returns a negative size on a tiny viewport', () => {
    const rect = mapRect(100, 100, 'play');

    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
  });

  it('survives invalid dimensions', () => {
    const rect = mapRect(Number.NaN, -50, 'play');

    expect(rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('result map layout', () => {
  it('keeps the map above the result card on a phone', () => {
    const rect = mapRect(390, 600, 'result');

    expect(rect.width).toBe(rect.height);
    expect(rect.width).toBeLessThanOrEqual(390 - 16);
    expect(rect.y + rect.height).toBeLessThanOrEqual(600 * 0.5);
  });

  it('starts near the top edge', () => {
    expect(mapRect(390, 600, 'result').y).toBe(8);
  });
});
