/**
 * @file        src/shared/generator.ts
 * @purpose     Builds the daily puzzle (fault, epicenter, stations, rounded delays, solver fit) and strips it for the client.
 * @layer       shared (pure: no I/O, no clock, no Math.random)
 * @keyFunctions
 *   - generatePuzzle(seed, dateKey): PrivatePuzzle
 *   - toPublicPuzzle(puzzle, dateKey): PublicPuzzle
 * @invariants  deterministic for a seed on one JS engine; retries up to FAIR_GATE_MAX_TRIES then throws; public output hides truth, seed, solver fit and the fault on Fri-Sun
 * @security    S1: toPublicPuzzle removes every secret field and the fault where the weekday hides it
 * @tests       tests/shared/generator.test.ts
 * @spec        01-spec.md sections 3 and 4
 */
import {
  FAIR_GATE_MAX_TRIES,
  FAULT_MAX_OFFSET_KM,
  FAULT_MIN_SEGMENT_KM,
  MAP_MARGIN_KM,
  MAP_SIZE_KM,
  MIN_TRIANGLE_AREA_KM2,
  STATION_MIN_DISTANCE_FROM_EPICENTER_KM,
  STATION_MIN_SEPARATION_KM,
} from './constants';
import { difficultyForDateKey } from './dates';
import { isFairPuzzle, solveBestFit } from './fairness';
import {
  distanceKm,
  distanceToPolyline,
  segmentsIntersect,
  triangleAreaKm2,
} from './geometry';
import { createRng, gaussian, nextFloat, nextInt, type Rng } from './rng';
import { delaySeconds } from './seismology';
import type {
  Point,
  PrivatePuzzle,
  PublicPuzzle,
  Station,
  StationId,
} from './types';

const STATION_IDS: readonly StationId[] = ['A', 'B', 'C', 'D'];
const MAX_GEOMETRY_TRIES = 500;
const FAULT_MAX_SEGMENT_KM = 250;
const MAX_FAULT_TURN_RAD = Math.PI / 3;

function randomMarginPoint(rng: Rng): Point {
  const span = MAP_SIZE_KM - 2 * MAP_MARGIN_KM;
  return {
    x: MAP_MARGIN_KM + nextFloat(rng) * span,
    y: MAP_MARGIN_KM + nextFloat(rng) * span,
  };
}

function insideMargins(point: Point): boolean {
  return (
    point.x >= MAP_MARGIN_KM &&
    point.x <= MAP_SIZE_KM - MAP_MARGIN_KM &&
    point.y >= MAP_MARGIN_KM &&
    point.y <= MAP_SIZE_KM - MAP_MARGIN_KM
  );
}

function buildFault(rng: Rng): Point[] {
  for (let attempt = 0; attempt < MAX_GEOMETRY_TRIES; attempt += 1) {
    const pointCount = 3 + nextInt(rng, 0, 2);
    let angle = nextFloat(rng) * 2 * Math.PI;
    let point = randomMarginPoint(rng);
    const points: Point[] = [point];
    let valid = true;

    for (let index = 1; index < pointCount; index += 1) {
      angle += (nextFloat(rng) * 2 - 1) * MAX_FAULT_TURN_RAD;
      const length =
        FAULT_MIN_SEGMENT_KM +
        nextFloat(rng) * (FAULT_MAX_SEGMENT_KM - FAULT_MIN_SEGMENT_KM);
      point = {
        x: point.x + Math.cos(angle) * length,
        y: point.y + Math.sin(angle) * length,
      };
      if (!insideMargins(point)) {
        valid = false;
        break;
      }
      points.push(point);
    }

    if (!valid) {
      continue;
    }

    let selfIntersects = false;
    for (let left = 0; left < points.length - 1 && !selfIntersects; left += 1) {
      for (
        let right = left + 2;
        right < points.length - 1;
        right += 1
      ) {
        if (
          segmentsIntersect(
            points[left]!,
            points[left + 1]!,
            points[right]!,
            points[right + 1]!
          )
        ) {
          selfIntersects = true;
          break;
        }
      }
    }

    if (!selfIntersects) {
      return points;
    }
  }

  throw new Error('could not build a fault polyline');
}

