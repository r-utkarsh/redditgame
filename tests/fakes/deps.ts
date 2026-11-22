/**
 * @file        tests/fakes/deps.ts
 * @purpose     Builds a complete AppDeps bag from fakes with a fixed UTC clock and one fake user.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2
 */
import type { AppDeps } from '../../src/server/ports';
import { FakeClock } from './clock';
import { FakeEntropy } from './entropy';
import { FakeIdentity } from './identity';
import { FakeLogger } from './logger';
import { FakePublisher } from './publisher';
import { FakeStore } from './store';
import { FakeTracker } from './tracker';

export type FakeDeps = {
  store: FakeStore;
  clock: FakeClock;
  entropy: FakeEntropy;
  tracker: FakeTracker;
  publisher: FakePublisher;
  identity: FakeIdentity;
  logger: FakeLogger;
};

export const DEFAULT_NOW = new Date(Date.UTC(2026, 10, 17, 12, 0, 0));
export const TODAY = '2026-11-17';

export function makeDeps(overrides: Partial<AppDeps> = {}): FakeDeps {
  const deps: FakeDeps = {
    store: new FakeStore(),
    clock: new FakeClock(DEFAULT_NOW),
    entropy: new FakeEntropy([123456, 654321]),
    tracker: new FakeTracker(),
    publisher: new FakePublisher(),
    identity: new FakeIdentity({ userId: 't2_test1', postId: 't3_testpost' }),
    logger: new FakeLogger(),
  };

  return { ...deps, ...overrides } as FakeDeps;
}

export function toDeps(deps: FakeDeps): AppDeps {
  return deps;
}
