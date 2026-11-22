/**
 * @file        tests/server/streakService.test.ts
 * @purpose     Proves first-day, consecutive, gap, same-day and read-path reset streak behavior.
 * @covers      src/server/core/streakService.ts
 * @spec        01-spec.md section 7; 04-security.md S11
 */
import { describe, expect, it } from 'vitest';
import {
  displayStreak,
  nextStreakState,
  parseStreak,
  readStreakState,
  saveGuessStreak,
  writeStreakState,
} from '../../src/server/core/streakService';
import { FakeStore } from '../fakes/store';

const TODAY = '2026-11-17';

describe('parseStreak', () => {
  it('returns an empty state for a missing or malformed record', () => {
    expect(parseStreak({})).toEqual({
      lastDateKey: null,
      current: 0,
      best: 0,
    });
    expect(parseStreak({ lastDateKey: 'not-a-date', current: 'x', best: '-2' })).toEqual({
      lastDateKey: null,
      current: 0,
      best: 0,
    });
  });

  it('reads the three documented fields', () => {
    expect(
      parseStreak({ lastDateKey: '2026-11-16', current: '3', best: '7' })
    ).toEqual({ lastDateKey: '2026-11-16', current: 3, best: 7 });
  });
});

describe('nextStreakState', () => {
  it('starts at one on the first guess', () => {
    expect(
      nextStreakState({ lastDateKey: null, current: 0, best: 0 }, TODAY)
    ).toEqual({ lastDateKey: TODAY, current: 1, best: 1 });
  });

  it('increments on consecutive UTC days', () => {
    expect(
      nextStreakState(
        { lastDateKey: '2026-11-16', current: 3, best: 5 },
        TODAY
      )
    ).toEqual({ lastDateKey: TODAY, current: 4, best: 5 });
  });

  it('raises best when current overtakes it', () => {
    expect(
      nextStreakState(
        { lastDateKey: '2026-11-16', current: 5, best: 5 },
        TODAY
      )
    ).toEqual({ lastDateKey: TODAY, current: 6, best: 6 });
  });

  it('resets current but keeps best after a gap', () => {
    expect(
      nextStreakState(
        { lastDateKey: '2026-11-14', current: 4, best: 9 },
        TODAY
      )
    ).toEqual({ lastDateKey: TODAY, current: 1, best: 9 });
  });

  it('keeps the streak when the same day is recorded twice', () => {
    expect(
      nextStreakState(
        { lastDateKey: TODAY, current: 2, best: 4 },
        TODAY
      )
    ).toEqual({ lastDateKey: TODAY, current: 2, best: 4 });
  });
});

describe('displayStreak', () => {
  it('is zero before any guess', () => {
    expect(displayStreak({ lastDateKey: null, current: 0, best: 0 }, TODAY)).toEqual({
      current: 0,
      best: 0,
    });
  });

  it('keeps current for today and yesterday and zeroes it afterwards', () => {
    expect(
      displayStreak({ lastDateKey: TODAY, current: 3, best: 8 }, TODAY)
    ).toEqual({ current: 3, best: 8 });
    expect(
      displayStreak({ lastDateKey: '2026-11-16', current: 3, best: 8 }, TODAY)
    ).toEqual({ current: 3, best: 8 });
    expect(
      displayStreak({ lastDateKey: '2026-11-15', current: 3, best: 8 }, TODAY)
    ).toEqual({ current: 0, best: 8 });
  });
});

describe('read and write', () => {
  it('reads a missing hash as an empty state', async () => {
    const store = new FakeStore();

    await expect(readStreakState(store, 't2_test1')).resolves.toEqual({
      lastDateKey: null,
      current: 0,
      best: 0,
    });
  });

  it('writes exactly the three fields', async () => {
    const store = new FakeStore();

    await writeStreakState(store, 't2_test1', {
      lastDateKey: TODAY,
      current: 2,
      best: 4,
    });

    expect(store.hashes.get('st:t2_test1')).toEqual(
      new Map([
        ['lastDateKey', TODAY],
        ['current', '2'],
        ['best', '4'],
      ])
    );
  });
});

describe('saveGuessStreak', () => {
  it('records a first guess in four ops', async () => {
    const store = new FakeStore();

    await expect(saveGuessStreak(store, 't2_test1', TODAY)).resolves.toEqual({
      current: 1,
      best: 1,
    });
    expect(store.opCount).toBe(4);
    expect(store.hashes.get('st:t2_test1')?.get('lastDateKey')).toBe(TODAY);
  });

  it('increments a consecutive day', async () => {
    const store = new FakeStore();
    await writeStreakState(store, 't2_test1', {
      lastDateKey: '2026-11-16',
      current: 2,
      best: 2,
    });

    await expect(saveGuessStreak(store, 't2_test1', TODAY)).resolves.toEqual({
      current: 3,
      best: 3,
    });
  });

  it('does not write again for the same day', async () => {
    const store = new FakeStore();
    await writeStreakState(store, 't2_test1', {
      lastDateKey: TODAY,
      current: 4,
      best: 9,
    });
    const before = store.opCount;

    await expect(saveGuessStreak(store, 't2_test1', TODAY)).resolves.toEqual({
      current: 4,
      best: 9,
    });
    expect(store.opCount - before).toBe(1);
  });

  it('throws when a streak write fails so the caller can retry once', async () => {
    const store = new FakeStore();
    store.failCommand('hSet', 1);

    await expect(saveGuessStreak(store, 't2_test1', TODAY)).rejects.toThrow(
      'hSet failed'
    );
  });
});
