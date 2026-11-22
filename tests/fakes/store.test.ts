/**
 * @file        tests/fakes/store.test.ts
 * @purpose     Proves the fake Store matches the Redis semantics the services rely on.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2
 */
import { describe, expect, it } from 'vitest';
import { FakeStore } from './store';

describe('FakeStore', () => {
  it('implements hSetNX as create-only', async () => {
    const store = new FakeStore();

    await expect(store.hSetNX('h', 'f', '1')).resolves.toBe(true);
    await expect(store.hSetNX('h', 'f', '2')).resolves.toBe(false);
    await expect(store.hGet('h', 'f')).resolves.toBe('1');
  });

  it('returns empty reads for missing keys', async () => {
    const store = new FakeStore();

    await expect(store.hGet('missing', 'f')).resolves.toBeNull();
    await expect(store.hGetAll('missing')).resolves.toEqual({});
    await expect(store.get('missing')).resolves.toBeNull();
  });

  it('increments fields and counters from zero', async () => {
    const store = new FakeStore();

    await expect(store.hIncrBy('h', 'bin', 2)).resolves.toBe(2);
    await expect(store.hIncrBy('h', 'bin', 3)).resolves.toBe(5);
    await expect(store.incrBy('counter', 1)).resolves.toBe(1);
    await expect(store.incrBy('counter', 42)).resolves.toBe(43);
  });

  it('expires an existing key and does nothing for a missing key', async () => {
    const store = new FakeStore();

    await store.expire('missing', 60);
    expect(store.expirations.has('missing')).toBe(false);

    await store.hSet('present', 'f', '1');
    await store.expire('present', 60);
    expect(store.expirations.get('present')).toBe(60);
  });

  it('counts operations and throws on demand', async () => {
    const store = new FakeStore();
    store.failCommand('hGet', 1);

    await expect(store.hGet('h', 'f')).rejects.toThrow('hGet failed');
    await expect(store.hGet('h', 'f')).resolves.toBeNull();
    expect(store.opCount).toBe(2);
  });

  it('supports a persistent failure mode', async () => {
    const store = new FakeStore();
    store.failCommand('hSet', Number.POSITIVE_INFINITY);

    await expect(store.hSet('h', 'f', '1')).rejects.toThrow();
    await expect(store.hSet('h', 'f', '1')).rejects.toThrow();
  });

  it('can fail one key without failing the same command elsewhere', async () => {
    const store = new FakeStore();
    store.failKey('h1', 1);

    await expect(store.hGet('h1', 'f')).rejects.toThrow('h1');
    await expect(store.hGet('h2', 'f')).resolves.toBeNull();
  });
});
