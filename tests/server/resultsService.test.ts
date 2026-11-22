/**
 * @file        tests/server/resultsService.test.ts
 * @purpose     Proves the 403/410 rules, bounded crowd bins, median and percentile, and the anonymous payload.
 * @covers      src/server/core/resultsService.ts
 * @spec        01-spec.md sections 5 and 6; 04-security.md S1, S6, S17
 */
import { describe, expect, it } from 'vitest';
import {
  CLOUD_BIN_KM,
  CLOUD_BINS,
  MAP_SIZE_KM,
} from '../../src/shared/constants';
import { binIndex } from '../../src/shared/crowd';
import { getResults } from '../../src/server/core/resultsService';
import { submitGuess } from '../../src/server/core/guessService';
import { ensurePuzzle } from '../../src/server/core/puzzleService';
import { FakeClock } from '../fakes/clock';
import { makeDeps, TODAY, toDeps } from '../fakes/deps';

const CLOUD_KEY = `cloud:${TODAY}`;
const MX_KEY = `mx:${TODAY}`;
const MY_KEY = `my:${TODAY}`;
const SH_KEY = `sh:${TODAY}`;
const GS_KEY = `gs:${TODAY}`;

async function seedGuessed(
  deps: ReturnType<typeof makeDeps>,
  dateKey = TODAY,
  guess = { x: 500, y: 500 }
) {
  const puzzle = await ensurePuzzle(toDeps(deps), dateKey, { repair: false });
  const result = await submitGuess(toDeps(deps), 't2_test1', dateKey, guess);
  return { puzzle, result };
}

async function setCounts(
  deps: ReturnType<typeof makeDeps>,
  key: string,
  counts: Record<string, number>
): Promise<void> {
  await deps.store.del(key);
  await deps.store.hSet(key, '_', '0');
  for (const [field, count] of Object.entries(counts)) {
    await deps.store.hSet(key, field, String(count));
  }
}

