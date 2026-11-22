/**
 * @file        src/server/core/rateLimit.ts
 * @purpose     Enforces the per-user per-minute guess and read limits with a two-op counter.
 * @layer       server core
 * @keyFunctions
 *   - RateLimitKind
 *   - RATE_LIMIT_BUCKETS
 *   - checkRate(deps, userId, kind): Promise<void>
 * @invariants  the counter key is per limit class and absolute minute; expire runs only on the first increment; store failures become 503
 * @security    S6, S7: one counter per user and minute, no unbounded keys, Retry-After always set
 * @tests       tests/server/rateLimit.test.ts
 * @spec        01-spec.md sections 2 and 5; 04-security.md S6, S7
 */
import { RATE_LIMITS, RATE_LIMIT_WINDOW_S } from '../../shared/constants';
import { rateLimited, unavailable } from './errors';
import { rateLimitKey } from './redisKeys';
import type { Clock, Store } from '../ports';

export type RateLimitKind = 'guess' | 'read';

export const RATE_LIMIT_BUCKETS: Readonly<Record<RateLimitKind, number>> = {
  guess: 0,
  read: 1,
};

type RateDeps = { store: Store; clock: Clock };

function limitFor(kind: RateLimitKind): number {
  return kind === 'guess'
    ? RATE_LIMITS.guessPerMinute
    : RATE_LIMITS.readPerMinute;
}

function retryAfterSeconds(now: Date): number {
  return Math.max(1, 60 - now.getUTCSeconds());
}

export async function checkRate(
  deps: RateDeps,
  userId: string,
  kind: RateLimitKind
): Promise<void> {
  const now = deps.clock.now();
  const minute = Math.floor(now.getTime() / 60000);
  const key = rateLimitKey(RATE_LIMIT_BUCKETS[kind], userId, minute);

  let count: number;
  try {
    count = await deps.store.incrBy(key, 1);
    if (count === 1) {
      await deps.store.expire(key, RATE_LIMIT_WINDOW_S);
    }
  } catch {
    throw unavailable();
  }

  if (count > limitFor(kind)) {
    throw rateLimited(retryAfterSeconds(now));
  }
}
