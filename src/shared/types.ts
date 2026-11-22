/**
 * @file        src/shared/types.ts
 * @purpose     Shared type-only contracts used by the client, the server and the pure core.
 * @layer       shared (pure types: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - ApiError
 *   - Point
 *   - Station
 *   - SolverFit
 *   - PrivatePuzzle
 *   - PublicPuzzle
 *   - ClosedPuzzle
 *   - GuessInput
 *   - GuessResult
 *   - ResultsPayload
 * @invariants  type-only module; emits no runtime code
 * @security    S1: PublicPuzzle never carries truth, seed or solver fit
 * @tests       none (type-only; documented coverage exclusion)
 * @spec        01-spec.md sections 4 and 5; 02-architecture-and-headers.md section 3
 */
import type { SplashState } from './splashState';
export type { SplashState } from './splashState';
export type ApiError = { error: string };

export type Point = { x: number; y: number };

export type StationId = 'A' | 'B' | 'C' | 'D';

export type Station = {
  id: StationId;
  x: number;
  y: number;
  delayS: number;
};

export type SolverFit = {
  x: number;
  y: number;
  errorKm: number;
};

export type PrivatePuzzle = {
  seed: number;
  truth: Point;
  stations: Station[];
  fault: Point[];
  solverFit: SolverFit;
};

export type PublicPuzzle = {
  dateKey: string;
  mapSizeKm: number;
  stations: Station[];
  fault: Point[] | null;
};

export type Streak = { current: number; best: number };

export type ClosedPuzzle = {
  status: 'closed';
  splashState: SplashState;
  dateKey: string | null;
  alreadyGuessed: boolean;
  streak: Streak;
};

export type PuzzleOpenPayload = PublicPuzzle & {
  status: 'open';
  splashState: SplashState;
  alreadyGuessed: boolean;
  streak: Streak;
};

export type PuzzlePayload = PuzzleOpenPayload | ClosedPuzzle;

export type GuessInput = { x: number; y: number };

export type GuessResult = {
  errorKm: number;
  score: number;
  stars: number;
  truth: Point;
  streak: Streak;
};

export type ResultsPayload = {
  truth: Point;
  solverFit: SolverFit;
  cloud: Array<{ cx: number; cy: number; n: number }>;
  crowdMedian: Point | null;
  playerCount: number;
  percentile: number | null;
  you: { x: number; y: number; errorKm: number; score: number; stars: number };
  stations: Station[];
  mapSizeKm: number;
  fault: Point[];
};
