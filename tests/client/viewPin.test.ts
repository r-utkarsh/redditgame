/**
 * @file        tests/client/viewPin.test.ts
 * @purpose     Proves pin placement, clamping, nudging, canvas mapping and loupe flipping are deterministic.
 * @covers      src/client/view/pin.ts
 * @spec        P4-client.md step 4; 06-design-and-ux.md playing rules
 */
import { describe, expect, it } from 'vitest';
import {
  canvasPoint,
  centerPoint,
  clampKm,
  isInsideRect,
  loupeCenter,
  nudgePoint,
  pointFromCanvas,
  quantizeKm,
} from '../../src/client/view/pin';

const rect = { x: 10, y: 20, width: 200, height: 200 };

describe('coordinate clamping', () => {
  it('quantizes to 0.1 km and normalizes negative zero', () => {
    expect(quantizeKm(12.34)).toBe(12.3);
    expect(quantizeKm(12.36)).toBe(12.4);
    expect(Object.is(quantizeKm(-0.01), 0)).toBe(true);
  });

  it('clamps to the map edges', () => {
    expect(clampKm(-5, 1000)).toBe(0);
    expect(clampKm(1005, 1000)).toBe(1000);
    expect(clampKm(Number.NaN, 1000)).toBe(0);
    expect(clampKm(500, 1000)).toBe(500);
  });

  it('returns the map centre', () => {
    expect(centerPoint(1000)).toEqual({ x: 500, y: 500 });
  });
});

describe('canvas mapping', () => {
  it('maps a canvas point to km', () => {
    expect(pointFromCanvas(110, 120, rect, 1000)).toEqual({ x: 500, y: 500 });
    expect(pointFromCanvas(10, 20, rect, 1000)).toEqual({ x: 0, y: 0 });
    expect(pointFromCanvas(210, 220, rect, 1000)).toEqual({ x: 1000, y: 1000 });
  });

  it('clamps points outside the map', () => {
    expect(pointFromCanvas(-50, 120, rect, 1000)).toEqual({ x: 0, y: 500 });
    expect(pointFromCanvas(500, 900, rect, 1000)).toEqual({ x: 1000, y: 1000 });
  });

  it('falls back to the centre for a zero-sized rect', () => {
    expect(
      pointFromCanvas(50, 50, { x: 0, y: 0, width: 0, height: 0 }, 1000)
    ).toEqual({ x: 500, y: 500 });
  });

  it('maps km back to canvas pixels', () => {
    expect(canvasPoint({ x: 500, y: 500 }, rect, 1000)).toEqual({
      x: 110,
      y: 120,
    });
    expect(canvasPoint({ x: 0, y: 1000 }, rect, 1000)).toEqual({
      x: 10,
      y: 220,
    });
  });

  it('detects a point inside the map rect', () => {
    expect(isInsideRect(10, 20, rect)).toBe(true);
    expect(isInsideRect(210, 220, rect)).toBe(true);
    expect(isInsideRect(9.9, 20, rect)).toBe(false);
    expect(isInsideRect(50, 50, { x: 0, y: 0, width: 0, height: 0 })).toBe(
      false
    );
  });
});

describe('keyboard nudging', () => {
  it('moves and clamps in map space', () => {
    expect(nudgePoint({ x: 500, y: 500 }, 1, -1, 1000)).toEqual({
      x: 501,
      y: 499,
    });
    expect(nudgePoint({ x: 0, y: 1000 }, -10, 10, 1000)).toEqual({
      x: 0,
      y: 1000,
    });
  });
});

describe('loupe placement', () => {
  it('sits above the pointer away from the top edge', () => {
    expect(loupeCenter({ x: 200, y: 300 })).toEqual({
      x: 200,
      y: 180,
      flipped: false,
    });
  });

  it('flips below the pointer near the top edge', () => {
    expect(loupeCenter({ x: 200, y: 100 })).toEqual({
      x: 200,
      y: 220,
      flipped: true,
    });
  });

  it('honours custom radius and offset', () => {
    expect(
      loupeCenter({ x: 10, y: 80 }, { radius: 40, offset: 80, top: 0 })
    ).toEqual({ x: 10, y: 160, flipped: true });
  });
});
