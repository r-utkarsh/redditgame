/**
 * @file        src/shared/constants.ts
 * @purpose     Holds every tunable game constant and the weekday difficulty table.
 * @layer       shared (pure data: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - MAP_SIZE_KM
 *   - KM_PER_SECOND_OF_DELAY
 *   - STAR_THRESHOLDS_KM
 *   - RATE_LIMITS
 *   - DIFFICULTY_BY_WEEKDAY
 * @invariants  KM_PER_SECOND_OF_DELAY = 1 / (1/VS_KM_S - 1/VP_KM_S); values change only via an approved DECISIONS entry
 * @security    none (public gameplay values)
 * @tests       tests/shared/constants.test.ts
 * @spec        01-spec.md sections 2 and 3
 */

export const MAP_SIZE_KM = 1000;
export const VP_KM_S = 6;
export const VS_KM_S = 3.5;
export const KM_PER_SECOND_OF_DELAY = 1 / (1 / VS_KM_S - 1 / VP_KM_S);

export const MAP_MARGIN_KM = 100;
export const STATION_MIN_SEPARATION_KM = 150;
export const STATION_MIN_DISTANCE_FROM_EPICENTER_KM = 150;
export const MIN_TRIANGLE_AREA_KM2 = 20000;

export const FAULT_MAX_OFFSET_KM = 15;
export const FAULT_MIN_SEGMENT_KM = 100;
export const FAIR_GATE_MAX_TRIES = 50;

export const SCORE_SCALE_KM = 40;
export const STAR_THRESHOLDS_KM = {
  threeStar: 15,
  twoStar: 40,
  oneStar: 100,
} as const;
export const SCORE_BIN = 10;
export const SCORE_BINS = 101;

export const CLOUD_BIN_KM = 20;
export const CLOUD_BINS = 50;
export const MARGINAL_BIN_KM = 10;
export const MARGINAL_BINS = 100;

export const SOLVER_GRID = 3;
export const SOLVER_MAX_ITERATIONS = 50;
export const SOLVER_STEP_TOLERANCE_KM = 0.01;
export const SOLVER_BASIN_KM = 5;
export const SOLVER_LM_DAMPING = 1e-3;

export const COORD_QUANTUM_KM = 0.1;
export const MIN_PLAYERS_FOR_CROWD_STATS = 5;

export const DAY_KEY_TTL_DAYS = 45;
export const DPOST_CLAIM_TTL_S = 60;
export const RATE_LIMITS = { guessPerMinute: 5, readPerMinute: 30 } as const;
export const RATE_LIMIT_WINDOW_S = 120;
export const MAX_BODY_BYTES = 1024;

export type Difficulty = {
  stations: number;
  sigmaS: number;
  faultShown: boolean;
};

/** Index 0 is Sunday, matching Date.prototype.getUTCDay. */
export const DIFFICULTY_BY_WEEKDAY: readonly Difficulty[] = [
  { stations: 4, sigmaS: 1.2, faultShown: false },
  { stations: 4, sigmaS: 0.3, faultShown: true },
  { stations: 4, sigmaS: 0.5, faultShown: true },
  { stations: 3, sigmaS: 0.5, faultShown: true },
  { stations: 3, sigmaS: 0.8, faultShown: true },
  { stations: 3, sigmaS: 1.0, faultShown: false },
  { stations: 3, sigmaS: 1.2, faultShown: false },
];
