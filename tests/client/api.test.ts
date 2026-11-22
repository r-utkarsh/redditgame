/**
 * @file        tests/client/api.test.ts
 * @purpose     Proves the client API validates every response at runtime, sends only x and y, and maps failures.
 * @covers      src/client/api.ts
 * @spec        01-spec.md section 5; P4-client.md step 2; 04-security.md S3, S5, S10
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  GuessResult,
  PuzzlePayload,
  ResultsPayload,
} from '../../src/shared/types';
import { createApi } from '../../src/client/api';
import type { FetchLike } from '../../src/client/api';

const puzzle: PuzzlePayload = {
  status: 'open',
  splashState: 'open',
  dateKey: '2026-11-18',
  mapSizeKm: 1000,
  stations: [
    { id: 'A', x: 200, y: 200, delayS: 12.6 },
    { id: 'B', x: 800, y: 300, delayS: 4 },
    { id: 'C', x: 500, y: 800, delayS: 9.5 },
  ],
  fault: [
    { x: 100, y: 100 },
    { x: 900, y: 900 },
  ],
  alreadyGuessed: false,
  streak: { current: 2, best: 9 },
};

const guess: GuessResult = {
  errorKm: 23.4,
  score: 820,
  stars: 2,
  truth: { x: 400, y: 420 },
  streak: { current: 3, best: 9 },
};

const results: ResultsPayload = {
  truth: { x: 400, y: 420 },
  solverFit: { x: 410, y: 430, errorKm: 12.4 },
  cloud: [{ cx: 20, cy: 21, n: 3 }],
  crowdMedian: { x: 405, y: 415 },
  playerCount: 12,
  percentile: 78,
  you: { x: 390, y: 440, errorKm: 23.4, score: 820, stars: 2 },
  stations: puzzle.status === 'open' ? puzzle.stations : [],
  mapSizeKm: 1000,
  fault: [
    { x: 100, y: 100 },
    { x: 900, y: 900 },
  ],
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fetcherFor(response: Response): FetchLike {
  return vi.fn(async () => response);
}

describe('GET /api/puzzle', () => {
  it('requests the puzzle and accepts an open payload', async () => {
    const fetcher = fetcherFor(json(puzzle));
    const api = createApi(fetcher);

    await expect(api.getPuzzle()).resolves.toEqual({ ok: true, data: puzzle });
    expect(fetcher).toHaveBeenCalledWith('/api/puzzle', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it('does not use the client clock to change the server splash state', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(
      Date.parse('2030-01-01T00:00:00.000Z')
    );

    await expect(
      createApi(fetcherFor(json({ ...puzzle, splashState: 'open' }))).getPuzzle()
    ).resolves.toEqual({
      ok: true,
      data: { ...puzzle, splashState: 'open' },
    });

    clock.mockRestore();
  });

  it('accepts a closed payload with a null or real date key', async () => {
    const closed = {
      status: 'closed',
      splashState: 'closed',
      dateKey: null,
      alreadyGuessed: true,
      streak: { current: 0, best: 4 },
    };

    await expect(
      createApi(fetcherFor(json(closed))).getPuzzle()
    ).resolves.toEqual({ ok: true, data: closed });
  });

  it.each([
    ['missing stations', { ...puzzle, stations: undefined }],
    ['an unknown station id', { ...puzzle, stations: [{ ...puzzle.stations[0], id: 'Z' }] }],
    ['a non-finite delay', { ...puzzle, stations: [{ ...puzzle.stations[0], delayS: Number.NaN }] }],
    ['a point outside the map', { ...puzzle, stations: [{ ...puzzle.stations[0], x: 1001 }] }],
    ['an impossible date', { ...puzzle, dateKey: '2026-02-30' }],
    ['a non-boolean guess flag', { ...puzzle, alreadyGuessed: 'no' }],
    ['a fractional streak', { ...puzzle, streak: { current: 1.5, best: 2 } }],
    ['a single fault point', { ...puzzle, fault: [{ x: 1, y: 1 }] }],
    ['a missing map size', { ...puzzle, mapSizeKm: undefined }],
  ])('rejects %s', async (_name, payload) => {
    const result = await createApi(fetcherFor(json(payload))).getPuzzle();

    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('accepts a null fault line', async () => {
    const payload = { ...puzzle, fault: null };

    await expect(
      createApi(fetcherFor(json(payload))).getPuzzle()
    ).resolves.toEqual({ ok: true, data: payload });
  });
});

describe('POST /api/guess', () => {
  it('sends only x and y as strict JSON', async () => {
    const fetcher = fetcherFor(json(guess));

    await createApi(fetcher).postGuess({ x: 12.3, y: 45.6 });

    expect(fetcher).toHaveBeenCalledWith('/api/guess', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{"x":12.3,"y":45.6}',
    });
  });

  it('validates the guess response', async () => {
    await expect(
      createApi(fetcherFor(json(guess))).postGuess({ x: 1, y: 2 })
    ).resolves.toEqual({ ok: true, data: guess });
  });

  it.each([
    ['a missing score', { ...guess, score: undefined }],
    ['a fractional score', { ...guess, score: 1.5 }],
    ['too many stars', { ...guess, stars: 4 }],
    ['a negative error', { ...guess, errorKm: -1 }],
    ['truth outside the map', { ...guess, truth: { x: 2000, y: 1 } }],
    ['a string error', { ...guess, errorKm: '3' }],
  ])('rejects %s', async (_name, payload) => {
    const result = await createApi(fetcherFor(json(payload))).postGuess({
      x: 1,
      y: 2,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
  });
});

describe('GET /api/results', () => {
  it('accepts a full results payload', async () => {
    await expect(
      createApi(fetcherFor(json(results))).getResults()
    ).resolves.toEqual({ ok: true, data: results });
  });

  it.each([
    ['percentile over 100', { ...results, percentile: 101 }],
    ['a negative player count', { ...results, playerCount: -1 }],
    ['zero-count cloud cells', { ...results, cloud: [{ cx: 1, cy: 1, n: 0 }] }],
    ['cloud cells outside the grid', { ...results, cloud: [{ cx: 50, cy: 1, n: 1 }] }],
    ['a missing you block', { ...results, you: undefined }],
    ['a fractional cloud count', { ...results, cloud: [{ cx: 1, cy: 1, n: 1.5 }] }],
    ['a missing fault', { ...results, fault: undefined }],
    ['a bad solver fit', { ...results, solverFit: { x: 1, y: 2 } }],
  ])('rejects %s', async (_name, payload) => {
    const result = await createApi(fetcherFor(json(payload))).getResults();

    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('accepts a null percentile and median below the minimum', async () => {
    const payload = { ...results, percentile: null, crowdMedian: null };

    await expect(
      createApi(fetcherFor(json(payload))).getResults()
    ).resolves.toEqual({ ok: true, data: payload });
  });

  it('rejects a null fault line after a guess', async () => {
    const payload = { ...results, fault: null };

    await expect(
      createApi(fetcherFor(json(payload))).getResults()
    ).resolves.toEqual({ ok: false, error: { kind: 'invalid' } });
  });
});

describe('failures', () => {
  it('maps a 429 with Retry-After', async () => {
    const response = json({ error: 'rate_limited' }, 429, {
      'Retry-After': '30',
    });
    const result = await createApi(fetcherFor(response)).getPuzzle();

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'http',
        status: 429,
        code: 'rate_limited',
        retryAfterS: 30,
      },
    });
  });

  it('keeps a non-numeric Retry-After as null', async () => {
    const response = json({ error: 'rate_limited' }, 429, {
      'Retry-After': 'soon',
    });
    const result = await createApi(fetcherFor(response)).getResults();

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'http') {
      expect(result.error.retryAfterS).toBeNull();
    }
  });

  it('falls back to an unknown code when the error body is not JSON', async () => {
    const response = new Response('<html>oops</html>', { status: 503 });
    const result = await createApi(fetcherFor(response)).getPuzzle();

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'http',
        status: 503,
        code: 'unknown',
        retryAfterS: null,
      },
    });
  });

  it('maps a network rejection', async () => {
    const fetcher: FetchLike = vi.fn(async () => {
      throw new TypeError('offline');
    });

    await expect(createApi(fetcher).getPuzzle()).resolves.toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('maps a success body that is not JSON', async () => {
    const response = new Response('not json', { status: 200 });

    await expect(createApi(fetcherFor(response)).getPuzzle()).resolves.toEqual(
      { ok: false, error: { kind: 'invalid' } }
    );
  });

  it('maps a JSON null body', async () => {
    await expect(
      createApi(fetcherFor(json(null))).getPuzzle()
    ).resolves.toEqual({ ok: false, error: { kind: 'invalid' } });
  });
});
