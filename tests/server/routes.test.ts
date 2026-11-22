/**
 * @file        tests/server/routes.test.ts
 * @purpose     Proves the route wiring, happy paths, status matrix, headers, rate limits and lazy-creation op budget.
 * @covers      src/server/routes/api.ts, src/server/routes/internal.ts, src/server/routes/body.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md sections 5 and 5b
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestApp } from '../fakes/appHarness';
import { startTestApp } from '../fakes/appHarness';
import { makeDeps, TODAY } from '../fakes/deps';

let app: TestApp;

beforeEach(async () => {
  app = await startTestApp(makeDeps());
});

afterEach(async () => {
  await app.close();
});

function url(path: string): string {
  return `${app.baseUrl}${path}`;
}

function postJson(
  path: string,
  body: string,
  contentType = 'application/json'
): Promise<Response> {
  return fetch(url(path), {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('GET /api/puzzle', () => {
  it('returns the closed payload with a null dateKey when the post mapping is missing', async () => {
    const response = await fetch(url('/api/puzzle'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-resource-policy')).toBe(
      'same-origin'
    );
    expect(await response.json()).toEqual({
      status: 'closed',
      splashState: 'closed',
      dateKey: null,
      alreadyGuessed: false,
      streak: { current: 0, best: 0 },
    });
  });

  it('returns the open payload for today and creates it lazily within 20 ops', async () => {
    await app.deps.store.set('post:t3_testpost', TODAY);
    const before = app.deps.store.opCount;

    const response = await fetch(url('/api/puzzle'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('open');
    expect(body.dateKey).toBe(TODAY);
    expect(Array.isArray(body.stations)).toBe(true);
    expect(body.alreadyGuessed).toBe(false);
    expect(app.deps.store.opCount - before).toBeLessThanOrEqual(20);
    expect(app.deps.store.hasKey(`puz:${TODAY}`)).toBe(true);
  });

  it('serves a cached puzzle in at most eight ops', async () => {
    await app.deps.store.set('post:t3_testpost', TODAY);
    await fetch(url('/api/puzzle'));
    const before = app.deps.store.opCount;

    const response = await fetch(url('/api/puzzle'));

    expect(response.status).toBe(200);
    expect(app.deps.store.opCount - before).toBeLessThanOrEqual(8);
  });

  it('returns 401 without identity', async () => {
    app.deps.identity.set(null);

    const response = await fetch(url('/api/puzzle'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('ignores spoofed user ids in the query and headers', async () => {
    app.deps.identity.set(null);

    const response = await fetch(
      url('/api/puzzle?userId=t2_spoofed'),
      { headers: { 'x-user-id': 't2_spoofed' } }
    );

    expect(response.status).toBe(401);
  });

  it('returns 429 with Retry-After on the thirty-first read in a minute', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(url('/api/puzzle'));
      expect(response.status).toBe(200);
    }

    const response = await fetch(url('/api/puzzle'));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(await response.json()).toEqual({ error: 'rate_limited' });
  });

  it('returns 405 for a wrong method with no identity', async () => {
    app.deps.identity.set(null);

    const response = await fetch(url('/api/puzzle'), { method: 'POST' });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'method_not_allowed' });
  });

  it('returns 405 for HEAD', async () => {
    const response = await fetch(url('/api/puzzle'), { method: 'HEAD' });

    expect(response.status).toBe(405);
  });
});

describe('POST /api/guess', () => {
  beforeEach(async () => {
    await app.deps.store.set('post:t3_testpost', TODAY);
    await fetch(url('/api/puzzle'));
  });

  it('accepts one guess and rejects the second', async () => {
    const response = await postJson('/api/guess', JSON.stringify({ x: 500, y: 500 }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['errorKm', 'score', 'stars', 'streak', 'truth'].sort()
    );
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).not.toBeNull();

    const repeat = await postJson(
      '/api/guess',
      JSON.stringify({ x: 400, y: 400 })
    );
    expect(repeat.status).toBe(409);
    expect(await repeat.json()).toEqual({ error: 'already_guessed' });
  });

  it('returns 401 without identity and changes no state', async () => {
    app.deps.identity.set(null);

    const response = await postJson('/api/guess', JSON.stringify({ x: 500, y: 500 }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });

  it('returns 410 when the post resolves to a past date', async () => {
    await app.deps.store.set('post:t3_testpost', '2026-11-16');

    const response = await postJson('/api/guess', JSON.stringify({ x: 500, y: 500 }));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'puzzle_closed' });
  });

  it('returns 400 for invalid JSON, empty bodies and every hostile shape', async () => {
    const bodies = [
      '{',
      '',
      'null',
      '[]',
      '"x"',
      '{"x":500}',
      '{"x":500,"y":250,"z":1}',
      '{"x":"500","y":250}',
      '{"x":1e309,"y":250}',
      '{"x":500,"y":-1}',
      '{"x":500,"y":1001}',
      '{"x":{"value":500},"y":250}',
      '{"x":[500],"y":250}',
      '{"x":500,"y":250,"__proto__":{"polluted":true}}',
      '{"x":500,"y":250,"constructor":1}',
    ];

    for (const body of bodies) {
      const response = await postJson('/api/guess', body);
      expect(response.status, body).toBe(400);
      expect(await response.json()).toEqual({ error: 'bad_request' });
      app.deps.clock.advance(60_000);
    }

    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });

  it('normalizes -0 and stores zero', async () => {
    const response = await postJson(
      '/api/guess',
      '{"x":-0,"y":250}'
    );

    expect(response.status).toBe(200);
    const stored = JSON.parse(
      (await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')) ?? '{}'
    ) as Record<string, number>;
    expect(stored.x).toBe(0);
    expect(Object.is(stored.x, -0)).toBe(false);
  });

  it('returns 415 for a body with a non-JSON content type', async () => {
    const response = await postJson('/api/guess', 'x=1', 'text/plain');

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: 'unsupported_media_type',
    });
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });

  it('returns 413 for a body over 1 KB', async () => {
    const response = await postJson(
      '/api/guess',
      JSON.stringify({ x: 500, y: 500, padding: 'x'.repeat(2000) })
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload_too_large' });
  });

  it('returns 405 for GET and 404 for an unknown route', async () => {
    const wrongMethod = await fetch(url('/api/guess'));
    expect(wrongMethod.status).toBe(405);
    expect(await wrongMethod.json()).toEqual({ error: 'method_not_allowed' });

    const unknown = await fetch(url('/api/nope'));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not_found' });
  });

  it('counts a guess in at most ten business ops, one routing lookup and two rate-limit ops', async () => {
    const logStart = app.deps.store.opLog.length;

    const response = await postJson('/api/guess', JSON.stringify({ x: 500, y: 500 }));

    expect(response.status).toBe(200);
    const ops = app.deps.store.opLog.slice(logStart);
    const rateOps = ops.filter((op) => op.key.startsWith('rl:'));
    const routingOps = ops.filter((op) => op.key.startsWith('post:'));
    expect(rateOps.length).toBeLessThanOrEqual(2);
    expect(routingOps).toHaveLength(1);
    expect(ops.length - rateOps.length - routingOps.length).toBeLessThanOrEqual(
      10
    );
  });
});

describe('GET /api/results', () => {
  beforeEach(async () => {
    await app.deps.store.set('post:t3_testpost', TODAY);
  });

  it('returns 403 before a guess', async () => {
    await fetch(url('/api/puzzle'));

    const response = await fetch(url('/api/results'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });

  it('returns 401 without identity', async () => {
    app.deps.identity.set(null);

    const response = await fetch(url('/api/results'));

    expect(response.status).toBe(401);
  });

  it('returns the result payload after a guess', async () => {
    await fetch(url('/api/puzzle'));
    await postJson('/api/guess', JSON.stringify({ x: 500, y: 500 }));

    const response = await fetch(url('/api/results'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
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
    expect(body.playerCount).toBe(1);
    expect(JSON.stringify(body)).not.toContain('t2_test1');
  });

  it('returns 410 when there is no post id', async () => {
    app.deps.identity.set({ userId: 't2_test1' });

    const response = await fetch(url('/api/results'));

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'puzzle_closed' });
  });

  it('returns 405 for POST', async () => {
    const response = await fetch(url('/api/results'), { method: 'POST' });

    expect(response.status).toBe(405);
  });
});

describe('internal routes', () => {
  it('creates the daily post from the scheduler', async () => {
    const response = await postJson('/internal/scheduler/daily-puzzle', '{}');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: 'created',
      dateKey: TODAY,
      postId: 't3_testpost',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('works without any identity', async () => {
    app.deps.identity.set(null);

    const response = await postJson('/internal/menu/create-post', '');

    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).status).toBe(
      'created'
    );
  });

  it('returns 405 for a GET on a known internal path', async () => {
    const response = await fetch(url('/internal/scheduler/daily-puzzle'));

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'method_not_allowed' });
  });
});
