/**
 * @file        tests/server/rateLimit.test.ts
 * @purpose     Proves the per-user per-minute limits, the retry-after value and the two-op budget.
 * @covers      src/server/core/rateLimit.ts
 * @spec        01-spec.md section 2; 04-security.md S6, S7
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/server/core/errors';
import { checkRate, RATE_LIMIT_BUCKETS } from '../../src/server/core/rateLimit';
import { rateLimitKey } from '../../src/server/core/redisKeys';
import { FakeClock } from '../fakes/clock';
import { FakeStore } from '../fakes/store';

const NOW = new Date(Date.UTC(2026, 10, 17, 12, 34, 30));

function makeDeps(store = new FakeStore(), clock = new FakeClock(NOW)) {
  return { store, clock };
}

async function expect429(promise: Promise<void>, retryAfterS: number) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((error: unknown) => {
    const appError = error as AppError;
    expect(appError.status).toBe(429);
    expect(appError.code).toBe('rate_limited');
    expect(appError.retryAfterS).toBe(retryAfterS);
  });
}

describe('checkRate', () => {
  it('allows five guesses per minute and rejects the sixth with Retry-After', async () => {
    const deps = makeDeps();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(checkRate(deps, 't2_test1', 'guess')).resolves.toBeUndefined();
    }

    await expect429(checkRate(deps, 't2_test1', 'guess'), 30);
  });

  it('allows thirty reads per minute and rejects the thirty-first', async () => {
    const deps = makeDeps();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await checkRate(deps, 't2_test1', 'read');
    }

    await expect429(checkRate(deps, 't2_test1', 'read'), 30);
  });

  it('keeps guess and read counters separate and counts users separately', async () => {
    const deps = makeDeps();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await checkRate(deps, 't2_test1', 'read');
    }
    await expect(checkRate(deps, 't2_test1', 'guess')).resolves.toBeUndefined();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await checkRate(deps, 't2_test2', 'guess');
    }
    await expect(checkRate(deps, 't2_test2', 'read')).resolves.toBeUndefined();
  });

  it('uses the limit class and the absolute minute in the key', async () => {
    const store = new FakeStore();
    const deps = makeDeps(store);

    await checkRate(deps, 't2_test1', 'guess');

    const minute = Math.floor(NOW.getTime() / 60000);
    const key = rateLimitKey(RATE_LIMIT_BUCKETS.guess, 't2_test1', minute);
    expect(store.strings.get(key)).toBe('1');
    expect(store.expirations.get(key)).toBe(120);
  });

  it('uses at most two store operations and expires only on the first increment', async () => {
    const store = new FakeStore();
    const deps = makeDeps(store);

    await checkRate(deps, 't2_test1', 'read');
    expect(store.opCount).toBe(2);
    await checkRate(deps, 't2_test1', 'read');
    expect(store.opCount).toBe(3);
  });

  it('frees the bucket when the clock crosses into the next minute', async () => {
    const clock = new FakeClock(NOW);
    const deps = makeDeps(new FakeStore(), clock);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await checkRate(deps, 't2_test1', 'guess');
    }
    await expect429(checkRate(deps, 't2_test1', 'guess'), 30);

    clock.advance(30_000);
    await expect(
      checkRate(deps, 't2_test1', 'guess')
    ).resolves.toBeUndefined();
  });

  it('reports the seconds to the next minute boundary', async () => {
    const clock = new FakeClock(new Date(Date.UTC(2026, 10, 17, 12, 34, 59)));
    const deps = makeDeps(new FakeStore(), clock);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await checkRate(deps, 't2_test1', 'guess');
    }

    await expect429(checkRate(deps, 't2_test1', 'guess'), 1);
  });

  it('maps a store failure to 503', async () => {
    const store = new FakeStore();
    store.failCommand('incrBy', 1);
    const deps = makeDeps(store);

    await expect(checkRate(deps, 't2_test1', 'guess')).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
  });

  it('maps a failed expiry to 503 rather than leaving a counter without a TTL', async () => {
    const store = new FakeStore();
    store.failCommand('expire', 1);
    const deps = makeDeps(store);

    await expect(checkRate(deps, 't2_test1', 'guess')).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
  });
});
