/**
 * @file        tests/server/load.test.ts
 * @purpose     Proves the fake-store flow holds up under a 200-player day: every guess commits, bins stay in bounds and the results payload stays bounded.
 * @covers      src/server/core/puzzleService.ts, src/server/core/guessService.ts, src/server/core/resultsService.ts, src/shared/crowd.ts
 * @spec        01-spec.md sections 5 and 6; 03-tdd-and-testing.md section 4b; 04-security.md S6, S7; P6-hardening.md step 2
 */
import { describe, expect, it } from 'vitest';
import {
  CLOUD_BINS,
  MARGINAL_BINS,
  MAP_SIZE_KM,
  MIN_PLAYERS_FOR_CROWD_STATS,
  SCORE_BINS,
} from '../../src/shared/constants';
import { getResults } from '../../src/server/core/resultsService';
import { submitGuess } from '../../src/server/core/guessService';
import { ensurePuzzle } from '../../src/server/core/puzzleService';
import { makeDeps, TODAY, toDeps } from '../fakes/deps';

const POST = 't3_loadtest';
const PLAYER_COUNT = 200;
const RESPONSE_SIZE_LIMIT_BYTES = 1_000 + 40 * CLOUD_BINS * CLOUD_BINS;

// Deterministic low-discrepancy spread so the guesses land in many bins.
function loadGuess(index: number): { x: number; y: number } {
  const x = (index * 137 + 61) % MAP_SIZE_KM;
  const y = (index * 291 + 173) % MAP_SIZE_KM;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

async function seedPuzzle(deps: ReturnType<typeof makeDeps>) {
  await deps.store.set(`post:${POST}`, TODAY);
  return ensurePuzzle(toDeps(deps), TODAY, { repair: false });
}

describe('200-player day on the fake store', () => {
  it('commits 200 guesses, stays in bin bounds and bounds the results payload', async () => {
    const deps = makeDeps();
    await seedPuzzle(deps);

    for (let index = 0; index < PLAYER_COUNT; index += 1) {
      const userId = `t2_load${String(index).padStart(3, '0')}`;
      const result = await submitGuess(
        toDeps(deps),
        userId,
        TODAY,
        loadGuess(index)
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1000);
      expect(result.stars).toBeGreaterThanOrEqual(0);
      expect(result.stars).toBeLessThanOrEqual(3);
    }

    const sh = await deps.store.hGetAll(`sh:${TODAY}`);
    const shTotal = Object.entries(sh)
      .filter(([field]) => field !== '_')
      .reduce((sum, [, value]) => sum + Number(value), 0);
    expect(shTotal).toBe(PLAYER_COUNT);
    for (const field of Object.keys(sh)) {
      expect(field).toMatch(/^(\d{1,3}|_)$/);
      if (field !== '_') {
        expect(Number(field)).toBeLessThan(SCORE_BINS);
      }
    }

    const cloud = await deps.store.hGetAll(`cloud:${TODAY}`);
    for (const field of Object.keys(cloud)) {
      expect(field).toMatch(/^(\d{1,2}:\d{1,2}|_)$/);
      if (field !== '_') {
        const [cx, cy] = field.split(':').map(Number);
        expect(cx).toBeGreaterThanOrEqual(0);
        expect(cx).toBeLessThan(CLOUD_BINS);
        expect(cy).toBeGreaterThanOrEqual(0);
        expect(cy).toBeLessThan(CLOUD_BINS);
      }
    }

    for (const axis of ['mx', 'my'] as const) {
      const bins = await deps.store.hGetAll(`${axis}:${TODAY}`);
      for (const field of Object.keys(bins)) {
        expect(field).toMatch(/^(\d{1,2}|_)$/);
        if (field !== '_') {
          expect(Number(field)).toBeLessThan(MARGINAL_BINS);
        }
      }
    }

    const before = deps.store.opCount;
    const results = await getResults(toDeps(deps), 't2_load000', POST);

    expect(results.playerCount).toBe(PLAYER_COUNT);
    expect(deps.store.opCount - before).toBeLessThanOrEqual(8);

    expect(results.cloud.length).toBeLessThanOrEqual(
      CLOUD_BINS * CLOUD_BINS
    );
    const cloudTotal = results.cloud.reduce((sum, cell) => sum + cell.n, 0);
    expect(cloudTotal).toBe(PLAYER_COUNT);
    for (const cell of results.cloud) {
      expect(cell.cx).toBeGreaterThanOrEqual(0);
      expect(cell.cx).toBeLessThan(CLOUD_BINS);
      expect(cell.cy).toBeGreaterThanOrEqual(0);
      expect(cell.cy).toBeLessThan(CLOUD_BINS);
      expect(Number.isInteger(cell.n)).toBe(true);
      expect(cell.n).toBeGreaterThanOrEqual(1);
    }

    expect(MIN_PLAYERS_FOR_CROWD_STATS).toBeLessThanOrEqual(PLAYER_COUNT);
    expect(results.percentile).not.toBeNull();
    expect(results.percentile).toBeGreaterThanOrEqual(0);
    expect(results.percentile).toBeLessThanOrEqual(100);
    expect(results.crowdMedian).not.toBeNull();
    expect(results.crowdMedian?.x).toBeGreaterThanOrEqual(0);
    expect(results.crowdMedian?.x).toBeLessThanOrEqual(MAP_SIZE_KM);
    expect(results.crowdMedian?.y).toBeGreaterThanOrEqual(0);
    expect(results.crowdMedian?.y).toBeLessThanOrEqual(MAP_SIZE_KM);

    expect(JSON.stringify(results).length).toBeLessThanOrEqual(
      RESPONSE_SIZE_LIMIT_BYTES
    );
  }, 60000);

  it('keeps the single-guess op budget of ten after 200 prior guesses', async () => {
    const deps = makeDeps();
    await seedPuzzle(deps);

    for (let index = 0; index < PLAYER_COUNT; index += 1) {
      const userId = `t2_load${String(index).padStart(3, '0')}`;
      await submitGuess(toDeps(deps), userId, TODAY, loadGuess(index));
    }

    const before = deps.store.opCount;
    await submitGuess(toDeps(deps), 't2_loadscan', TODAY, {
      x: 500,
      y: 500,
    });
    expect(deps.store.opCount - before).toBeLessThanOrEqual(10);
  }, 60000);
});
