/**
 * @file        src/server/core/puzzleService.ts
 * @purpose     Resolves a post to a date, lazily creates today's puzzle and returns the open or closed payload.
 * @layer       server core
 * @keyFunctions
 *   - ensurePuzzle(deps, dateKey, options?): Promise<PrivatePuzzle>
 *   - loadPuzzle(deps, dateKey): Promise<PrivatePuzzle>
 *   - resolvePostDateKey(deps, postId): Promise<string | null>
 *   - getPuzzle(deps, userId, postId): Promise<PuzzlePayload>
 * @invariants  puzzle creation is one hSetNX of the whole data JSON; sentinels and TTLs are best-effort but never delete puz; only today's post creates a puzzle
 * @security    S1, S8, S11, S19: no truth, seed or solver fit leaves the server before a guess; the date comes from the post mapping, never the client; the post id is shape-checked before it enters a key; the seed comes only from EntropySource
 * @tests       tests/server/puzzleService.test.ts; tests/server/telemetry.test.ts
 * @spec        01-spec.md sections 5 and 6; 04-security.md S1, S11, S19; 05-devvit-facts.md telemetry mapping
 */
import {
  DAY_KEY_TTL_DAYS,
  MAP_SIZE_KM,
} from '../../shared/constants';
import { isValidDateKey, toDateKey } from '../../shared/dates';
import { generatePuzzle, toPublicPuzzle } from '../../shared/generator';
import type {
  Point,
  PrivatePuzzle,
  PuzzlePayload,
  SolverFit,
  Station,
} from '../../shared/types';
import { puzzleClosed, unavailable } from './errors';
import {
  cloudKey,
  guessesKey,
  isValidPostId,
  marginalXKey,
  marginalYKey,
  postKey,
  puzzleKey,
  scoreHistogramKey,
} from './redisKeys';
import { displayStreak, readStreakState } from './streakService';
import { appReadyEvent, trackEvent } from './telemetry';
import { getSplashState } from '../../shared/splashState';
import type {
  Clock,
  EntropySource,
  Logger,
  Store,
  Tracker,
} from '../ports';

type PuzzleDeps = {
  store: Store;
  clock: Clock;
  entropy: EntropySource;
  tracker: Tracker;
  logger: Logger;
};

const DAY_TTL_S = DAY_KEY_TTL_DAYS * 86400;

function isPoint(value: unknown): value is Point {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Number.isFinite(record.x) && Number.isFinite(record.y);
}

function isStation(value: unknown): value is Station {
  if (!isPoint(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.id === 'A' ||
      record.id === 'B' ||
      record.id === 'C' ||
      record.id === 'D') &&
    Number.isFinite(record.delayS)
  );
}

function isSolverFit(value: unknown): value is SolverFit {
  if (!isPoint(value)) {
    return false;
  }
  return Number.isFinite((value as Record<string, unknown>).errorKm);
}

function parsePrivatePuzzle(raw: string): PrivatePuzzle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw unavailable();
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw unavailable();
  }

  const record = parsed as Record<string, unknown>;
  const stations = record.stations;
  const fault = record.fault;

  if (
    !Number.isFinite(record.seed) ||
    !isPoint(record.truth) ||
    !Array.isArray(stations) ||
    !stations.every(isStation) ||
    stations.length < 3 ||
    !Array.isArray(fault) ||
    !fault.every(isPoint) ||
    fault.length < 2 ||
    !isSolverFit(record.solverFit)
  ) {
    throw unavailable();
  }

  return {
    seed: record.seed as number,
    truth: { x: record.truth.x, y: record.truth.y },
    stations: stations.map((station) => ({ ...station })),
    fault: fault.map((point) => ({ ...point })),
    solverFit: {
      x: record.solverFit.x,
      y: record.solverFit.y,
      errorKm: record.solverFit.errorKm,
    },
  };
}

async function runSetup(deps: PuzzleDeps, dateKey: string): Promise<void> {
  const keys = [
    cloudKey(dateKey),
    marginalXKey(dateKey),
    marginalYKey(dateKey),
    scoreHistogramKey(dateKey),
    guessesKey(dateKey),
  ];

  try {
    await deps.store.expire(puzzleKey(dateKey), DAY_TTL_S);
    for (const key of keys) {
      await deps.store.hSetNX(key, '_', '0');
      await deps.store.expire(key, DAY_TTL_S);
    }
  } catch {
    deps.logger.error('puzzle_setup_failed');
  }
}

