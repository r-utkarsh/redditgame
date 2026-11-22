/**
 * @file        tests/server/adapters.test.ts
 * @purpose     Proves the Devvit adapters map the real client shapes onto the ports without leaking ids or inventing behaviour.
 * @covers      src/server/adapters/devvitStore.ts, src/server/adapters/devvitIdentity.ts, src/server/adapters/devvitPostPublisher.ts, src/server/adapters/systemClock.ts, src/server/adapters/entropy.ts, src/server/adapters/devvitTracker.ts
 * @spec        02-architecture-and-headers.md section 3; 04-security.md S4, S10, S15, S18, S19; P3-devvit-wiring.md step 5
 */
import { describe, expect, it, vi } from 'vitest';
import { createEntropy } from '../../src/server/adapters/entropy';
import { createDevvitIdentity } from '../../src/server/adapters/devvitIdentity';
import { createDevvitPostPublisher } from '../../src/server/adapters/devvitPostPublisher';
import { createDevvitStore } from '../../src/server/adapters/devvitStore';
import { createDevvitTracker } from '../../src/server/adapters/devvitTracker';
import { createSystemClock } from '../../src/server/adapters/systemClock';

function redisStub() {
  return {
    hSetNX: vi.fn(async () => 1),
    hGet: vi.fn(async () => undefined as string | undefined),
    hGetAll: vi.fn(async () => ({ a: '1', b: '2' })),
    hSet: vi.fn(async () => 1),
    hIncrBy: vi.fn(async () => 7),
    incrBy: vi.fn(async () => 3),
    set: vi.fn(async () => 'OK'),
    get: vi.fn(async () => undefined as string | undefined),
    del: vi.fn(async () => undefined),
    expire: vi.fn(async () => undefined),
  };
}

describe('createDevvitStore', () => {
  it('maps hSetNX 1 to true and 0 to false', async () => {
    const client = redisStub();
    const store = createDevvitStore(client);

    await expect(store.hSetNX('k', 'f', 'v')).resolves.toBe(true);
    expect(client.hSetNX).toHaveBeenCalledWith('k', 'f', 'v');

    client.hSetNX.mockResolvedValueOnce(0);
    await expect(store.hSetNX('k', 'f', 'v')).resolves.toBe(false);
  });

  it('maps an undefined hGet and get to null', async () => {
    const client = redisStub();
    const store = createDevvitStore(client);

    await expect(store.hGet('k', 'f')).resolves.toBeNull();
    await expect(store.get('k')).resolves.toBeNull();

    client.hGet.mockResolvedValueOnce('value');
    client.get.mockResolvedValueOnce('2026-11-18');
    await expect(store.hGet('k', 'f')).resolves.toBe('value');
    await expect(store.get('k')).resolves.toBe('2026-11-18');
  });

  it('passes hGetAll through as a plain record', async () => {
    const client = redisStub();
    const store = createDevvitStore(client);

    await expect(store.hGetAll('k')).resolves.toEqual({ a: '1', b: '2' });
    expect(client.hGetAll).toHaveBeenCalledWith('k');
  });

  it('writes one field as an object and drops the numeric return', async () => {
    const client = redisStub();
    const store = createDevvitStore(client);

    await expect(store.hSet('k', 'f', 'v')).resolves.toBeUndefined();
    expect(client.hSet).toHaveBeenCalledWith('k', { f: 'v' });
  });

  it('passes increments through', async () => {
    const client = redisStub();
    const store = createDevvitStore(client);

    await expect(store.hIncrBy('k', 'f', 2)).resolves.toBe(7);
    await expect(store.incrBy('k', 2)).resolves.toBe(3);
    expect(client.hIncrBy).toHaveBeenCalledWith('k', 'f', 2);
    expect(client.incrBy).toHaveBeenCalledWith('k', 2);
  });

  it('passes set, del and expire through', async () => {
    const client = redisStub();
    const store = createDevvitStore(client);

    await expect(store.set('k', 'v')).resolves.toBeUndefined();
    await expect(store.del('k')).resolves.toBeUndefined();
    await expect(store.expire('k', 60)).resolves.toBeUndefined();

    expect(client.set).toHaveBeenCalledWith('k', 'v');
    expect(client.del).toHaveBeenCalledWith('k');
    expect(client.expire).toHaveBeenCalledWith('k', 60);
  });
});

describe('createDevvitIdentity', () => {
  it('returns null when the context has no user id', async () => {
    const identity = createDevvitIdentity(() => ({ postId: 't3_post' }));

    await expect(identity.get()).resolves.toBeNull();
  });

  it('returns the context user id and omits a missing post id', async () => {
    const identity = createDevvitIdentity(() => ({ userId: 't2_user' }));

    await expect(identity.get()).resolves.toEqual({ userId: 't2_user' });
  });

  it('returns both ids when the context has them', async () => {
    const identity = createDevvitIdentity(() => ({
      userId: 't2_user',
      postId: 't3_post',
    }));

    await expect(identity.get()).resolves.toEqual({
      userId: 't2_user',
      postId: 't3_post',
    });
  });
});

describe('createDevvitPostPublisher', () => {
  it('submits a custom post as the app with the default entry and text fallback', async () => {
    const submitCustomPost = vi.fn(async () => ({ id: 't3_new' }));
    const publisher = createDevvitPostPublisher(
      { submitCustomPost },
      () => ({ subredditName: 'playtest' })
    );

    const result = await publisher.publishDailyPost({
      dateKey: '2026-11-18',
      title: 'Fault Lines - can you find today\'s epicenter?',
      body: 'The seismographs recorded today\'s quake.',
    });

    expect(result).toEqual({ postId: 't3_new' });
    expect(submitCustomPost).toHaveBeenCalledWith({
      subredditName: 'playtest',
      title: "Fault Lines - can you find today's epicenter?",
      entry: 'default',
      textFallback: { text: "The seismographs recorded today's quake." },
      runAs: 'APP',
    });
  });

  it('throws when the platform returns no post id', async () => {
    const publisher = createDevvitPostPublisher(
      { submitCustomPost: vi.fn(async () => ({ id: '' })) },
      () => ({ subredditName: 'playtest' })
    );

    await expect(
      publisher.publishDailyPost({
        dateKey: '2026-11-18',
        title: 'Fault Lines',
        body: 'Body',
      })
    ).rejects.toThrow('missing post id');
  });
});

describe('createSystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = createSystemClock().now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('createEntropy', () => {
  it('returns 32-bit unsigned integer seeds', () => {
    const entropy = createEntropy();

    for (let index = 0; index < 16; index += 1) {
      const seed = entropy.nextSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe('createDevvitTracker', () => {
  it('resolves without telemetry being available', async () => {
    const tracker = createDevvitTracker();

    await expect(
      tracker.track({ name: 'puzzle_viewed' })
    ).resolves.toBeUndefined();
  });
});
