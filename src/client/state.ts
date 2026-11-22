/**
 * @file        src/client/state.ts
 * @purpose     Implements the loading, playing, locked, results and closed client state machine.
 * @layer       client (pure state: no DOM, no I/O)
 * @keyFunctions
 *   - GameState
 *   - initialState(): GameState
 *   - startPuzzle(state, payload): GameState
 *   - placePin / nudgePin / markPinMoved
 *   - lockIn(state): GameState
 *   - attachGuess(state, guess): GameState
 *   - showResults(state, view): GameState
 *   - canLockIn(state): boolean
 *   - currentPin(state): Point | null
 * @invariants  only playing accepts pin input; lockIn happens once; locked ignores every further placement and lock
 * @security    S5: coordinates are quantized and clamped; the client never stores a score
 * @tests       tests/client/state.test.ts
 * @spec        P4-client.md step 3; 06-design-and-ux.md playing
 */
import type {
  ClosedPuzzle,
  GuessResult,
  Point,
  PuzzleOpenPayload,
  PuzzlePayload,
} from '../shared/types';
import type { ResultView } from './view/result';
import { clampKm, nudgePoint } from './view/pin';

export type LoadingState = { phase: 'loading' };

export type PlayingState = {
  phase: 'playing';
  puzzle: PuzzleOpenPayload;
  pin: Point | null;
  moved: boolean;
};

export type LockedState = {
  phase: 'locked';
  puzzle: PuzzleOpenPayload;
  pin: Point;
  guess: GuessResult | null;
};

export type ResultsState = ResultView & { phase: 'results' };

export type ClosedState = { phase: 'closed'; puzzle: ClosedPuzzle };

export type GameState =
  | LoadingState
  | PlayingState
  | LockedState
  | ResultsState
  | ClosedState;

export function initialState(): GameState {
  return { phase: 'loading' };
}

export function startPuzzle(_state: GameState, payload: PuzzlePayload): GameState {
  if (payload.status === 'closed') {
    return { phase: 'closed', puzzle: payload };
  }

  return {
    phase: 'playing',
    puzzle: payload,
    pin: null,
    moved: false,
  };
}

export function placePin(
  state: GameState,
  point: Point,
  mapSizeKm: number
): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  return {
    ...state,
    pin: {
      x: clampKm(point.x, mapSizeKm),
      y: clampKm(point.y, mapSizeKm),
    },
    moved: true,
  };
}

export function nudgePin(
  state: GameState,
  dx: number,
  dy: number,
  mapSizeKm: number
): GameState {
  if (state.phase !== 'playing' || state.pin === null) {
    return state;
  }

  return {
    ...state,
    pin: nudgePoint(state.pin, dx, dy, mapSizeKm),
    moved: true,
  };
}

export function markPinMoved(state: GameState): GameState {
  if (state.phase !== 'playing' || state.moved) {
    return state;
  }

  return { ...state, moved: true };
}

export function lockIn(state: GameState): GameState {
  if (state.phase !== 'playing' || state.pin === null) {
    return state;
  }

  return {
    phase: 'locked',
    puzzle: state.puzzle,
    pin: state.pin,
    guess: null,
  };
}

export function attachGuess(state: GameState, guess: GuessResult): GameState {
  if (state.phase !== 'locked' || state.guess !== null) {
    return state;
  }

  return { ...state, guess };
}

export function showResults(_state: GameState, view: ResultView): GameState {
  return { phase: 'results', ...view };
}

export function canLockIn(state: GameState): boolean {
  return state.phase === 'playing' && state.pin !== null;
}

export function currentPin(state: GameState): Point | null {
  if (state.phase === 'playing' || state.phase === 'locked') {
    return state.pin;
  }
  if (state.phase === 'results') {
    return { x: state.results.you.x, y: state.results.you.y };
  }
  return null;
}
