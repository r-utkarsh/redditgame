/**
 * @file        tests/shared/constants.test.ts
 * @purpose     Pins every tunable constant and the difficulty table to the values in the spec.
 * @covers      src/shared/constants.ts
 * @spec        01-spec.md sections 2 and 3
 */
import { describe, expect, it } from 'vitest';
import {
  CLOUD_BIN_KM,
  CLOUD_BINS,
  COORD_QUANTUM_KM,
  DAY_KEY_TTL_DAYS,
  DIFFICULTY_BY_WEEKDAY,
  DPOST_CLAIM_TTL_S,
  FAIR_GATE_MAX_TRIES,
  FAULT_MAX_OFFSET_KM,
  FAULT_MIN_SEGMENT_KM,
  KM_PER_SECOND_OF_DELAY,
  MAP_MARGIN_KM,
  MAP_SIZE_KM,
  MARGINAL_BIN_KM,
  MARGINAL_BINS,
  MAX_BODY_BYTES,
  MIN_PLAYERS_FOR_CROWD_STATS,
  MIN_TRIANGLE_AREA_KM2,
  RATE_LIMITS,
  RATE_LIMIT_WINDOW_S,
  SCORE_BIN,
  SCORE_BINS,
  SCORE_SCALE_KM,
  SOLVER_BASIN_KM,
  SOLVER_GRID,
  SOLVER_LM_DAMPING,
  SOLVER_MAX_ITERATIONS,
  SOLVER_STEP_TOLERANCE_KM,
  STAR_THRESHOLDS_KM,
  STATION_MIN_DISTANCE_FROM_EPICENTER_KM,
  STATION_MIN_SEPARATION_KM,
  VP_KM_S,
  VS_KM_S,
} from '../../src/shared/constants';

describe('constants', () => {
  it('derives K from the wave speeds', () => {
    expect(KM_PER_SECOND_OF_DELAY).toBeCloseTo(
      1 / (1 / VS_KM_S - 1 / VP_KM_S),
      10
    );
    expect(KM_PER_SECOND_OF_DELAY).toBe(8.4);
  });

  it('matches the spec table', () => {
    expect({
      MAP_SIZE_KM,
      VP_KM_S,
      VS_KM_S,
      MAP_MARGIN_KM,
      STATION_MIN_SEPARATION_KM,
      STATION_MIN_DISTANCE_FROM_EPICENTER_KM,
      MIN_TRIANGLE_AREA_KM2,
      FAULT_MAX_OFFSET_KM,
      FAULT_MIN_SEGMENT_KM,
      FAIR_GATE_MAX_TRIES,
      SCORE_SCALE_KM,
      CLOUD_BIN_KM,
      CLOUD_BINS,
      MARGINAL_BIN_KM,
      MARGINAL_BINS,
      SCORE_BIN,
      SCORE_BINS,
      SOLVER_GRID,
      SOLVER_MAX_ITERATIONS,
      SOLVER_BASIN_KM,
      SOLVER_LM_DAMPING,
      COORD_QUANTUM_KM,
      MIN_PLAYERS_FOR_CROWD_STATS,
      DAY_KEY_TTL_DAYS,
      DPOST_CLAIM_TTL_S,
      RATE_LIMIT_WINDOW_S,
      MAX_BODY_BYTES,
    }).toEqual({
      MAP_SIZE_KM: 1000,
      VP_KM_S: 6,
      VS_KM_S: 3.5,
      MAP_MARGIN_KM: 100,
      STATION_MIN_SEPARATION_KM: 150,
      STATION_MIN_DISTANCE_FROM_EPICENTER_KM: 150,
      MIN_TRIANGLE_AREA_KM2: 20000,
      FAULT_MAX_OFFSET_KM: 15,
      FAULT_MIN_SEGMENT_KM: 100,
      FAIR_GATE_MAX_TRIES: 50,
      SCORE_SCALE_KM: 40,
      CLOUD_BIN_KM: 20,
      CLOUD_BINS: 50,
      MARGINAL_BIN_KM: 10,
      MARGINAL_BINS: 100,
      SCORE_BIN: 10,
      SCORE_BINS: 101,
      SOLVER_GRID: 3,
      SOLVER_MAX_ITERATIONS: 50,
      SOLVER_BASIN_KM: 5,
      SOLVER_LM_DAMPING: 1e-3,
      COORD_QUANTUM_KM: 0.1,
      MIN_PLAYERS_FOR_CROWD_STATS: 5,
      DAY_KEY_TTL_DAYS: 45,
      DPOST_CLAIM_TTL_S: 60,
      RATE_LIMIT_WINDOW_S: 120,
      MAX_BODY_BYTES: 1024,
    });

    expect(STAR_THRESHOLDS_KM).toEqual({ threeStar: 15, twoStar: 40, oneStar: 100 });
    expect(SOLVER_STEP_TOLERANCE_KM).toBe(0.01);
    expect(RATE_LIMITS).toEqual({ guessPerMinute: 5, readPerMinute: 30 });
  });

  it('matches the difficulty table by UTC weekday', () => {
    expect(DIFFICULTY_BY_WEEKDAY).toEqual([
      { stations: 4, sigmaS: 1.2, faultShown: false },
      { stations: 4, sigmaS: 0.3, faultShown: true },
      { stations: 4, sigmaS: 0.5, faultShown: true },
      { stations: 3, sigmaS: 0.5, faultShown: true },
      { stations: 3, sigmaS: 0.8, faultShown: true },
      { stations: 3, sigmaS: 1.0, faultShown: false },
      { stations: 3, sigmaS: 1.2, faultShown: false },
    ]);
  });
});
