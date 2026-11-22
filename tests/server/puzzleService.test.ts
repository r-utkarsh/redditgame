/**
 * @file        tests/server/puzzleService.test.ts
 * @purpose     Proves post-based date resolution, lazy creation, sentinels, TTLs and the secret-free open payload.
 * @covers      src/server/core/puzzleService.ts
 * @spec        01-spec.md sections 5 and 6; 04-security.md S1, S11, S19
 */
import { describe, expect, it } from 'vitest';
import {
  DAY_KEY_TTL_DAYS,
  MAP_SIZE_KM,
} from '../../src/shared/constants';
import { difficultyForDateKey } from '../../src/shared/dates';
import { distanceKm } from '../../src/shared/geometry';
import type { PrivatePuzzle } from '../../src/shared/types';
import {
  ensurePuzzle,
  getPuzzle,
} from '../../src/server/core/puzzleService';
import { makeDeps, TODAY, toDeps } from '../fakes/deps';

const YESTERDAY = '2026-11-16';
const PUZ_KEY = `puz:${TODAY}`;

function readPrivate(deps: ReturnType<typeof makeDeps>): PrivatePuzzle {
  const raw = deps.store.hashes.get(PUZ_KEY)?.get('data');
  if (!raw) {
    throw new Error('puzzle data missing');
  }
  return JSON.parse(raw) as PrivatePuzzle;
}

function expectNoSecrets(payload: unknown, truth: { x: number; y: number }): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      expect(key.toLowerCase()).not.toMatch(/truth|seed|solverfit/);
      visit(record[key]);
    }
    if (typeof record.x === 'number' && typeof record.y === 'number') {
      expect(distanceKm({ x: record.x, y: record.y }, truth)).toBeGreaterThan(
        0.11
      );
    }
  };
  visit(payload);
}

describe('getPuzzle', () => {
  it('returns the closed payload with null dateKey when there is no post id', async () => {
    const deps = makeDeps();

    const payload = await getPuzzle(toDeps(deps), 't2_test1', undefined);

    expect(payload).toEqual({
      status: 'closed',
      splashState: 'closed',
      dateKey: null,
      alreadyGuessed: false,
      streak: { current: 0, best: 0 },
    });
  });

  it('returns the closed payload when the post mapping is missing', async () => {
    const deps = makeDeps();

    const payload = await getPuzzle(toDeps(deps), 't2_test1', 't3_unknown');

    expect(payload).toEqual({
      status: 'closed',
      splashState: 'closed',
      dateKey: null,
      alreadyGuessed: false,
      streak: { current: 0, best: 0 },
    });
    expect(deps.entropy.calls).toBe(0);
    expect(deps.store.hasKey(PUZ_KEY)).toBe(false);
  });

  it('does not create a puzzle for a past post', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', YESTERDAY);

    const payload = await getPuzzle(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.status).toBe('closed');
    expect(payload.dateKey).toBe(YESTERDAY);
    expect(deps.entropy.calls).toBe(0);
    expect(deps.store.hasKey(`puz:${YESTERDAY}`)).toBe(false);
  });

  it('creates and returns today\'s open puzzle with no secret fields', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);

    const payload = await getPuzzle(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.status).toBe('open');
    if (payload.status !== 'open') {
      throw new Error('expected an open payload');
    }

    const difficulty = difficultyForDateKey(TODAY);
    expect(Object.keys(payload).sort()).toEqual(
      [
        'alreadyGuessed',
        'dateKey',
        'fault',
        'mapSizeKm',
        'splashState',
        'stations',
        'status',
        'streak',
      ].sort()
    );
    expect(payload.dateKey).toBe(TODAY);
    expect(payload.mapSizeKm).toBe(MAP_SIZE_KM);
    expect(payload.stations).toHaveLength(difficulty.stations);
    expect(payload.fault === null).toBe(!difficulty.faultShown);
    expect(payload.alreadyGuessed).toBe(false);
    expect(payload.streak).toEqual({ current: 0, best: 0 });

    const truth = readPrivate(deps).truth;
    expectNoSecrets(payload, truth);
  });

  it('reports alreadyGuessed and the live streak', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await deps.store.hSet(
      `gs:${TODAY}`,
      't2_test1',
      JSON.stringify({ x: 500, y: 500, errorKm: 10, score: 779 })
    );
    await deps.store.hSet(`st:t2_test1`, 'lastDateKey', YESTERDAY);
    await deps.store.hSet(`st:t2_test1`, 'current', '3');
    await deps.store.hSet(`st:t2_test1`, 'best', '7');

    const payload = await getPuzzle(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.alreadyGuessed).toBe(true);
    expect(payload.streak).toEqual({ current: 3, best: 7 });
  });

  it('resets the displayed streak to zero after a missed day', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', TODAY);
    await deps.store.hSet(`st:t2_test1`, 'lastDateKey', '2026-11-14');
    await deps.store.hSet(`st:t2_test1`, 'current', '5');
    await deps.store.hSet(`st:t2_test1`, 'best', '9');

    const payload = await getPuzzle(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.streak).toEqual({ current: 0, best: 9 });
  });

  it('reports a past guess on a closed post with a known date', async () => {
    const deps = makeDeps();
    await deps.store.set('post:t3_testpost', YESTERDAY);
    await deps.store.hSet(`gs:${YESTERDAY}`, 't2_test1', '{}');
    const before = deps.store.opCount;

    const payload = await getPuzzle(toDeps(deps), 't2_test1', 't3_testpost');

    expect(payload.alreadyGuessed).toBe(true);
    expect(deps.store.opCount - before).toBe(3);
  });
});

