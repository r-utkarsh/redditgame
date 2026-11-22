/**
 * @file        tests/client/state.test.ts
 * @purpose     Proves the client state machine allows exactly one guess and ignores input after lock-in.
 * @covers      src/client/state.ts
 * @spec        P4-client.md step 3; 06-design-and-ux.md playing
 */
import { describe, expect, it } from 'vitest';
import type {
  ClosedPuzzle,
  GuessResult,
  PuzzleOpenPayload,
  ResultsPayload,
  Streak,
} from '../../src/shared/types';
import {
  attachGuess,
  canLockIn,
  currentPin,
  initialState,
  lockIn,
  markPinMoved,
  nudgePin,
  placePin,
  showResults,
  startPuzzle,
} from '../../src/client/state';
import type { ResultView } from '../../src/client/view/result';

const streak: Streak = { current: 2, best: 9 };

const puzzle: PuzzleOpenPayload = {
  status: 'open',
  splashState: 'open',
  dateKey: '2026-11-18',
  mapSizeKm: 1000,
  stations: [
    { id: 'A', x: 200, y: 200, delayS: 12.6 },
    { id: 'B', x: 800, y: 300, delayS: 4 },
    { id: 'C', x: 500, y: 800, delayS: 9.5 },
  ],
  fault: null,
  alreadyGuessed: false,
  streak,
};

const closed: ClosedPuzzle = {
  status: 'closed',
  splashState: 'closed',
  dateKey: null,
  alreadyGuessed: false,
  streak,
};

const guess: GuessResult = {
  errorKm: 23.4,
  score: 820,
  stars: 2,
  truth: { x: 400, y: 420 },
  streak,
};

const results: ResultsPayload = {
  truth: { x: 400, y: 420 },
  solverFit: { x: 410, y: 430, errorKm: 12.4 },
  cloud: [],
  crowdMedian: null,
  playerCount: 1,
  percentile: null,
  you: { x: 500, y: 500, errorKm: 23.4, score: 820, stars: 2 },
  stations: puzzle.stations,
  mapSizeKm: 1000,
  fault: [
    { x: 100, y: 100 },
    { x: 900, y: 900 },
  ],
};

const view: ResultView = { results, streak, dateKey: '2026-11-18' };

function playing() {
  return startPuzzle(initialState(), puzzle);
}

function locked() {
  return lockIn(placePin(playing(), { x: 500, y: 500 }, 1000));
}

describe('startup', () => {
  it('starts in loading with no pin and no lock', () => {
    const state = initialState();

    expect(state).toEqual({ phase: 'loading' });
    expect(currentPin(state)).toBeNull();
    expect(canLockIn(state)).toBe(false);
  });

  it('moves from loading to playing with no initial pin', () => {
    const state = playing();

    expect(state.phase).toBe('playing');
    expect(currentPin(state)).toBeNull();
    expect(canLockIn(state)).toBe(false);
  });

  it('moves from loading to closed for a closed payload', () => {
    expect(startPuzzle(initialState(), closed)).toEqual({
      phase: 'closed',
      puzzle: closed,
    });
  });
});

describe('pin placement', () => {
  it('places, clamps and quantizes the first pin', () => {
    const state = placePin(playing(), { x: -10, y: 1234.56 }, 1000);

    expect(currentPin(state)).toEqual({ x: 0, y: 1000 });
    expect(state.phase === 'playing' && state.moved).toBe(true);
  });

  it('nudges an existing pin and clamps at the edge', () => {
    const placed = placePin(playing(), { x: 500, y: 500 }, 1000);
    const nudged = nudgePin(placed, -10, 10, 1000);

    expect(currentPin(nudged)).toEqual({ x: 490, y: 510 });
    expect(currentPin(nudgePin(nudged, -500, 500, 1000))).toEqual({
      x: 0,
      y: 1000,
    });
  });

  it('does not nudge without a pin', () => {
    const state = playing();

    expect(nudgePin(state, 1, 1, 1000)).toEqual(state);
  });

  it('marks the first committed placement once', () => {
    const moved = markPinMoved(playing());
    const again = markPinMoved(moved);

    expect(moved.phase === 'playing' && moved.moved).toBe(true);
    expect(again).toEqual(moved);
  });
});

describe('lock-in', () => {
  it('does nothing without a pin', () => {
    const state = playing();

    expect(lockIn(state)).toEqual(state);
  });

  it('moves playing to locked with the pin and no guess yet', () => {
    const state = locked();

    expect(state.phase).toBe('locked');
    if (state.phase === 'locked') {
      expect(state.pin).toEqual({ x: 500, y: 500 });
      expect(state.guess).toBeNull();
    }
    expect(canLockIn(state)).toBe(false);
  });

  it('ignores pin placement, nudging and a second lock after lock-in', () => {
    const state = locked();

    expect(placePin(state, { x: 1, y: 1 }, 1000)).toEqual(state);
    expect(nudgePin(state, 1, 1, 1000)).toEqual(state);
    expect(lockIn(state)).toEqual(state);
    expect(markPinMoved(state)).toEqual(state);
  });
});

describe('guess and results', () => {
  it('attaches exactly one guess while locked', () => {
    const state = attachGuess(locked(), guess);

    expect(state.phase === 'locked' && state.guess).toEqual(guess);

    const second = attachGuess(state, { ...guess, score: 1000 });
    expect(second).toEqual(state);
  });

  it('ignores a guess before lock-in', () => {
    const state = playing();

    expect(attachGuess(state, guess)).toEqual(state);
  });

  it('moves to results from loading or locked', () => {
    expect(showResults(initialState(), view)).toEqual({
      phase: 'results',
      ...view,
    });
    expect(showResults(locked(), view)).toEqual({ phase: 'results', ...view });
  });

  it('exposes the stored guess as the result pin', () => {
    const state = showResults(locked(), view);

    expect(currentPin(state)).toEqual({ x: 500, y: 500 });
  });

  it('allows a lock only in playing with a pin', () => {
    expect(canLockIn(placePin(playing(), { x: 1, y: 1 }, 1000))).toBe(true);
    expect(canLockIn(locked())).toBe(false);
    expect(canLockIn(showResults(locked(), view))).toBe(false);
  });
});
