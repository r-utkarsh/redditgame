/**
 * @file        src/server/adapters/devvitStore.ts
 * @purpose     Implements the Store port with the Devvit Redis client and normalises its return values.
 * @layer       server adapters (the only place the Redis client is imported)
 * @keyFunctions
 *   - DevvitRedis
 *   - createDevvitStore(client?): Store
 * @invariants  no key is built here; every key arrives from redisKeys.ts; undefined reads become null; numeric write results become void
 * @security    S8: keys are validated before this layer; S16: errors propagate so the caller can map them to 503
 * @tests       tests/server/adapters.test.ts
 * @spec        02-architecture-and-headers.md section 3; 04-security.md S16; P3-devvit-wiring.md step 5
 *
 * Redis commands used: hSetNX, hGet, hGetAll, hSet, hIncrBy, incrBy, set, get, del, expire.
 */
import { redis } from '@devvit/web/server';
import type { Store } from '../ports';

export type DevvitRedis = {
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<unknown>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  incrBy(key: string, value: number): Promise<number>;
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | undefined>;
  del(...keys: string[]): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
};

export function createDevvitStore(client: DevvitRedis = redis): Store {
  return {
    async hSetNX(key, field, value) {
      return (await client.hSetNX(key, field, value)) === 1;
    },
    async hGet(key, field) {
      return (await client.hGet(key, field)) ?? null;
    },
    async hGetAll(key) {
      return client.hGetAll(key);
    },
    async hSet(key, field, value) {
      await client.hSet(key, { [field]: value });
    },
    async hIncrBy(key, field, delta) {
      return client.hIncrBy(key, field, delta);
    },
    async incrBy(key, delta) {
      return client.incrBy(key, delta);
    },
    async set(key, value) {
      await client.set(key, value);
    },
    async get(key) {
      return (await client.get(key)) ?? null;
    },
    async del(key) {
      await client.del(key);
    },
    async expire(key, seconds) {
      await client.expire(key, seconds);
    },
  };
}