describe('ensurePuzzle', () => {
  it('creates the puzzle with one hSetNX, five sentinels and the day TTLs', async () => {
    const deps = makeDeps();
    const before = deps.store.opCount;

    const puzzle = await ensurePuzzle(toDeps(deps), TODAY);

    expect(puzzle.stations.length).toBeGreaterThanOrEqual(3);
    expect(deps.entropy.calls).toBe(1);
    expect(deps.store.opCount - before).toBeLessThanOrEqual(20);
    expect(deps.store.hashes.get(PUZ_KEY)?.size).toBe(1);
    expect(readPrivate(deps).seed).toBe(123456);

    for (const key of [
      PUZ_KEY,
      `gs:${TODAY}`,
      `cloud:${TODAY}`,
      `mx:${TODAY}`,
      `my:${TODAY}`,
      `sh:${TODAY}`,
    ]) {
      expect(deps.store.expirations.get(key)).toBe(DAY_KEY_TTL_DAYS * 86400);
    }
    for (const key of [
      `gs:${TODAY}`,
      `cloud:${TODAY}`,
      `mx:${TODAY}`,
      `my:${TODAY}`,
      `sh:${TODAY}`,
    ]) {
      expect(deps.store.hashes.get(key)?.get('_')).toBe('0');
    }
  });

  it('reuses the stored puzzle without drawing a seed or running creation again', async () => {
    const deps = makeDeps();
    const first = await ensurePuzzle(toDeps(deps), TODAY);
    const before = deps.store.opCount;

    const second = await ensurePuzzle(toDeps(deps), TODAY);

    expect(second).toEqual(first);
    expect(deps.entropy.calls).toBe(1);
    expect(deps.store.opCount - before).toBeLessThanOrEqual(8);
  });

  it('lets two concurrent creators converge on one stored puzzle', async () => {
    const deps = makeDeps();

    const [left, right] = await Promise.all([
      ensurePuzzle(toDeps(deps), TODAY),
      ensurePuzzle(toDeps(deps), TODAY),
    ]);

    expect(left).toEqual(right);
    expect(deps.store.hashes.get(PUZ_KEY)?.size).toBe(1);
    expect(deps.store.hashes.get(PUZ_KEY)?.has('data')).toBe(true);
  });

  it('maps a failed data hSetNX to 503 and leaves no sentinels', async () => {
    const deps = makeDeps();
    deps.store.failCommand('hSetNX', 1);

    await expect(ensurePuzzle(toDeps(deps), TODAY)).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
    expect(deps.store.hasKey(PUZ_KEY)).toBe(false);
    expect(deps.store.hasKey(`gs:${TODAY}`)).toBe(false);
  });

  it('returns the puzzle when a sentinel fails, keeps puz, and repairs later', async () => {
    const deps = makeDeps();
    deps.store.failKey(`cloud:${TODAY}`, 1);

    const puzzle = await ensurePuzzle(toDeps(deps), TODAY);

    expect(puzzle.stations.length).toBeGreaterThanOrEqual(3);
    expect(deps.store.hasKey(PUZ_KEY)).toBe(true);
    expect(deps.store.hashes.get(`gs:${TODAY}`)?.has('_') ?? false).toBe(false);
    expect(
      deps.logger.entries.some(
        (entry) => entry.level === 'error' && entry.event === 'puzzle_setup_failed'
      )
    ).toBe(true);

    await ensurePuzzle(toDeps(deps), TODAY);
    expect(deps.store.hashes.get(`gs:${TODAY}`)?.get('_')).toBe('0');
    expect(deps.store.expirations.get(`cloud:${TODAY}`)).toBe(
      DAY_KEY_TTL_DAYS * 86400
    );
  });

  it('returns the puzzle when a TTL step fails and never deletes puz', async () => {
    const deps = makeDeps();
    deps.store.failCommand('expire', 1);

    const puzzle = await ensurePuzzle(toDeps(deps), TODAY);

    expect(puzzle.stations.length).toBeGreaterThanOrEqual(3);
    expect(deps.store.hashes.get(PUZ_KEY)?.has('data')).toBe(true);
    expect(deps.logger.entries.some((entry) => entry.level === 'error')).toBe(
      true
    );

    await ensurePuzzle(toDeps(deps), TODAY);
    expect(deps.store.expirations.get(PUZ_KEY)).toBe(DAY_KEY_TTL_DAYS * 86400);
  });

  it('maps corrupt puzzle data to 503 instead of regenerating it', async () => {
    const deps = makeDeps();
    await deps.store.hSet(PUZ_KEY, 'data', '{not json');

    await expect(ensurePuzzle(toDeps(deps), TODAY)).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
    expect(deps.entropy.calls).toBe(0);
  });

  it('maps a failed puzzle read to 503', async () => {
    const deps = makeDeps();
    deps.store.failCommand('hGet', 1);

    await expect(ensurePuzzle(toDeps(deps), TODAY)).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
  });
});
