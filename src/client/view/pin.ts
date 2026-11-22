/**
 * @file        src/client/view/pin.ts
 * @purpose     Converts between canvas pixels and map kilometres, clamps pins and places the loupe.
 * @layer       client view (pure: no DOM, no I/O)
 * @keyFunctions
 *   - quantizeKm(value): number
 *   - clampKm(value, mapSizeKm): number
 *   - centerPoint(mapSizeKm): Point
 *   - pointFromCanvas(px, py, rect, mapSizeKm): Point
 *   - canvasPoint(point, rect, mapSizeKm): Point
 *   - nudgePoint(point, dx, dy, mapSizeKm): Point
 *   - isInsideRect(px, py, rect): boolean
 *   - loupeCenter(pointer, options?): LoupeCenter
 * @invariants  every returned point is finite, quantized to 0.1 km and inside [0, mapSizeKm]
 * @security    S5: no string coercion; invalid numbers fall back to the map centre
 * @tests       tests/client/viewPin.test.ts
 * @spec        P4-client.md step 4; 06-design-and-ux.md playing
 */
import type { Point } from '../../shared/types';

export type Rect = { x: number; y: number; width: number; height: number };

export type LoupeCenter = Point & { flipped: boolean };

export type LoupeOptions = {
  radius?: number;
  offset?: number;
  top?: number;
};

function clean(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Object.is(value, -0) ? 0 : value;
}

export function quantizeKm(value: number): number {
  const rounded = Math.round(clean(value) * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function clampKm(value: number, mapSizeKm: number): number {
  const size = Number.isFinite(mapSizeKm) && mapSizeKm > 0 ? mapSizeKm : 0;
  if (!Number.isFinite(value)) {
    return 0;
  }
  return quantizeKm(Math.min(size, Math.max(0, value)));
}

export function centerPoint(mapSizeKm: number): Point {
  const size = Number.isFinite(mapSizeKm) && mapSizeKm > 0 ? mapSizeKm : 0;
  return { x: quantizeKm(size / 2), y: quantizeKm(size / 2) };
}

function validRect(rect: Rect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

export function isInsideRect(px: number, py: number, rect: Rect): boolean {
  if (!validRect(rect) || !Number.isFinite(px) || !Number.isFinite(py)) {
    return false;
  }
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

export function pointFromCanvas(
  px: number,
  py: number,
  rect: Rect,
  mapSizeKm: number
): Point {
  if (!validRect(rect)) {
    return centerPoint(mapSizeKm);
  }

  const size = Number.isFinite(mapSizeKm) && mapSizeKm > 0 ? mapSizeKm : 0;
  const xRatio = Math.min(1, Math.max(0, (clean(px) - rect.x) / rect.width));
  const yRatio = Math.min(1, Math.max(0, (clean(py) - rect.y) / rect.height));

  return {
    x: quantizeKm(xRatio * size),
    y: quantizeKm(yRatio * size),
  };
}

export function canvasPoint(
  point: Point,
  rect: Rect,
  mapSizeKm: number
): Point {
  if (!validRect(rect) || !(mapSizeKm > 0) || !Number.isFinite(mapSizeKm)) {
    return { x: clean(rect?.x), y: clean(rect?.y) };
  }

  return {
    x: rect.x + (clampKm(point.x, mapSizeKm) / mapSizeKm) * rect.width,
    y: rect.y + (clampKm(point.y, mapSizeKm) / mapSizeKm) * rect.height,
  };
}

export function nudgePoint(
  point: Point,
  dx: number,
  dy: number,
  mapSizeKm: number
): Point {
  return {
    x: clampKm(point.x + (Number.isFinite(dx) ? dx : 0), mapSizeKm),
    y: clampKm(point.y + (Number.isFinite(dy) ? dy : 0), mapSizeKm),
  };
}

export function loupeCenter(
  pointer: Point,
  options: LoupeOptions = {}
): LoupeCenter {
  const radius = Number.isFinite(options.radius) ? options.radius! : 58;
  const offset = Number.isFinite(options.offset) ? options.offset! : 120;
  const top = Number.isFinite(options.top) ? options.top! : 0;
  const x = clean(pointer.x);
  const y = clean(pointer.y);
  const above = y - offset;
  const flipped = above - radius < top;

  return { x, y: flipped ? y + offset : above, flipped };
}
