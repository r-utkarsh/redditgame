/**
 * @file        tests/shared/fairness.test.ts
 * @purpose     Proves the solver recovers an exact epicenter, survives a station coincidence and drives the fairness gate.
 * @covers      src/shared/fairness.ts
 * @spec        01-spec.md section 4; 03-tdd-and-testing.md section 4
 */
import { describe, expect, it } from 'vitest';
import {
  isFairPuzzle,
  solveAllStarts,
  solveBestFit,
} from '../../src/shared/fairness';
import { KM_PER_SECOND_OF_DELAY } from '../../src/shared/constants';
import { distanceKm } from '../../src/shared/geometry';
import type { PrivatePuzzle, Station } from '../../src/shared/types';

const truth = { x: 500, y: 500 };

function station(
  id: 'A' | 'B' | 'C' | 'D',
  x: number,
  y: number,
  at = truth
): Station {
  return {
    id,
    x,
    y,
    delayS: distanceKm({ x, y }, at) / KM_PER_SECOND_OF_DELAY,
  };
}

function puzzle(stations: Station[]): PrivatePuzzle {
  return {
    seed: 1,
    truth,
    stations,
    fault: [
      { x: 100, y: 100 },
      { x: 400, y: 400 },
      { x: 700, y: 700 },
    ],
    solverFit: { x: 0, y: 0, errorKm: 0 },
  };
}

describe('solveBestFit', () => {
  it('recovers an exact epicenter from three clean stations', () => {
    const stations = [
      station('A', 200, 200),
      station('B', 800, 200),
      station('C', 500, 800),
    ];

    const fit = solveBestFit(stations);

    expect(distanceKm(fit, truth)).toBeLessThan(1e-6);
  });

  it('stays finite when a station sits on the epicenter', () => {
    const stations = [
      { id: 'A' as const, x: 500, y: 500, delayS: 0 },
      station('B', 800, 200),
      station('C', 500, 800),
    ];

    const fit = solveBestFit(stations);

    expect(Number.isFinite(fit.x)).toBe(true);
    expect(Number.isFinite(fit.y)).toBe(true);
    expect(distanceKm(fit, truth)).toBeLessThan(1e-6);
  });

  it('runs the 3 x 3 grid plus the centroid', () => {
    const stations = [
      station('A', 200, 200),
      station('B', 800, 200),
      station('C', 500, 800),
    ];

    expect(solveAllStarts(stations)).toHaveLength(10);
  });

  it('returns finite coordinates for a single station', () => {
    const fit = solveBestFit([station('A', 200, 200)]);

    expect(Number.isFinite(fit.x)).toBe(true);
    expect(Number.isFinite(fit.y)).toBe(true);
  });
});

describe('isFairPuzzle', () => {
  it('accepts a clean puzzle with sigma 0', () => {
    expect(
      isFairPuzzle(
        puzzle([
          station('A', 200, 200),
          station('B', 800, 200),
          station('C', 500, 800),
        ]),
        0
      )
    ).toBe(true);
  });

  it('rejects a layout with stations too close together', () => {
    expect(
      isFairPuzzle(
        puzzle([
          station('A', 200, 200),
          station('B', 210, 210),
          station('C', 500, 800),
        ]),
        0
      )
    ).toBe(false);
  });

  it('rejects a layout with a station too close to the epicenter', () => {
    expect(
      isFairPuzzle(
        puzzle([
          { id: 'A', x: 550, y: 500, delayS: 0 },
          station('B', 800, 200),
          station('C', 500, 800),
        ]),
        0
      )
    ).toBe(false);
  });

  it('rejects delays that pull the best fit too far from the truth', () => {
    const stations: Station[] = [
      { id: 'A', x: 200, y: 200, delayS: 0 },
      { id: 'B', x: 800, y: 200, delayS: 0 },
      { id: 'C', x: 500, y: 800, delayS: 0 },
    ];

    expect(isFairPuzzle(puzzle(stations), 0)).toBe(false);
  });
});