describe('getResults', () => {
  it('returns 410 when there is no post id', async () => {
    const deps = makeDeps();

    await expect(
      getResults(toDeps(deps), 't2_test1', undefined)
    ).rejects.toMatchObject({ status: 410, code: 'puzzle_closed' });
  });

  it('returns 410 when the post mapping is missing', async () => {
    const deps = makeDeps();

    await expect(
      getResults(toDeps(deps), 't2_test1', 't3_unknown')
    ).rejects.toMatchObject({ status: 410, code: 'puzzle_closed' });
  });

  it('returns 410 after the day data expired even when a guess remains', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await deps.store.hSet(GS_KEY, 't2_test1', JSON.stringify({
      x: 500,
      y: 500,
      errorKm: 10,
      score: 779,
    }));

    await expect(
      getResults(toDeps(deps), 't2_test1', 't3_testpost')
    ).rejects.toMatchObject({ status: 410, code: 'puzzle_closed' });
  });

  it('returns 403 before a stored guess and does not read crowd counters', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await ensurePuzzle(toDeps(deps), TODAY, { repair: false });
    deps.store.failCommand('hGetAll', 1);

    await expect(
      getResults(toDeps(deps), 't2_test1', 't3_testpost')
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('returns the full anonymous payload for a guesser', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    const { puzzle, result } = await seedGuessed(deps);

    const payload = await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(Object.keys(payload).sort()).toEqual(
      [
        'cloud',
        'crowdMedian',
        'fault',
        'mapSizeKm',
        'percentile',
        'playerCount',
        'solverFit',
        'stations',
        'truth',
        'you',
      ].sort()
    );
    expect(payload.truth).toEqual(puzzle.truth);
    expect(payload.solverFit).toEqual(puzzle.solverFit);
    expect(payload.stations).toEqual(puzzle.stations);
    expect(payload.mapSizeKm).toBe(MAP_SIZE_KM);
    expect(payload.fault).toEqual(puzzle.fault);
    expect(payload.playerCount).toBe(1);
    expect(payload.percentile).toBeNull();
    expect(payload.crowdMedian).toBeNull();
    expect(payload.you).toEqual({
      x: 500,
      y: 500,
      errorKm: result.errorKm,
      score: result.score,
      stars: result.stars,
    });
    expect(payload.cloud).toEqual([
      {
        cx: binIndex(500, CLOUD_BIN_KM, CLOUD_BINS),
        cy: binIndex(500, CLOUD_BIN_KM, CLOUD_BINS),
        n: 1,
      },
    ]);

    const text = JSON.stringify(payload);
    expect(text).not.toContain('t2_test1');
    expect(text).not.toContain('userId');
  });

  it('computes playerCount from sh, not from the guess hash length', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await seedGuessed(deps);
    await deps.store.hSet(GS_KEY, 't2_other1', '{}');
    await deps.store.hSet(GS_KEY, 't2_other2', '{}');
    await deps.store.hSet(GS_KEY, 't2_other3', '{}');

    const payload = await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.playerCount).toBe(1);
  });

  it('computes the median and percentile once five players exist', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    const { result } = await seedGuessed(deps);
    const playerBin = binIndex(result.score, 10, 101);
    const counts: Record<string, number> = {};
    if (playerBin === 0) {
      counts['0'] = 2;
      counts['1'] = 3;
    } else {
      counts['0'] = 2;
      counts[String(playerBin)] = 2;
      counts[String(playerBin === 100 ? 99 : 100)] = 1;
    }

    await setCounts(deps, SH_KEY, counts);
    await setCounts(deps, MX_KEY, { '0': 2, '1': 3 });
    await setCounts(deps, MY_KEY, { '2': 5 });

    const lower = Object.entries(counts)
      .filter(([bin]) => Number(bin) < playerBin)
      .reduce((sum, [, count]) => sum + count, 0);
    const sameBinOthers = (counts[String(playerBin)] ?? 0) - 1;
    const expectedPercentile = Math.min(
      100,
      Math.max(
        0,
        Math.round((100 * (lower + 0.5 * sameBinOthers)) / 4)
      )
    );

    const payload = await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.playerCount).toBe(5);
    expect(payload.crowdMedian).toEqual({ x: 15, y: 25 });
    expect(payload.percentile).toBe(expectedPercentile);
    expect(payload.cloud.length).toBe(1);
  });

  it('ignores the sentinel in every aggregator', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await seedGuessed(deps);
    await deps.store.hSet(SH_KEY, '_', '999');
    await deps.store.hSet(MX_KEY, '_', '999');
    await deps.store.hSet(MY_KEY, '_', '999');
    await deps.store.hSet(CLOUD_KEY, '_', '999');

    const payload = await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.playerCount).toBe(1);
    expect(payload.cloud.some((cell) => cell.cx === 0 && cell.cy === 0 && cell.n === 999)).toBe(
      false
    );
    expect(payload.crowdMedian).toBeNull();
  });

  it('drops malformed and out-of-range cloud bins', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await seedGuessed(deps);
    for (const field of ['-1:0', '50:0', '0:50', 'a:b', '1:2:3', '1.5:2', '2:1.5']) {
      await deps.store.hSet(CLOUD_KEY, field, '1');
    }
    await deps.store.hSet(CLOUD_KEY, '49:49', '2');

    const payload = await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.cloud).toContainEqual({ cx: 49, cy: 49, n: 2 });
    expect(
      payload.cloud.every(
        (cell) =>
          Number.isInteger(cell.cx) &&
          Number.isInteger(cell.cy) &&
          cell.cx >= 0 &&
          cell.cx < CLOUD_BINS &&
          cell.cy >= 0 &&
          cell.cy < CLOUD_BINS
      )
    ).toBe(true);
    expect(payload.cloud.length).toBeLessThanOrEqual(CLOUD_BINS * CLOUD_BINS);
  });

  it('still serves results for a closed past puzzle', async () => {
    const deps = makeDeps({
      clock: new FakeClock(new Date(Date.UTC(2026, 10, 16, 12, 0, 0))),
    });
    await deps.store.set('post:t3_testpost', '2026-11-16');
    await seedGuessed(deps, '2026-11-16');
    deps.clock.set(new Date(Date.UTC(2026, 10, 17, 12, 0, 0)));

    const payload = await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.playerCount).toBe(1);
    expect(payload.you.x).toBe(500);
  });

  it('maps corrupt guess data to 503', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await ensurePuzzle(toDeps(deps), TODAY, { repair: false });
    await deps.store.hSet(GS_KEY, 't2_test1', '{not json');

    await expect(
      getResults(toDeps(deps), 't2_test1', 't3_testpost')
    ).rejects.toMatchObject({ status: 503, code: 'unavailable' });
  });

  it('maps a storage failure to 503', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await seedGuessed(deps);
    deps.store.failCommand('hGetAll', 1);

    await expect(
      getResults(toDeps(deps), 't2_test1', 't3_testpost')
    ).rejects.toMatchObject({ status: 503, code: 'unavailable' });
  });

  it('uses at most eight business ops on the results path', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await seedGuessed(deps);
    const before = deps.store.opCount;

    await getResults(toDeps(deps), 't2_test1', 't3_testpost');

    expect(deps.store.opCount - before).toBeLessThanOrEqual(8);
  });
});