function placeEpicenter(rng: Rng, fault: readonly Point[]): Point {
  for (let attempt = 0; attempt < MAX_GEOMETRY_TRIES; attempt += 1) {
    const segment = nextInt(rng, 0, fault.length - 2);
    const start = fault[segment]!;
    const end = fault[segment + 1]!;
    const t = nextFloat(rng);
    const base = {
      x: start.x + t * (end.x - start.x),
      y: start.y + t * (end.y - start.y),
    };
    const length = distanceKm(start, end);
    const normalX = -(end.y - start.y) / length;
    const normalY = (end.x - start.x) / length;
    const offset = (nextFloat(rng) * 2 - 1) * FAULT_MAX_OFFSET_KM;
    const point = {
      x: base.x + normalX * offset,
      y: base.y + normalY * offset,
    };

    if (insideMargins(point)) {
      return point;
    }
  }

  throw new Error('could not place the epicenter');
}

function stationLayoutValid(points: readonly Point[], truth: Point): boolean {
  for (let left = 0; left < points.length - 1; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      if (distanceKm(points[left]!, points[right]!) < STATION_MIN_SEPARATION_KM) {
        return false;
      }
    }
  }

  for (let left = 0; left < points.length - 2; left += 1) {
    for (let middle = left + 1; middle < points.length - 1; middle += 1) {
      for (let right = middle + 1; right < points.length; right += 1) {
        if (
          triangleAreaKm2(points[left]!, points[middle]!, points[right]!) <
          MIN_TRIANGLE_AREA_KM2
        ) {
          return false;
        }
      }
    }
  }

  return points.every(
    (point) =>
      distanceKm(point, truth) >= STATION_MIN_DISTANCE_FROM_EPICENTER_KM
  );
}

function placeStations(rng: Rng, truth: Point, count: number): Point[] {
  for (let attempt = 0; attempt < MAX_GEOMETRY_TRIES; attempt += 1) {
    const points: Point[] = [];
    for (let index = 0; index < count; index += 1) {
      let placed = false;
      for (let draw = 0; draw < 400 && !placed; draw += 1) {
        const candidate = randomMarginPoint(rng);
        const next = [...points, candidate];
        if (stationLayoutValid(next, truth)) {
          points.push(candidate);
          placed = true;
        }
      }
      if (!placed) {
        points.length = 0;
        break;
      }
    }

    if (points.length === count) {
      return points;
    }
  }

  throw new Error('could not place the stations');
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function generatePuzzle(seed: number, dateKey: string): PrivatePuzzle {
  const difficulty = difficultyForDateKey(dateKey);
  const rng = createRng(seed);

  for (let attempt = 0; attempt < FAIR_GATE_MAX_TRIES; attempt += 1) {
    const fault = buildFault(rng);
    const truth = placeEpicenter(rng, fault);
    const points = placeStations(rng, truth, difficulty.stations);

    const stations: Station[] = points.map((point, index) => {
      const trueDelay = delaySeconds(distanceKm(point, truth));
      const noisy = trueDelay + gaussian(rng) * difficulty.sigmaS;
      return {
        id: STATION_IDS[index]!,
        x: point.x,
        y: point.y,
        delayS: roundToOneDecimal(Math.max(0, noisy)),
      };
    });

    const fit = solveBestFit(stations);
    const puzzle: PrivatePuzzle = {
      seed,
      truth,
      stations,
      fault,
      solverFit: {
        x: fit.x,
        y: fit.y,
        errorKm: roundToOneDecimal(distanceKm(fit, truth)),
      },
    };

    if (
      isFairPuzzle(puzzle, difficulty.sigmaS) &&
      distanceToPolyline(puzzle.truth, puzzle.fault) <=
        FAULT_MAX_OFFSET_KM + 1e-9
    ) {
      return puzzle;
    }
  }

  throw new Error(`no fair puzzle for seed ${seed} on ${dateKey}`);
}

export function toPublicPuzzle(
  puzzle: PrivatePuzzle,
  dateKey: string
): PublicPuzzle {
  const difficulty = difficultyForDateKey(dateKey);

  return {
    dateKey,
    mapSizeKm: MAP_SIZE_KM,
    stations: puzzle.stations.map((station) => ({ ...station })),
    fault: difficulty.faultShown
      ? puzzle.fault.map((point) => ({ ...point }))
      : null,
  };
}
