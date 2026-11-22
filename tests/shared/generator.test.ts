/**
 * @file        tests/shared/generator.test.ts
 * @purpose     Proves the generator is deterministic, honors every layout rule, stays fair and hides the truth.
 * @covers      src/shared/generator.ts
 * @spec        01-spec.md sections 3 and 4; 03-tdd-and-testing.md section 4
 */
import { describe, expect, it } from 'vitest';
import {
  FAULT_MAX_OFFSET_KM,
  FAULT_MIN_SEGMENT_KM,
  MAP_MARGIN_KM,
  MAP_SIZE_KM,
  MIN_TRIANGLE_AREA_KM2,
  STATION_MIN_DISTANCE_FROM_EPICENTER_KM,
  STATION_MIN_SEPARATION_KM,
} from '../../src/shared/constants';
import { difficultyForDateKey } from '../../src/shared/dates';
import {
  generatePuzzle,
  toPublicPuzzle,
} from '../../src/shared/generator';
import {
  distanceKm,
  distanceToPolyline,
  segmentsIntersect,
  triangleAreaKm2,
} from '../../src/shared/geometry';
import { isFairPuzzle } from '../../src/shared/fairness';
import type { Point, PrivatePuzzle } from '../../src/shared/types';

const WEEK = [
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-20',
  '2026-11-21',
  '2026-11-22',
];

function insideMargins(point: Point): boolean {
  return (
    point.x >= MAP_MARGIN_KM &&
    point.x <= MAP_SIZE_KM - MAP_MARGIN_KM &&
    point.y >= MAP_MARGIN_KM &&
    point.y <= MAP_SIZE_KM - MAP_MARGIN_KM
  );
}

function triples(points: readonly Point[]): Array<[Point, Point, Point]> {
  const result: Array<[Point, Point, Point]> = [];
  for (let a = 0; a < points.length - 2; a += 1) {
    for (let b = a + 1; b < points.length - 1; b += 1) {
      for (let c = b + 1; c < points.length; c += 1) {
        result.push([points[a]!, points[b]!, points[c]!]);
      }
    }
  }
  return result;
}

function expectLayout(puzzle: PrivatePuzzle, dateKey: string): void {
  const difficulty = difficultyForDateKey(dateKey);

  expect(puzzle.stations).toHaveLength(difficulty.stations);
  expect(puzzle.fault.length).toBeGreaterThanOrEqual(3);
  expect(puzzle.fault.length).toBeLessThanOrEqual(5);

  for (const point of [puzzle.truth, ...puzzle.fault]) {
    expect(insideMargins(point)).toBe(true);
  }

  for (let index = 0; index < puzzle.fault.length - 1; index += 1) {
    expect(
      distanceKm(puzzle.fault[index]!, puzzle.fault[index + 1]!)
    ).toBeGreaterThanOrEqual(FAULT_MIN_SEGMENT_KM);
  }

  for (let left = 0; left < puzzle.fault.length - 1; left += 1) {
    for (let right = left + 2; right < puzzle.fault.length - 1; right += 1) {
      expect(
        segmentsIntersect(
          puzzle.fault[left]!,
          puzzle.fault[left + 1]!,
          puzzle.fault[right]!,
          puzzle.fault[right + 1]!
        )
      ).toBe(false);
    }
  }

  expect(distanceToPolyline(puzzle.truth, puzzle.fault)).toBeLessThanOrEqual(
    FAULT_MAX_OFFSET_KM + 1e-9
  );

  for (const station of puzzle.stations) {
    expect(insideMargins(station)).toBe(true);
    expect(distanceKm(station, puzzle.truth)).toBeGreaterThanOrEqual(
      STATION_MIN_DISTANCE_FROM_EPICENTER_KM
    );
    expect(station.delayS).toBeGreaterThanOrEqual(0);
    expect(Math.abs(station.delayS * 10 - Math.round(station.delayS * 10))).toBeLessThan(
      1e-9
    );
  }

  for (let left = 0; left < puzzle.stations.length - 1; left += 1) {
    for (let right = left + 1; right < puzzle.stations.length; right += 1) {
      expect(
        distanceKm(puzzle.stations[left]!, puzzle.stations[right]!)
      ).toBeGreaterThanOrEqual(STATION_MIN_SEPARATION_KM);
    }
  }

  for (const [a, b, c] of triples(puzzle.stations)) {
    expect(triangleAreaKm2(a, b, c)).toBeGreaterThanOrEqual(
      MIN_TRIANGLE_AREA_KM2
    );
  }

  expect(isFairPuzzle(puzzle, difficulty.sigmaS)).toBe(true);
  expect(Number.isFinite(puzzle.solverFit.x)).toBe(true);
  expect(puzzle.solverFit.errorKm).toBeGreaterThanOrEqual(0);
}

describe('generatePuzzle', () => {
  it('honors every layout, noise and fairness rule for 20 seeds per weekday', () => {
    for (const dateKey of WEEK) {
      for (let seed = 0; seed < 20; seed += 1) {
        expectLayout(generatePuzzle(seed, dateKey), dateKey);
      }
    }
  });

  it('is deterministic for the same seed and differs for another seed', () => {
    const dateKey = '2026-11-18';
    const left = generatePuzzle(4242, dateKey);
    const right = generatePuzzle(4242, dateKey);
    const other = generatePuzzle(4243, dateKey);

    expect(left).toEqual(right);
    expect(other).not.toEqual(left);
  });
});

describe('toPublicPuzzle', () => {
  it('hides the fault on Friday, Saturday and Sunday only', () => {
    for (const dateKey of WEEK) {
      const publicPuzzle = toPublicPuzzle(generatePuzzle(7, dateKey), dateKey);
      const difficulty = difficultyForDateKey(dateKey);

      expect(publicPuzzle.fault === null).toBe(!difficulty.faultShown);
    }
  });

  it('never carries the truth, the seed or the solver fit', () => {
    const dateKey = '2026-11-17';
    const privatePuzzle = generatePuzzle(11, dateKey);
    const publicPuzzle = toPublicPuzzle(privatePuzzle, dateKey);

    const text = JSON.stringify(publicPuzzle);
    expect(text).not.toContain('seed');
    expect(text).not.toContain('truth');
    expect(text).not.toContain('solverFit');

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== 'object' || value === null) {
        return;
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        expect(key.toLowerCase()).not.toMatch(/truth|seed|solverfit/);
        visit(record[key]);
      }
      const x = record.x;
      const y = record.y;
      if (typeof x === 'number' && typeof y === 'number') {
        expect(distanceKm({ x, y }, privatePuzzle.truth)).toBeGreaterThan(0.11);
      }
    };
    visit(publicPuzzle);
  });

  it('copies stations and fault points instead of sharing references', () => {
    const dateKey = '2026-11-17';
    const privatePuzzle = generatePuzzle(12, dateKey);
    const publicPuzzle = toPublicPuzzle(privatePuzzle, dateKey);

    expect(publicPuzzle.stations).not.toBe(privatePuzzle.stations);
    publicPuzzle.stations[0]!.delayS = 999;
    expect(privatePuzzle.stations[0]!.delayS).not.toBe(999);

    expect(publicPuzzle.fault).not.toBe(privatePuzzle.fault);
    publicPuzzle.fault![0]!.x = 1;
    expect(privatePuzzle.fault[0]!.x).not.toBe(1);
  });
});
