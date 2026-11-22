/**
 * @file        src/server/ports.ts
 * @purpose     Defines the ports the server core depends on so tests can inject in-memory fakes.
 * @layer       server (types only: no I/O, no Devvit imports)
 * @keyFunctions
 *   - Store
 *   - Clock
 *   - EntropySource
 *   - Tracker
 *   - PostPublisher
 *   - Identity
 *   - Logger
 *   - AppDeps
 * @invariants  core services import ports only; Devvit implementations live in src/server/adapters
 * @security    S4: Identity is the only source of userId; S19: EntropySource is the only seed source; S17: TrackerEvent carries no PII
 * @tests       tests/fakes/store.test.ts (fake contract); service tests; tests/server/telemetry.test.ts
 * @spec        02-architecture-and-headers.md section 1; 04-security.md S4, S19; 05-devvit-facts.md telemetry mapping
 */
export interface Store {
  hSetNX(key: string, field: string, value: string): Promise<boolean>;
  hGet(key: string, field: string): Promise<string | null>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, field: string, value: string): Promise<void>;
  hIncrBy(key: string, field: string, delta: number): Promise<number>;
  incrBy(key: string, delta: number): Promise<number>;
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface EntropySource {
  nextSeed(): number;
}

export type TrackerEvent = {
  name: string;
  action?: string;
  progress?: number;
  complete?: boolean;
  win?: boolean;
  score?: number;
};

export interface Tracker {
  track(event: TrackerEvent): Promise<void>;
}

export type PublishInput = {
  dateKey: string;
  title: string;
  body: string;
};

export interface PostPublisher {
  publishDailyPost(input: PublishInput): Promise<{ postId: string }>;
}

export type IdentityValue = {
  userId: string;
  postId?: string;
};

export interface Identity {
  get(): Promise<IdentityValue | null>;
}

export interface Logger {
  info(event: string, status?: number): void;
  error(event: string, status?: number): void;
}

export type AppDeps = {
  store: Store;
  clock: Clock;
  entropy: EntropySource;
  tracker: Tracker;
  publisher: PostPublisher;
  identity: Identity;
  logger: Logger;
};
