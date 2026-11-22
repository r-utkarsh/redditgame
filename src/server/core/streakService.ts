/**
 * @file        src/server/core/streakService.ts
 * @purpose     Reads, computes and writes the per-user consecutive-day streak.
 * @layer       server core
 * @keyFunctions
 *   - StreakState
 *   - parseStreak(record): StreakState
 *   - nextStreakState(state, dateKey): StreakState
 *   - displayStreak(state, todayKey): Streak
 *   - readStreakState(store, userId): Promise<StreakState>
 *   - writeStreakState(store, userId, state): Promise<void>
 *   - saveGuessStreak(store, userId, dateKey): Promise<Streak>
 * @invariants  st:{userId} holds lastDateKey, current, best and has no TTL; a read shows current 0 after one missed day; same-day saves do not write
 * @security    S11: all day math uses UTC date keys supplied by the server clock; no user data is returned
 * @tests       tests/server/streakService.test.ts
 * @spec        01-spec.md sections 6 and 7
 */
import { isValidDateKey, previousDateKey } from '../../shared/dates';
import type { Streak } from '../../shared/types';
import { streakKey } from './redisKeys';
import type { Store } from '../ports';

export type StreakState = {
  lastDateKey: string | null;
  current: number;
  best: number;
};

function toCount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function parseStreak(record: Record<string, string>): StreakState {
  const lastDateKey =
    typeof record.lastDateKey === 'string' && isValidDateKey(record.lastDateKey)
      ? record.lastDateKey
      : null;

  return {
    lastDateKey,
    current: toCount(record.current),
    best: toCount(record.best),
  };
}

export function nextStreakState(
  state: StreakState,
  dateKey: string
): StreakState {
  let current: number;

  if (state.lastDateKey === null) {
    current = 1;
  } else if (state.lastDateKey === dateKey) {
    current = Math.max(1, state.current);
  } else if (state.lastDateKey === previousDateKey(dateKey)) {
    current = state.current + 1;
  } else {
    current = 1;
  }

  return {
    lastDateKey: dateKey,
    current,
    best: Math.max(state.best, current),
  };
}

export function displayStreak(state: StreakState, todayKey: string): Streak {
  const alive =
    state.lastDateKey !== null &&
    (state.lastDateKey === todayKey ||
      state.lastDateKey === previousDateKey(todayKey));

  return {
    current: alive ? state.current : 0,
    best: state.best,
  };
}

export async function readStreakState(
  store: Store,
  userId: string
): Promise<StreakState> {
  return parseStreak(await store.hGetAll(streakKey(userId)));
}

export async function writeStreakState(
  store: Store,
  userId: string,
  state: StreakState
): Promise<void> {
  const key = streakKey(userId);
  await store.hSet(key, 'lastDateKey', state.lastDateKey ?? '');
  await store.hSet(key, 'current', String(state.current));
  await store.hSet(key, 'best', String(state.best));
}

export async function saveGuessStreak(
  store: Store,
  userId: string,
  dateKey: string
): Promise<Streak> {
  const state = await readStreakState(store, userId);
  const next = nextStreakState(state, dateKey);

  if (state.lastDateKey !== dateKey) {
    await writeStreakState(store, userId, next);
  }

  return { current: next.current, best: next.best };
}
