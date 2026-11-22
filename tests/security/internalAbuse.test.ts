/**
 * @file        tests/security/internalAbuse.test.ts
 * @purpose     Proves the /internal abuse list: no identity, body limits, methods, idempotency, concurrency and 503 mapping.
 * @covers      src/server/routes/internal.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md section 5; 04-security.md S15, S18
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

async function expectError(
  response: Response,
  status: number,
  code: string
): Promise<void> {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
}

const SCHEDULER = '/internal/scheduler/daily-puzzle';
const MENU = '/internal/menu/create-post';

describe('no client identity', () => {
  it('creates the daily post without identity and a minimal JSON body', async () => {
    app.deps.identity.set(null);

    const response = await postJson(SCHEDULER, '{}');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: 'created',
      dateKey: TODAY,
      postId: 't3_testpost',
    });
  });

  it('creates from the menu without identity and an absent body', async () => {
    app.deps.identity.set(null);

    const response = await postJson(MENU, '');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: 'created',
      dateKey: TODAY,
      postId: 't3_testpost',
    });
  });

  it('never answers 401 even when the identity port is empty', async () => {
    app.deps.identity.set({ userId: '', postId: '' });

    const scheduler = await postJson(SCHEDULER, '{}');
    const menu = await postJson(MENU, '{}');

    expect(scheduler.status).toBe(200);
    expect(menu.status).toBe(200);
  });
});

describe('payload validation', () => {
  it('returns 400 for invalid JSON and hostile shapes without state change', async () => {
    const bodies = ['{', '[]', '"x"', '123', 'true', 'null'];

    for (const body of bodies) {
      await expectError(
        await postJson(SCHEDULER, body),
        400,
        'bad_request'
      );
      await expectError(await postJson(MENU, body), 400, 'bad_request');
    }

    expect(app.deps.store.opCount).toBe(0);
    expect(app.deps.publisher.publishCount).toBe(0);
  });

  it('returns 415 for a non-JSON body and changes no state', async () => {
    await expectError(
      await postJson(SCHEDULER, 'x=1', 'text/plain'),
      415,
      'unsupported_media_type'
    );
    await expectError(
      await postJson(MENU, 'x=1', 'application/x-www-form-urlencoded'),
      415,
      'unsupported_media_type'
    );
    expect(app.deps.store.opCount).toBe(0);
  });

  it('returns 413 for an oversized body before parsing', async () => {
    await expectError(
      await postJson(
        SCHEDULER,
        JSON.stringify({ padding: 'x'.repeat(2000) })
      ),
      413,
      'payload_too_large'
    );
    expect(app.deps.store.opCount).toBe(0);
  });

  it('ignores unknown but well-formed object fields', async () => {
    const response = await postJson(
      SCHEDULER,
      JSON.stringify({ event: 'tick', extra: true })
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).status).toBe(
      'created'
    );
  });

  it('ignores __proto__ keys without pollution', async () => {
    const response = await postJson(
      SCHEDULER,
      '{"__proto__":{"polluted":true},"constructor":1}'
    );

    expect(response.status).toBe(200);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('methods and routes', () => {
  it('returns 405 for every wrong method on both internal paths', async () => {
    for (const path of [SCHEDULER, MENU]) {
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        await expectError(
          await fetch(url(path), { method }),
          405,
          'method_not_allowed'
        );
      }
      const head = await fetch(url(path), { method: 'HEAD' });
      expect(head.status).toBe(405);
    }
  });

  it('returns the generic 404 for unknown internal routes', async () => {
    for (const path of ['/internal', '/internal/', '/internal/nope']) {
      await expectError(await fetch(url(path)), 404, 'not_found');
    }
  });
});

describe('idempotency', () => {
  it('reports in_progress on a scheduler rerun and publishes once', async () => {
    const first = await postJson(SCHEDULER, '{}');
    const second = await postJson(SCHEDULER, '{}');

    expect(first.status).toBe(200);
    expect(((await first.json()) as Record<string, unknown>).status).toBe(
      'created'
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      ok: true,
      status: 'in_progress',
      dateKey: TODAY,
    });
    expect(app.deps.publisher.publishCount).toBe(1);
  });

  it('reports exists on a menu rerun and repairs the post mapping', async () => {
    const first = await postJson(MENU, '{}');
    expect(((await first.json()) as Record<string, unknown>).status).toBe(
      'created'
    );
    await app.deps.store.del('post:t3_testpost');

    const second = await postJson(MENU, '{}');

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      ok: true,
      status: 'exists',
      dateKey: TODAY,
      postId: 't3_testpost',
    });
    expect(app.deps.publisher.publishCount).toBe(1);
    expect(await app.deps.store.get('post:t3_testpost')).toBe(TODAY);
  });

  it('lets exactly one of five concurrent scheduler calls publish', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postJson(SCHEDULER, '{}'))
    );
    const bodies = (await Promise.all(
      responses.map((response) => response.json())
    )) as Array<Record<string, unknown>>;

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(bodies.filter((body) => body.status === 'created')).toHaveLength(1);
    expect(bodies.filter((body) => body.status === 'in_progress')).toHaveLength(
      4
    );
    expect(app.deps.publisher.publishCount).toBe(1);
  });

  it('maps a publishing failure to 503, releases the claim and stores nothing', async () => {
    app.deps.publisher.publishDailyPost = async () => {
      throw new Error('reddit down');
    };

    const response = await postJson(SCHEDULER, '{}');

    await expectError(response, 503, 'unavailable');
    expect(app.deps.store.hasKey(`dpost:${TODAY}`)).toBe(false);
    expect(await app.deps.store.get('post:t3_testpost')).toBeNull();
  });
});
