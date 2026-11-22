/**
 * @file        tests/fakes/store.ts
 * @purpose     In-memory Store fake that mimics Redis command semantics, counts operations and can throw on demand.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; P2-server-core.md step 1
 */
import type { Store } from '../../src/server/ports';

export class FakeStore implements Store {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly strings = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  opCount = 0;

  readonly opLog: Array<{ command: string; key: string }> = [];

  private readonly failures = new Map<string, number>();
  private readonly keyFailures = new Map<string, number>();

  failCommand(command: string, times = 1): void {
    this.failures.set(command, times);
  }

  failKey(key: string, times = 1): void {
    this.keyFailures.set(key, times);
  }

  clearFailures(): void {
    this.failures.clear();
    this.keyFailures.clear();
  }

  private tick(command: string, key?: string): void {
    this.opCount += 1;
    this.opLog.push({ command, key: key ?? '' });
    const remaining = this.failures.get(command);
    if (remaining !== undefined && remaining > 0) {
      if (remaining !== Number.POSITIVE_INFINITY) {
        this.failures.set(command, remaining - 1);
      }
      throw new Error(`fake store: ${command} failed`);
    }
    if (key !== undefined) {
      const keyRemaining = this.keyFailures.get(key);
      if (keyRemaining !== undefined && keyRemaining > 0) {
        if (keyRemaining !== Number.POSITIVE_INFINITY) {
          this.keyFailures.set(key, keyRemaining - 1);
        }
        throw new Error(`fake store: ${command} on ${key} failed`);
      }
    }
  }

  private hash(key: string, create = false): Map<string, string> | undefined {
    const existing = this.hashes.get(key);
    if (existing || !create) {
      return existing;
    }
    const created = new Map<string, string>();
    this.hashes.set(key, created);
    return created;
  }

  hasKey(key: string): boolean {
    return this.hashes.has(key) || this.strings.has(key);
  }

  async hSetNX(key: string, field: string, value: string): Promise<boolean> {
    this.tick('hSetNX', key);
    const hash = this.hash(key, true)!;
    if (hash.has(field)) {
      return false;
    }
    hash.set(field, value);
    return true;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    this.tick('hGet', key);
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    this.tick('hGetAll', key);
    const hash = this.hashes.get(key);
    if (!hash) {
      return {};
    }
    return Object.fromEntries(hash.entries());
  }

  async hSet(key: string, field: string, value: string): Promise<void> {
    this.tick('hSet', key);
    this.hash(key, true)!.set(field, value);
  }

  async hIncrBy(key: string, field: string, delta: number): Promise<number> {
    this.tick('hIncrBy', key);
    const hash = this.hash(key, true)!;
    const next = Number(hash.get(field) ?? '0') + delta;
    hash.set(field, String(next));
    return next;
  }

  async incrBy(key: string, delta: number): Promise<number> {
    this.tick('incrBy', key);
    const next = Number(this.strings.get(key) ?? '0') + delta;
    this.strings.set(key, String(next));
    return next;
  }

  async set(key: string, value: string): Promise<void> {
    this.tick('set', key);
    this.strings.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    this.tick('get', key);
    return this.strings.get(key) ?? null;
  }

  async del(key: string): Promise<void> {
    this.tick('del', key);
    this.hashes.delete(key);
    this.strings.delete(key);
    this.expirations.delete(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.tick('expire', key);
    if (!this.hasKey(key)) {
      return;
    }
    this.expirations.set(key, seconds);
  }
}
