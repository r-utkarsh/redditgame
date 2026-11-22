/**
 * @file        tests/server/guessService.test.ts
 * @purpose     Proves the single-guess commit point, server scoring, midnight close, counters and partial failures.
 * @covers      src/server/core/guessService.ts
 * @spec        01-spec.md sections 5 and 6; 04-security.md S2, S3, S11, S16
 */
import { describe, expect, it } from 'vitest';
import { binIndex } from '../../src/shared/crowd';
import {
  CLOUD_BIN_KM,
  CLOUD_BINS,
  MARGINAL_BIN_KM,
  MARGINAL_BINS,
  SCORE_BIN,
  SCORE_BINS,
} from '../../src/shared/constants';
import { scoreFromError, starsFromError } from '../../src/shared/scoring';
import type { GuessInput } from '../../src/shared/types';
import { submitGuess } from '../../src/server/core/guessService';
import { ensurePuzzle } from '../../src/server/core/puzzleService';
import { FakeClock } from '../fakes/clock';
import { FakeEntropy } from '../fakes/entropy';
import { makeDeps, TODAY, toDeps } from '../fakes/deps';

const GS_KEY = `gs:${TODAY}`;
const CLOUD_KEY = `cloud:${TODAY}`;
const MX_KEY = `mx:${TODAY}`;
const MY_KEY = `my:${TODAY}`;
const SH_KEY = `sh:${TODAY}`;

