/**
 * @file        tests/shared/geometry.test.ts
 * @purpose     Pins distance, map clamping, polyline distance, triangle area and segment intersection behavior.
 * @covers      src/shared/geometry.ts
 * @spec        01-spec.md sections 2 and 4
 */
import { describe, expect, it } from 'vitest';
import {
  clampToMap,
  distanceKm,
  distanceToPolyline,
  segmentsIntersect,
  triangleAreaKm2,
} from '../../src/shared/geometry';

describe('distanceKm', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distanceKm({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('clampToMap', () => {
  it('leaves an inside point alone and clamps an outside point', () => {
    expect(clampToMap({ x: 500, y: 500 })).toEqual({ x: 500, y: 500 });
    expect(clampToMap({ x: -10, y: 1200 })).toEqual({ x: 0, y: 1000 });
  });

  it('honors a margin', () => {
    expect(clampToMap({ x: 5, y: 995 }, 100)).toEqual({ x: 100, y: 900 });
  });
});

describe('distanceToPolyline', () => {
  it('uses the nearest segment, including endpoints', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    expect(distanceToPolyline({ x: 5, y: 5 }, line)).toBeCloseTo(5, 10);
    expect(distanceToPolyline({ x: 15, y: 5 }, line)).toBeCloseTo(5, 10);
  });

  it('handles a single point and an empty polyline', () => {
    expect(distanceToPolyline({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBe(5);
    expect(distanceToPolyline({ x: 3, y: 4 }, [])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('triangleAreaKm2', () => {
  it('measures a right triangle', () => {
    expect(
      triangleAreaKm2({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })
    ).toBe(50);
  });
});

describe('segmentsIntersect', () => {
  it('detects a proper crossing', () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 }
      )
    ).toBe(true);
  });

  it('rejects parallel and disjoint segments', () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 }
      )
    ).toBe(false);
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 5, y: 5 },
        { x: 6, y: 6 }
      )
    ).toBe(false);
  });

  it('treats a shared endpoint and a collinear overlap as intersections', () => {
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      )
    ).toBe(true);
    expect(
      segmentsIntersect(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
        { x: 15, y: 0 }
      )
    ).toBe(true);
  });
});
