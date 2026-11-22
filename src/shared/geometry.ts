/**
 * @file        src/shared/geometry.ts
 * @purpose     Provides the planar geometry helpers used by the generator, the solver and the crowd layout.
 * @layer       shared (pure: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - distanceKm(a, b): number
 *   - clampToMap(point, margin?): Point
 *   - distanceToPolyline(point, polyline): number
 *   - triangleAreaKm2(a, b, c): number
 *   - segmentsIntersect(a, b, c, d): boolean
 * @invariants  all functions are pure; segmentsIntersect uses closed segments with an epsilon of 1e-9
 * @security    none (pure math)
 * @tests       tests/shared/geometry.test.ts
 * @spec        01-spec.md sections 2 and 4
 */
import { MAP_SIZE_KM } from './constants';
import type { Point } from './types';

const EPSILON = 1e-9;

export function distanceKm(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clampToMap(point: Point, margin = 0): Point {
  const low = margin;
  const high = MAP_SIZE_KM - margin;
  return {
    x: Math.min(Math.max(point.x, low), high),
    y: Math.min(Math.max(point.y, low), high),
  };
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distanceKm(point, a);
  }

  const raw = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const t = Math.min(Math.max(raw, 0), 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function distanceToPolyline(point: Point, polyline: readonly Point[]): number {
  if (polyline.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (polyline.length === 1) {
    return distanceKm(point, polyline[0]!);
  }

  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polyline.length - 1; index += 1) {
    const distance = distanceToSegment(point, polyline[index]!, polyline[index + 1]!);
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function withinBox(point: Point, a: Point, b: Point): boolean {
  return (
    point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
  );
}

function isCollinearAndOnSegment(point: Point, a: Point, b: Point): boolean {
  return Math.abs(cross(a, b, point)) <= EPSILON && withinBox(point, a, b);
}

export function triangleAreaKm2(a: Point, b: Point, c: Point): number {
  return Math.abs(cross(a, b, c)) / 2;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  const properCrossing =
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON));

  if (properCrossing) {
    return true;
  }

  return (
    isCollinearAndOnSegment(a, c, d) ||
    isCollinearAndOnSegment(b, c, d) ||
    isCollinearAndOnSegment(c, a, b) ||
    isCollinearAndOnSegment(d, a, b)
  );
}
