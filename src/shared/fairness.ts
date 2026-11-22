/**
 * @file        src/shared/fairness.ts
 * @purpose     Fits the epicenter from noisy station delays with Levenberg-Marquardt and applies the fairness gate.
 * @layer       shared (pure: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - solverStarts(stations): Point[]
 *   - solveFrom(stations, start): Point
 *   - solveBestFit(stations): Point
 *   - solveAllStarts(stations): Point[]
 *   - isFairPuzzle(puzzle, sigmaS): boolean
 * @invariants  a station within 1e-9 km contributes a zero Jacobian row and residual -K * delay; starts are clamped to the map
 * @security    S1: the solver fit is never returned by the public puzzle payload
 * @tests       tests/shared/fairness.test.ts
 * @spec        01-spec.md section 4
 */
import {
  KM_PER_SECOND_OF_DELAY,
  MAP_MARGIN_KM,
  MAP_SIZE_KM,
  MIN_TRIANGLE_AREA_KM2,
  SOLVER_BASIN_KM,
  SOLVER_GRID,
  SOLVER_LM_DAMPING,
  SOLVER_MAX_ITERATIONS,
  SOLVER_STEP_TOLERANCE_KM,
  STATION_MIN_DISTANCE_FROM_EPICENTER_KM,
  STATION_MIN_SEPARATION_KM,
} from './constants';
import {
  clampToMap,
  distanceKm,
  triangleAreaKm2,
} from './geometry';
import type { Point, PrivatePuzzle, Station } from './types';

const ZERO_DISTANCE_KM = 1e-9;
const GRID_STEP_KM = 250;

function costAt(stations: readonly Station[], point: Point): number {
  let cost = 0;
  for (const station of stations) {
    const residual =
      distanceKm(point, station) - KM_PER_SECOND_OF_DELAY * station.delayS;
    cost += residual * residual;
  }
  return cost;
}

export function solverStarts(stations: readonly Station[]): Point[] {
  const starts: Point[] = [];
  const gridValues = Array.from(
    { length: SOLVER_GRID },
    (_, index) => (index + 1) * GRID_STEP_KM
  );
  for (const x of gridValues) {
    for (const y of gridValues) {
      starts.push(clampToMap({ x, y }));
    }
  }

  if (stations.length > 0) {
    let sumX = 0;
    let sumY = 0;
    for (const station of stations) {
      sumX += station.x;
      sumY += station.y;
    }
    starts.push(
      clampToMap({
        x: sumX / stations.length,
        y: sumY / stations.length,
      })
    );
  } else {
    starts.push({ x: MAP_SIZE_KM / 2, y: MAP_SIZE_KM / 2 });
  }

  return starts;
}

export function solveFrom(
  stations: readonly Station[],
  start: Point
): Point {
  let x = start.x;
  let y = start.y;
  let cost = costAt(stations, { x, y });
  let lambda = SOLVER_LM_DAMPING;

  for (let iteration = 0; iteration < SOLVER_MAX_ITERATIONS; iteration += 1) {
    let jxx = 0;
    let jxy = 0;
    let jyy = 0;
    let gx = 0;
    let gy = 0;

    for (const station of stations) {
      const dx = x - station.x;
      const dy = y - station.y;
      const distance = Math.hypot(dx, dy);

      let jx: number;
      let jy: number;
      let residual: number;

      if (distance < ZERO_DISTANCE_KM) {
        jx = 0;
        jy = 0;
        residual = -KM_PER_SECOND_OF_DELAY * station.delayS;
      } else {
        jx = dx / distance;
        jy = dy / distance;
        residual = distance - KM_PER_SECOND_OF_DELAY * station.delayS;
      }

      jxx += jx * jx;
      jxy += jx * jy;
      jyy += jy * jy;
      gx += jx * residual;
      gy += jy * residual;
    }

    const m00 = jxx + lambda;
    const m01 = jxy;
    const m11 = jyy + lambda;
    const determinant = m00 * m11 - m01 * m01;

    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-18) {
      lambda *= 10;
      continue;
    }

    const stepX = (-gx * m11 + gy * m01) / determinant;
    const stepY = (-gy * m00 + gx * m01) / determinant;

    if (!Number.isFinite(stepX) || !Number.isFinite(stepY)) {
      break;
    }

    const nextX = x + stepX;
    const nextY = y + stepY;
    const nextCost = costAt(stations, { x: nextX, y: nextY });

    if (nextCost < cost) {
      x = nextX;
      y = nextY;
      cost = nextCost;
      lambda = Math.max(lambda / 10, 1e-12);
    } else {
      lambda *= 10;
    }

    if (Math.hypot(stepX, stepY) < SOLVER_STEP_TOLERANCE_KM) {
      break;
    }
  }

  return { x, y };
}

export function solveAllStarts(stations: readonly Station[]): Point[] {
  return solverStarts(stations).map((start) => solveFrom(stations, start));
}

export function solveBestFit(stations: readonly Station[]): Point {
  let best: Point = { x: MAP_SIZE_KM / 2, y: MAP_SIZE_KM / 2 };
  let bestCost = Number.POSITIVE_INFINITY;

  for (const candidate of solveAllStarts(stations)) {
    const cost = costAt(stations, candidate);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return best;
}

function tripleIndices(count: number): Array<[number, number, number]> {
  const triples: Array<[number, number, number]> = [];
  for (let a = 0; a < count - 2; a += 1) {
    for (let b = a + 1; b < count - 1; b += 1) {
      for (let c = b + 1; c < count; c += 1) {
        triples.push([a, b, c]);
      }
    }
  }
  return triples;
}

function stationsRespectLayout(puzzle: PrivatePuzzle): boolean {
  const { stations, truth } = puzzle;
  if (stations.length < 3) {
    return false;
  }

  for (const station of stations) {
    if (
      !Number.isFinite(station.x) ||
      !Number.isFinite(station.y) ||
      station.x < MAP_MARGIN_KM ||
      station.x > MAP_SIZE_KM - MAP_MARGIN_KM ||
      station.y < MAP_MARGIN_KM ||
      station.y > MAP_SIZE_KM - MAP_MARGIN_KM
    ) {
      return false;
    }
    if (distanceKm(station, truth) < STATION_MIN_DISTANCE_FROM_EPICENTER_KM) {
      return false;
    }
  }

  for (let left = 0; left < stations.length - 1; left += 1) {
    for (let right = left + 1; right < stations.length; right += 1) {
      if (
        distanceKm(stations[left]!, stations[right]!) <
        STATION_MIN_SEPARATION_KM
      ) {
        return false;
      }
    }
  }

  for (const [a, b, c] of tripleIndices(stations.length)) {
    if (
      triangleAreaKm2(stations[a]!, stations[b]!, stations[c]!) <
      MIN_TRIANGLE_AREA_KM2
    ) {
      return false;
    }
  }

  return true;
}

export function isFairPuzzle(puzzle: PrivatePuzzle, sigmaS: number): boolean {
  if (!stationsRespectLayout(puzzle)) {
    return false;
  }

  const best = solveBestFit(puzzle.stations);
  const allowedError = 3 * sigmaS * KM_PER_SECOND_OF_DELAY + 5;
  if (distanceKm(best, puzzle.truth) > allowedError) {
    return false;
  }

  for (const fit of solveAllStarts(puzzle.stations)) {
    if (distanceKm(fit, best) > SOLVER_BASIN_KM) {
      return false;
    }
  }

  return true;
}