async function readStoredPuzzle(
  deps: PuzzleDeps,
  dateKey: string
): Promise<PrivatePuzzle | null> {
  let raw: string | null;
  try {
    raw = await deps.store.hGet(puzzleKey(dateKey), 'data');
  } catch {
    throw unavailable();
  }

  return raw === null ? null : parsePrivatePuzzle(raw);
}

async function hasSentinel(deps: PuzzleDeps, dateKey: string): Promise<boolean> {
  try {
    return (await deps.store.hGet(guessesKey(dateKey), '_')) !== null;
  } catch {
    throw unavailable();
  }
}

export async function ensurePuzzle(
  deps: PuzzleDeps,
  dateKey: string,
  options: { repair?: boolean } = {}
): Promise<PrivatePuzzle> {
  if (!isValidDateKey(dateKey)) {
    throw unavailable();
  }

  const stored = await readStoredPuzzle(deps, dateKey);
  if (stored) {
    if (options.repair !== false && !(await hasSentinel(deps, dateKey))) {
      await runSetup(deps, dateKey);
    }
    return stored;
  }

  let seed: number;
  try {
    seed = deps.entropy.nextSeed();
  } catch {
    throw unavailable();
  }
  if (!Number.isFinite(seed)) {
    throw unavailable();
  }

  let puzzle: PrivatePuzzle;
  try {
    puzzle = generatePuzzle(seed, dateKey);
  } catch {
    throw unavailable();
  }

  let created: boolean;
  try {
    created = await deps.store.hSetNX(
      puzzleKey(dateKey),
      'data',
      JSON.stringify(puzzle)
    );
  } catch {
    throw unavailable();
  }

  if (!created) {
    const winner = await readStoredPuzzle(deps, dateKey);
    if (!winner) {
      throw unavailable();
    }
    return winner;
  }

  await runSetup(deps, dateKey);
  return puzzle;
}

export async function loadPuzzle(
  deps: PuzzleDeps,
  dateKey: string
): Promise<PrivatePuzzle> {
  if (!isValidDateKey(dateKey)) {
    throw puzzleClosed();
  }

  const stored = await readStoredPuzzle(deps, dateKey);
  if (!stored) {
    throw puzzleClosed();
  }
  return stored;
}

export async function resolvePostDateKey(
  deps: PuzzleDeps,
  postId: string | undefined
): Promise<string | null> {
  if (!postId || !isValidPostId(postId)) {
    return null;
  }

  let value: string | null;
  try {
    value = await deps.store.get(postKey(postId));
  } catch {
    throw unavailable();
  }

  return value !== null && isValidDateKey(value) ? value : null;
}

async function hasGuessed(
  deps: PuzzleDeps,
  userId: string,
  dateKey: string | null
): Promise<boolean> {
  if (dateKey === null) {
    return false;
  }
  try {
    return (await deps.store.hGet(guessesKey(dateKey), userId)) !== null;
  } catch {
    throw unavailable();
  }
}

export async function getPuzzle(
  deps: PuzzleDeps,
  userId: string,
  postId: string | undefined
): Promise<PuzzlePayload> {
  const todayKey = toDateKey(deps.clock.now());
  const dateKey = await resolvePostDateKey(deps, postId);

  let streak;
  try {
    streak = displayStreak(
      await readStreakState(deps.store, userId),
      todayKey
    );
  } catch {
    throw unavailable();
  }

  if (dateKey !== todayKey) {
    const alreadyGuessed = await hasGuessed(deps, userId, dateKey);
    const payload: PuzzlePayload = {
      status: 'closed',
      splashState: getSplashState(dateKey, deps.clock.now(), alreadyGuessed),
      dateKey,
      alreadyGuessed,
      streak,
    };
    void trackEvent(deps, appReadyEvent());
    return payload;
  }

  const puzzle = await ensurePuzzle(deps, dateKey);
  const publicPuzzle = toPublicPuzzle(puzzle, dateKey);
  const alreadyGuessed = await hasGuessed(deps, userId, dateKey);
  const payload: PuzzlePayload = {
    status: 'open',
    splashState: getSplashState(dateKey, deps.clock.now(), alreadyGuessed),
    dateKey,
    mapSizeKm: MAP_SIZE_KM,
    stations: publicPuzzle.stations,
    fault: publicPuzzle.fault,
    alreadyGuessed,
    streak,
  };
  void trackEvent(deps, appReadyEvent());
  return payload;
}