async function seedPuzzle(deps: ReturnType<typeof makeDeps>) {
  return ensurePuzzle(toDeps(deps), TODAY, { repair: false });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

describe('submitGuess', () => {
  it('scores a perfect guess and uses exactly ten business ops', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    const before = deps.store.opCount;

    const result = await submitGuess(
      toDeps(deps),
      't2_test1',
      TODAY,
      puzzle.truth
    );

    expect(result).toEqual({
      errorKm: 0,
      score: 1000,
      stars: 3,
      truth: puzzle.truth,
      streak: { current: 1, best: 1 },
    });
    expect(deps.store.opCount - before).toBeLessThanOrEqual(10);

    const stored = JSON.parse(
      (await deps.store.hGet(GS_KEY, 't2_test1')) ?? '{}'
    ) as Record<string, unknown>;
    expect(stored).toEqual({
      x: puzzle.truth.x,
      y: puzzle.truth.y,
      errorKm: 0,
      score: 1000,
    });
    expect(Object.keys(stored).sort()).toEqual(['errorKm', 'score', 'x', 'y']);
  });

  it('rounds the error to one decimal and computes score and stars from it', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    const guess: GuessInput = {
      x: Math.min(1000, puzzle.truth.x + 12.34),
      y: puzzle.truth.y,
    };
    const rawError = Math.abs(guess.x - puzzle.truth.x);
    const errorKm = round1(rawError);

    const result = await submitGuess(toDeps(deps), 't2_test1', TODAY, guess);

    expect(result.errorKm).toBe(errorKm);
    expect(result.score).toBe(scoreFromError(errorKm));
    expect(result.stars).toBe(starsFromError(errorKm));
  });

  it('increments the four bounded counter bins and ignores the sentinel', async () => {
    const deps = makeDeps();
    await ensurePuzzle(toDeps(deps), TODAY);
    const guess = { x: 500, y: 500 };

    const result = await submitGuess(toDeps(deps), 't2_test1', TODAY, guess);

    const cloudField = `${binIndex(500, CLOUD_BIN_KM, CLOUD_BINS)}:${binIndex(
      500,
      CLOUD_BIN_KM,
      CLOUD_BINS
    )}`;
    expect(await deps.store.hGet(CLOUD_KEY, cloudField)).toBe('1');
    expect(await deps.store.hGet(CLOUD_KEY, '_')).toBe('0');

    expect(
      await deps.store.hGet(
        MX_KEY,
        String(binIndex(500, MARGINAL_BIN_KM, MARGINAL_BINS))
      )
    ).toBe('1');
    expect(
      await deps.store.hGet(
        MY_KEY,
        String(binIndex(500, MARGINAL_BIN_KM, MARGINAL_BINS))
      )
    ).toBe('1');
    expect(
      await deps.store.hGet(
        SH_KEY,
        String(binIndex(result.score, SCORE_BIN, SCORE_BINS))
      )
    ).toBe('1');
    expect(await deps.store.hGet(SH_KEY, '_')).toBe('0');
    expect(await deps.store.hGet(GS_KEY, '_')).toBe('0');
  });

  it('rejects a second guess with 409 and changes no state', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    await submitGuess(toDeps(deps), 't2_test1', TODAY, puzzle.truth);
    const guessBefore = await deps.store.hGet(GS_KEY, 't2_test1');
    const cloudBefore = await deps.store.hGetAll(CLOUD_KEY);
    const before = deps.store.opCount;

    await expect(
      submitGuess(toDeps(deps), 't2_test1', TODAY, { x: 1, y: 1 })
    ).rejects.toMatchObject({ status: 409, code: 'already_guessed' });

    expect(deps.store.opCount - before).toBe(2);
    expect(await deps.store.hGet(GS_KEY, 't2_test1')).toBe(guessBefore);
    expect(await deps.store.hGetAll(CLOUD_KEY)).toEqual(cloudBefore);
  });

  it('accepts exactly one of 20 concurrent identical guesses', async () => {
    const deps = makeDeps({
      entropy: new FakeEntropy(
        Array.from({ length: 40 }, (_, index) => 1000 + index)
      ),
    });
    const puzzle = await seedPuzzle(deps);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        submitGuess(toDeps(deps), 't2_test1', TODAY, puzzle.truth)
      )
    );

    const accepted = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(
      (outcome) => outcome.status === 'rejected'
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    for (const outcome of rejected) {
      expect((outcome as PromiseRejectedResult).reason).toMatchObject({
        status: 409,
      });
    }
  });

  it('rejects a null date with 410 and no store ops', async () => {
    const deps = makeDeps();
    const before = deps.store.opCount;

    await expect(
      submitGuess(toDeps(deps), 't2_test1', null, { x: 500, y: 500 })
    ).rejects.toMatchObject({ status: 410, code: 'puzzle_closed' });
    expect(deps.store.opCount).toBe(before);
  });

  it('rejects a past date with 410 before touching the puzzle', async () => {
    const deps = makeDeps();
    await ensurePuzzle(toDeps(deps), '2026-11-16', { repair: false });
    const before = deps.store.opCount;

    await expect(
      submitGuess(toDeps(deps), 't2_test1', '2026-11-16', { x: 500, y: 500 })
    ).rejects.toMatchObject({ status: 410, code: 'puzzle_closed' });
    expect(deps.store.opCount).toBe(before);
    expect(await deps.store.hGet('gs:2026-11-16', 't2_test1')).toBeNull();
  });

  it('rejects a guess that lands after UTC midnight', async () => {
    const deps = makeDeps({
      clock: new FakeClock(new Date(Date.UTC(2026, 10, 17, 23, 59, 59, 900))),
    });
    const puzzle = await seedPuzzle(deps);
    deps.clock.advance(200);

    await expect(
      submitGuess(toDeps(deps), 't2_test1', TODAY, puzzle.truth)
    ).rejects.toMatchObject({ status: 410, code: 'puzzle_closed' });
    expect(await deps.store.hGet(GS_KEY, 't2_test1')).toBeNull();
  });

  it('maps a failed commit to 503 and writes nothing after it', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    deps.store.failCommand('hSetNX', 1);
    const before = deps.store.opCount;

    await expect(
      submitGuess(toDeps(deps), 't2_test1', TODAY, puzzle.truth)
    ).rejects.toMatchObject({ status: 503, code: 'unavailable' });

    expect(deps.store.opCount - before).toBe(2);
    expect(deps.store.hasKey('st:t2_test1')).toBe(false);
    expect(await deps.store.hGetAll(CLOUD_KEY)).toEqual({ _: '0' });
  });

  it('returns 200 when the streak write fails after the commit', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    deps.store.failCommand('hSet', Number.POSITIVE_INFINITY);

    const result = await submitGuess(
      toDeps(deps),
      't2_test1',
      TODAY,
      puzzle.truth
    );

    expect(result).toMatchObject({
      score: 1000,
      stars: 3,
      streak: { current: 0, best: 0 },
    });
    expect(
      deps.logger.entries.some(
        (entry) => entry.level === 'error' && entry.event === 'streak_write_failed'
      )
    ).toBe(true);
    expect(await deps.store.hGet(SH_KEY, String(binIndex(1000, SCORE_BIN, SCORE_BINS)))).toBe(
      '1'
    );
  });

  it('returns 200 when the streak read fails after the commit', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    deps.store.failCommand('hGetAll', Number.POSITIVE_INFINITY);

    const result = await submitGuess(
      toDeps(deps),
      't2_test1',
      TODAY,
      puzzle.truth
    );

    expect(result.streak).toEqual({ current: 0, best: 0 });
    expect(await deps.store.hGet(CLOUD_KEY, '_')).toBe('0');
  });

  it('returns 200 when counter writes keep failing and keeps other counters', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    deps.store.failCommand('hIncrBy', Number.POSITIVE_INFINITY);

    const result = await submitGuess(
      toDeps(deps),
      't2_test1',
      TODAY,
      puzzle.truth
    );

    expect(result).toMatchObject({ score: 1000, stars: 3 });
    expect(
      deps.logger.entries.some(
        (entry) =>
          entry.level === 'error' && entry.event === 'counter_write_failed'
      )
    ).toBe(true);
    expect((await deps.store.hGetAll('st:t2_test1')).current).toBe('1');
  });

  it('still returns the computed result when every write after the commit fails', async () => {
    const deps = makeDeps();
    const puzzle = await seedPuzzle(deps);
    deps.store.failCommand('hGetAll', Number.POSITIVE_INFINITY);
    deps.store.failCommand('hSet', Number.POSITIVE_INFINITY);
    deps.store.failCommand('hIncrBy', Number.POSITIVE_INFINITY);

    const result = await submitGuess(
      toDeps(deps),
      't2_test1',
      TODAY,
      puzzle.truth
    );

    expect(result).toEqual({
      errorKm: 0,
      score: 1000,
      stars: 3,
      truth: puzzle.truth,
      streak: { current: 0, best: 0 },
    });
  });
});
