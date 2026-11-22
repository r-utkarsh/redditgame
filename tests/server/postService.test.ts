/**
 * @file        tests/server/postService.test.ts
 * @purpose     Proves the dpost claim, created/exists/in_progress responses, idempotency and the menu repair path.
 * @covers      src/server/core/postService.ts
 * @spec        01-spec.md section 5; 04-security.md S18
 */
import { describe, expect, it } from 'vitest';
import { DAY_KEY_TTL_DAYS, DPOST_CLAIM_TTL_S } from '../../src/shared/constants';
import {
  createDailyPost,
  createPostFromMenu,
} from '../../src/server/core/postService';
import { makeDeps, TODAY, toDeps } from '../fakes/deps';

const DPOST_KEY = `dpost:${TODAY}`;

describe('createDailyPost', () => {
  it('creates one post and stores the mapping with TTLs', async () => {
    const deps = makeDeps();

    const result = await createDailyPost(toDeps(deps));

    expect(result).toEqual({
      ok: true,
      status: 'created',
      dateKey: TODAY,
      postId: 't3_testpost',
    });
    expect(deps.publisher.publishCount).toBe(1);
    expect(deps.publisher.calls[0]?.dateKey).toBe(TODAY);
    expect(await deps.store.get('post:t3_testpost')).toBe(TODAY);
    expect(await deps.store.hGet(DPOST_KEY, 'postId')).toBe('t3_testpost');
    expect(deps.store.expirations.get('post:t3_testpost')).toBe(
      DAY_KEY_TTL_DAYS * 86400
    );
    expect(deps.store.expirations.get(DPOST_KEY)).toBe(DAY_KEY_TTL_DAYS * 86400);
  });

  it('publishes the approved draft copy without spoilers or long dashes', async () => {
    const deps = makeDeps();

    await createDailyPost(toDeps(deps));

    const call = deps.publisher.calls[0];
    expect(call?.title).toBe("Fault Lines - can you find today's epicenter?");
    expect(call?.body).toBe(
      "The seismographs recorded today's quake. Read the S-P delays, place your pin, and lock in before midnight UTC; one guess per day."
    );
    expect(call?.body).not.toMatch(/[\u2013\u2014]/);
    expect(call?.body).not.toMatch(/latitude|longitude|seed|solver|answer/i);
  });

  it('reports in_progress while another run holds the claim', async () => {
    const deps = makeDeps();
    await deps.store.hSetNX(DPOST_KEY, 'claim', '1');

    const result = await createDailyPost(toDeps(deps));

    expect(result).toEqual({ ok: true, status: 'in_progress', dateKey: TODAY });
    expect(deps.publisher.publishCount).toBe(0);
  });

  it('reports exists without publishing when a postId is already stored', async () => {
    const deps = makeDeps();
    await deps.store.hSet(DPOST_KEY, 'postId', 't3_existing');
    await deps.store.hSet('post:t3_existing', 'unused', 'x');

    const result = await createDailyPost(toDeps(deps));

    expect(result).toEqual({
      ok: true,
      status: 'exists',
      dateKey: TODAY,
      postId: 't3_existing',
    });
    expect(deps.publisher.publishCount).toBe(0);
    expect(await deps.store.expirations.get(DPOST_KEY)).toBe(
      DPOST_CLAIM_TTL_S
    );
  });

  it('releases the claim and returns 503 when publishing fails', async () => {
    const deps = makeDeps();
    deps.publisher.publishDailyPost = async () => {
      throw new Error('reddit down');
    };

    await expect(createDailyPost(toDeps(deps))).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
    expect(deps.store.hasKey(DPOST_KEY)).toBe(false);
    expect(await deps.store.get('post:t3_testpost')).toBeNull();
  });

  it('lets exactly one of two concurrent runs create the post', async () => {
    const deps = makeDeps();

    const [left, right] = await Promise.all([
      createDailyPost(toDeps(deps)),
      createDailyPost(toDeps(deps)),
    ]);

    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual(['created', 'in_progress']);
    expect(deps.publisher.publishCount).toBe(1);
  });

  it('uses the current UTC day for the claim', async () => {
    const deps = makeDeps();
    deps.clock.advance(86400 * 1000);

    const result = await createDailyPost(toDeps(deps));

    expect(result.dateKey).toBe('2026-11-18');
    expect(deps.store.hasKey('dpost:2026-11-18')).toBe(true);
  });

  it('maps a failed claim write to 503', async () => {
    const deps = makeDeps();
    deps.store.failCommand('hSetNX', 1);

    await expect(createDailyPost(toDeps(deps))).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
    expect(deps.publisher.publishCount).toBe(0);
  });
});

describe('createPostFromMenu', () => {
  it('creates the post when none exists', async () => {
    const deps = makeDeps();

    const result = await createPostFromMenu(toDeps(deps));

    expect(result).toEqual({
      ok: true,
      status: 'created',
      dateKey: TODAY,
      postId: 't3_testpost',
    });
    expect(deps.publisher.publishCount).toBe(1);
  });

  it('returns exists and repairs a missing post mapping', async () => {
    const deps = makeDeps();
    await deps.store.hSet(DPOST_KEY, 'postId', 't3_existing');

    const result = await createPostFromMenu(toDeps(deps));

    expect(result).toEqual({
      ok: true,
      status: 'exists',
      dateKey: TODAY,
      postId: 't3_existing',
    });
    expect(deps.publisher.publishCount).toBe(0);
    expect(await deps.store.get('post:t3_existing')).toBe(TODAY);
    expect(deps.store.expirations.get('post:t3_existing')).toBe(
      DAY_KEY_TTL_DAYS * 86400
    );
  });

  it('returns 503 instead of in_progress when a claim is held', async () => {
    const deps = makeDeps();
    await deps.store.hSetNX(DPOST_KEY, 'claim', '1');

    await expect(createPostFromMenu(toDeps(deps))).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
    expect(deps.publisher.publishCount).toBe(0);
    expect(await deps.store.hGet(DPOST_KEY, 'claim')).toBe('1');
  });
});
