/**
 * @file        tests/security/apiAbuse.test.ts
 * @purpose     Proves the full /api abuse matrix: identity, body limits, schema, methods, rate limits, concurrency and closed states.
 * @covers      src/server/routes/api.ts, src/server/routes/body.ts, src/server/app.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md sections 5 and 5b; 04-security.md S1-S8
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { distanceKm } from '../../src/shared/geometry';
import type { PrivatePuzzle } from '../../src/shared/types';
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

async function expectError(
  response: Response,
  status: number,
  code: string
): Promise<void> {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('cross-origin-resource-policy')).toBe(
    'same-origin'
  );
}

async function openPuzzle(): Promise<void> {
  await app.deps.store.set('post:t3_testpost', TODAY);
  const response = await fetch(url('/api/puzzle'));
  expect(response.status).toBe(200);
}

describe('identity', () => {
  it('returns 401 for every endpoint when identity is missing and touches no store key', async () => {
    app.deps.identity.set(null);

    await expectError(await fetch(url('/api/puzzle')), 401, 'unauthorized');
    await expectError(
      await postJson('/api/guess', '{"x":500,"y":250}'),
      401,
      'unauthorized'
    );
    await expectError(await fetch(url('/api/results')), 401, 'unauthorized');

    expect(app.deps.store.opCount).toBe(0);
  });

  it('rejects a malformed server identity with 401 before any store op', async () => {
    const hostile = [
      '',
      'a:b',
      'a b',
      'x'.repeat(65),
      'line\nbreak',
      'dotted.id',
      'unicode-é',
    ];

    for (const userId of hostile) {
      app.deps.identity.set({ userId, postId: 't3_testpost' });
      await expectError(await fetch(url('/api/puzzle')), 401, 'unauthorized');
    }

    expect(app.deps.store.opCount).toBe(0);
  });

  it('accepts __proto__ and constructor as ordinary user ids without pollution', async () => {
    for (const userId of ['__proto__', 'constructor']) {
      app.deps.identity.set({ userId, postId: 't3_testpost' });
      const response = await fetch(url('/api/puzzle'));
      expect(response.status).toBe(200);
    }

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('ignores user and post ids supplied in the query, headers and body', async () => {
    app.deps.identity.set(null);

    const headers = {
      'content-type': 'application/json',
      'x-user-id': 't2_spoofed',
      'x-post-id': 't3_spoofed',
    };
    const spoofedGet = await fetch(
      url('/api/puzzle?userId=t2_spoofed&postId=t3_spoofed'),
      { headers }
    );
    await expectError(spoofedGet, 401, 'unauthorized');

    const spoofedGuess = await fetch(
      url('/api/guess?userId=t2_spoofed&postId=t3_spoofed'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          x: 500,
          y: 250,
          userId: 't2_spoofed',
          postId: 't3_spoofed',
        }),
      }
    );
    await expectError(spoofedGuess, 401, 'unauthorized');

    expect(app.deps.store.opCount).toBe(0);
  });

  it('treats a malformed post id as no mapping without building a post key', async () => {
    app.deps.identity.set({ userId: 't2_test1', postId: 'a:b' });

    const puzzle = await fetch(url('/api/puzzle'));
    expect(puzzle.status).toBe(200);
    expect(await puzzle.json()).toEqual({
      status: 'closed',
      splashState: 'closed',
      dateKey: null,
      alreadyGuessed: false,
      streak: { current: 0, best: 0 },
    });

    await expectError(
      await fetch(url('/api/results')),
      410,
      'puzzle_closed'
    );
    expect(app.deps.store.opLog.some((op) => op.key.startsWith('post:'))).toBe(
      false
    );
  });
});

describe('POST /api/guess body matrix', () => {
  it('rejects every hostile body with 400 and stores no guess', async () => {
    await openPuzzle();

    const bodies = [
      '',
      'null',
      '[]',
      '"x"',
      '123',
      'true',
      '{',
      '{"x":500,"y":250',
      '{"x":500,"y":250} trailing',
      '{"x":500}',
      '{"y":250}',
      '{"x":500,"y":250,"z":1}',
      '{"x":500,"y":250,"userId":"t2_test1"}',
      '{"x":"500","y":250}',
      '{"x":null,"y":250}',
      '{"x":true,"y":250}',
      '{"x":[500],"y":250}',
      '{"x":{"value":500},"y":250}',
      '{"x":{},"y":250}',
      '{"x":NaN,"y":250}',
      '{"x":Infinity,"y":250}',
      '{"x":1e309,"y":250}',
      '{"x":-1e309,"y":250}',
      '{"x":-1,"y":250}',
      '{"x":1001,"y":250}',
      '{"x":500,"y":-1}',
      '{"x":500,"y":1001}',
      '{"x":500,"y":250,"__proto__":{"polluted":true}}',
      '{"x":500,"y":250,"constructor":1}',
      '{"__proto__":{"x":500,"y":250}}',
    ];

    for (const body of bodies) {
      const response = await postJson('/api/guess', body);
      expect(response.status, body).toBe(400);
      expect(await response.json(), body).toEqual({ error: 'bad_request' });
      app.deps.clock.advance(60_000);
    }

    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('quantizes accepted coordinates and normalizes -0', async () => {
    await openPuzzle();

    const response = await postJson(
      '/api/guess',
      '{"x":-0,"y":250.04}'
    );

    expect(response.status).toBe(200);
    const stored = JSON.parse(
      (await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')) ?? '{}'
    ) as Record<string, number>;
    expect(Object.is(stored.x, -0)).toBe(false);
    expect(stored.x).toBe(0);
    expect(stored.y).toBe(250);
  });

  it('returns 415 for non-JSON and unsupported charsets', async () => {
    await openPuzzle();

    const cases: Array<[string, string]> = [
      ['text/plain', '{"x":500,"y":250}'],
      ['application/x-www-form-urlencoded', 'x=500&y=250'],
      ['application/json; charset=iso-8859-1', '{"x":500,"y":250}'],
      ['application/jsonp', '{"x":500,"y":250}'],
    ];

    for (const [contentType, body] of cases) {
      await expectError(
        await postJson('/api/guess', body, contentType),
        415,
        'unsupported_media_type'
      );
    }

    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });

  it('returns 413 before parsing an oversized body', async () => {
    await openPuzzle();

    const response = await postJson(
      '/api/guess',
      JSON.stringify({ x: 500, y: 250, padding: 'x'.repeat(2000) })
    );

    await expectError(response, 413, 'payload_too_large');
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });

  it('returns 413 for an oversized chunked body without content-length', async () => {
    await openPuzzle();

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"x":500,"y":250,"padding":"'));
        controller.enqueue(encoder.encode('x'.repeat(2000)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });

    const response = await fetch(url('/api/guess'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    await expectError(response, 413, 'payload_too_large');
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });

  it('checks size and content type before identity', async () => {
    app.deps.identity.set(null);

    await expectError(
      await postJson(
        '/api/guess',
        JSON.stringify({ x: 500, y: 250, padding: 'x'.repeat(2000) })
      ),
      413,
      'payload_too_large'
    );
    await expectError(
      await postJson('/api/guess', 'x=500', 'text/plain'),
      415,
      'unsupported_media_type'
    );
  });
});

describe('POST /api/guess state rules', () => {
  it('rejects a repeated guess with 409 and changes no state', async () => {
    await openPuzzle();
    expect((await postJson('/api/guess', '{"x":500,"y":500}')).status).toBe(
      200
    );

    const guessBefore = await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1');
    const cloudBefore = await app.deps.store.hGetAll(`cloud:${TODAY}`);

    const repeat = await postJson('/api/guess', '{"x":1,"y":1}');

    await expectError(repeat, 409, 'already_guessed');
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBe(
      guessBefore
    );
    expect(await app.deps.store.hGetAll(`cloud:${TODAY}`)).toEqual(cloudBefore);
  });

  it('accepts exactly one of twenty concurrent identical guesses across four rate-limit windows', async () => {
    await openPuzzle();

    const statuses: number[] = [];
    for (let wave = 0; wave < 4; wave += 1) {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          postJson('/api/guess', '{"x":500,"y":500}')
        )
      );
      statuses.push(...responses.map((response) => response.status));
      app.deps.clock.advance(60_000);
    }

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(19);
  });

  it('returns 429 with Retry-After on the sixth guess in a minute', async () => {
    await openPuzzle();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await postJson(
        '/api/guess',
        JSON.stringify({ x: 100 + attempt, y: 100 })
      );
      expect([200, 409]).toContain(response.status);
    }

    const limited = await postJson('/api/guess', '{"x":1,"y":1}');

    await expectError(limited, 429, 'rate_limited');
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it('returns 410 after the UTC day closes', async () => {
    await openPuzzle();
    app.deps.clock.advance(24 * 3600 * 1000);

    await expectError(
      await postJson('/api/guess', '{"x":500,"y":500}'),
      410,
      'puzzle_closed'
    );
    expect(await app.deps.store.hGet(`gs:${TODAY}`, 't2_test1')).toBeNull();
  });
});

describe('GET /api/puzzle', () => {
  it('returns the closed payload for a missing mapping and never leaks the map', async () => {
    const response = await fetch(url('/api/puzzle'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'closed',
      splashState: 'closed',
      dateKey: null,
      alreadyGuessed: false,
      streak: { current: 0, best: 0 },
    });
  });

  it('returns a closed payload with the mapped past date after midnight', async () => {
    await openPuzzle();
    app.deps.clock.advance(24 * 3600 * 1000);

    const response = await fetch(url('/api/puzzle'));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'closed',
      splashState: 'closed',
      dateKey: TODAY,
      alreadyGuessed: false,
      streak: { current: 0, best: 0 },
    });
  });

  it('never exposes truth, seed or solver fit in the open payload', async () => {
    await openPuzzle();

    const response = await fetch(url('/api/puzzle'));
    const body = (await response.json()) as unknown;
    const raw = app.deps.store.hashes.get(`puz:${TODAY}`)?.get('data');
    if (!raw) {
      throw new Error('expected a stored puzzle');
    }
    const truth = (JSON.parse(raw) as PrivatePuzzle).truth;

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
        expect(
          distanceKm({ x: record.x, y: record.y }, truth)
        ).toBeGreaterThan(0.11);
      }
    };

    visit(body);
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(
      /truth|seed|solverfit/
    );
  });
});

describe('GET /api/results', () => {
  it('returns 403 before a guess and exposes nothing', async () => {
    await openPuzzle();

    await expectError(
      await fetch(url('/api/results')),
      403,
      'forbidden'
    );
  });

  it('returns 410 after the day data expired even when a guess remains', async () => {
    await openPuzzle();
    expect((await postJson('/api/guess', '{"x":500,"y":500}')).status).toBe(
      200
    );
    await app.deps.store.del(`puz:${TODAY}`);

    await expectError(
      await fetch(url('/api/results')),
      410,
      'puzzle_closed'
    );
  });

  it('returns no user ids, names or timestamps after a guess', async () => {
    await openPuzzle();
    expect((await postJson('/api/guess', '{"x":500,"y":500}')).status).toBe(
      200
    );

    const response = await fetch(url('/api/results'));
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());

    expect(text).not.toContain('t2_test1');
    expect(text).not.toContain('userId');
    expect(text).not.toContain('postId');
    expect(text).not.toContain('createdAt');
  });
});

describe('routing', () => {
  it('returns 405 for every wrong method on every known /api path', async () => {
    for (const path of ['/api/puzzle', '/api/guess', '/api/results']) {
      for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        await expectError(
          await fetch(url(path), { method }),
          405,
          'method_not_allowed'
        );
      }
      const head = await fetch(url(path), { method: 'HEAD' });
      expect(head.status).toBe(405);
      expect(head.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('returns the generic 404 for unknown /api routes', async () => {
    for (const path of [
      '/api',
      '/api/',
      '/api/nope',
      '/api/puzzle/extra',
      '/api/guess/extra',
      '/api/results/extra',
    ]) {
      await expectError(await fetch(url(path)), 404, 'not_found');
    }
  });
});
