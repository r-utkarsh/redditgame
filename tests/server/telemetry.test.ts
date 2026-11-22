/**
 * @file        tests/server/telemetry.test.ts
 * @purpose     Proves Journey events fire once after committed actions, carry the mapped payload and never carry PII.
 * @covers      src/server/core/telemetry.ts, src/server/core/puzzleService.ts, src/server/core/guessService.ts, src/server/core/resultsService.ts
 * @spec        05-devvit-facts.md telemetry mapping; P5-reddit-native.md step 3; 04-security.md S17
 */
import { describe, expect, it } from 'vitest';
import { submitGuess } from '../../src/server/core/guessService';
import { ensurePuzzle, getPuzzle } from '../../src/server/core/puzzleService';
import { getResults } from '../../src/server/core/resultsService';
import { writeStreakState } from '../../src/server/core/streakService';
import type { Tracker } from '../../src/server/ports';
import { makeDeps, TODAY, toDeps } from '../fakes/deps';

const POST = 't3_testpost';
const USER = 't2_test1';

async function seedPost(deps: ReturnType<typeof makeDeps>) {
  await deps.store.set(`post:${POST}`, TODAY);
  return ensurePuzzle(toDeps(deps), TODAY, { repair: false });
}

function scoreFraction(score: number): number {
  return Math.round((score / 1000) * 100) / 100;
}

describe('App.Ready', () => {
  it('fires once per puzzle load and carries no user id', async () => {
    const deps = makeDeps();
    await seedPost(deps);

    await getPuzzle(toDeps(deps), USER, POST);

    expect(deps.tracker.events).toEqual([{ name: 'App.Ready' }]);
    expect(JSON.stringify(deps.tracker.events)).not.toContain(USER);
  });

  it('fires for a closed puzzle too', async () => {
    const deps = makeDeps();

    await getPuzzle(toDeps(deps), USER, undefined);

    expect(deps.tracker.events).toEqual([{ name: 'App.Ready' }]);
  });
});

describe('guess_submitted', () => {
  it('fires once after the commit with progress 1.0 and no coordinates', async () => {
    const deps = makeDeps();
    await seedPost(deps);

    await submitGuess(toDeps(deps), USER, TODAY, { x: 412.3, y: 388.8 });

    const progress = deps.tracker.events.filter(
      (event) => event.name === 'Journey.Progress'
    );
    expect(progress).toEqual([
      {
        name: 'Journey.Progress',
        progress: 1,
        action: 'guess_submitted',
      },
    ]);
    expect(JSON.stringify(progress)).not.toContain('412.3');
    expect(JSON.stringify(progress)).not.toContain(USER);
  });

  it('does not fire again when the second guess is rejected', async () => {
    const deps = makeDeps();
    await seedPost(deps);

    await submitGuess(toDeps(deps), USER, TODAY, { x: 500, y: 500 });
    await expect(
      submitGuess(toDeps(deps), USER, TODAY, { x: 600, y: 600 })
    ).rejects.toMatchObject({ status: 409 });

    expect(
      deps.tracker.events.filter((event) => event.name === 'Journey.Progress')
    ).toHaveLength(1);
  });

  it('does not fire when the puzzle is closed', async () => {
    const deps = makeDeps();

    await expect(
      submitGuess(toDeps(deps), USER, null, { x: 500, y: 500 })
    ).rejects.toMatchObject({ status: 410 });

    expect(deps.tracker.events).toEqual([]);
  });
});

describe('streak_extended', () => {
  it('does not fire on the first day', async () => {
    const deps = makeDeps();
    await seedPost(deps);

    await submitGuess(toDeps(deps), USER, TODAY, { x: 500, y: 500 });

    expect(
      deps.tracker.events.filter((event) => event.action === 'streak_extended')
    ).toEqual([]);
  });

  it('fires once when the new streak reaches 2', async () => {
    const deps = makeDeps();
    await seedPost(deps);
    await writeStreakState(deps.store, USER, {
      lastDateKey: '2026-11-16',
      current: 1,
      best: 1,
    });

    const result = await submitGuess(toDeps(deps), USER, TODAY, {
      x: 500,
      y: 500,
    });

    expect(result.streak).toEqual({ current: 2, best: 2 });
    expect(
      deps.tracker.events.filter((event) => event.action === 'streak_extended')
    ).toEqual([{ name: 'Journey.Interaction', action: 'streak_extended' }]);
  });
});

describe('results_viewed', () => {
  it('fires once after a stored guess with win and a two-decimal score', async () => {
    const deps = makeDeps();
    await seedPost(deps);
    const result = await submitGuess(toDeps(deps), USER, TODAY, {
      x: 500,
      y: 500,
    });
    deps.tracker.events.length = 0;

    await getResults(toDeps(deps), USER, POST);

    expect(deps.tracker.events).toEqual([
      {
        name: 'Journey.End',
        complete: true,
        win: result.stars >= 1,
        score: scoreFraction(result.score),
      },
    ]);
  });

  it('does not fire before a stored guess', async () => {
    const deps = makeDeps();
    await seedPost(deps);

    await expect(
      getResults(toDeps(deps), USER, POST)
    ).rejects.toMatchObject({ status: 403 });

    expect(
      deps.tracker.events.filter((event) => event.name === 'Journey.End')
    ).toEqual([]);
  });
});

describe('resilience', () => {
  it('never lets a tracker failure break a committed guess', async () => {
    const tracker: Tracker = {
      track: async () => {
        throw new Error('telemetry down');
      },
    };
    const deps = makeDeps({ tracker });
    await seedPost(deps);

    await expect(
      submitGuess(toDeps(deps), USER, TODAY, { x: 500, y: 500 })
    ).resolves.toMatchObject({ score: expect.any(Number) });
  });

  it('never lets a tracker failure break results', async () => {
    const tracker: Tracker = {
      track: async () => {
        throw new Error('telemetry down');
      },
    };
    const deps = makeDeps({ tracker });
    await seedPost(deps);
    await submitGuess(toDeps(deps), USER, TODAY, { x: 500, y: 500 });

    await expect(
      getResults(toDeps(deps), USER, POST)
    ).resolves.toMatchObject({ playerCount: 1 });
  });
});
