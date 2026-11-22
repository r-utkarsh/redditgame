/**
 * @file        src/server/core/resultsService.ts
 * @purpose     Returns the after-guess card: truth, solver fit, crowd cloud, median, percentile and the player result.
 * @layer       server core
 * @keyFunctions
 *   - getResults(deps, userId, postId): Promise<ResultsPayload>
 * @invariants  410 when the date is unknown or the day data expired; 403 before a stored guess; sentinels and malformed bins are ignored; the cloud is bounded to 2,500 cells
 * @security    S1, S6, S17: truth leaves the server only after a stored guess; counters are aggregated; no user ids, names or timestamps are returned or tracked
 * @tests       tests/server/resultsService.test.ts; tests/server/telemetry.test.ts
 * @spec        01-spec.md sections 5 and 6; 04-security.md S1, S6, S17; 05-devvit-facts.md telemetry mapping
 */
import {
  CLOUD_BINS,
  MAP_SIZE_KM,
  MARGINAL_BIN_KM,
  MARGINAL_BINS,
  MIN_PLAYERS_FOR_CROWD_STATS,
  SCORE_BINS,
} from '../../shared/constants';
import {
  medianFromBins,
  percentileFromBins,
} from '../../shared/crowd';
import { starsFromError } from '../../shared/scoring';
import type { ResultsPayload } from '../../shared/types';
import { forbidden, puzzleClosed, unavailable } from './errors';
import { loadPuzzle, resolvePostDateKey } from './puzzleService';
import {
  cloudKey,
  guessesKey,
  marginalXKey,
  marginalYKey,
  scoreHistogramKey,
} from './redisKeys';
import { resultsViewedEvent, trackEvent } from './telemetry';
import type { Clock, EntropySource, Logger, Store, Tracker } from '../ports';

type ResultsDeps = {
  store: Store;
  clock: Clock;
  entropy: EntropySource;
  tracker: Tracker;
  logger: Logger;
};

type StoredGuess = {
  x: number;
  y: number;
  errorKm: number;
  score: number;
};

const NUMERIC_FIELD = /^\d+$/;

function parseGuess(raw: string): StoredGuess {
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
  const { x, y, errorKm, score } = record;

  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof errorKm !== 'number' ||
    typeof score !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(errorKm) ||
    !Number.isFinite(score) ||
    x < 0 ||
    x > MAP_SIZE_KM ||
    y < 0 ||
    y > MAP_SIZE_KM ||
    errorKm < 0 ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 1000
  ) {
    throw unavailable();
  }

  return { x, y, errorKm, score };
}

function numericCounts(
  record: Record<string, string>,
  binCount: number
): Map<number, number> {
  const counts = new Map<number, number>();

  for (const [field, raw] of Object.entries(record)) {
    if (!NUMERIC_FIELD.test(field)) {
      continue;
    }
    const bin = Number(field);
    const count = Number(raw);
    if (
      !Number.isInteger(bin) ||
      bin < 0 ||
      bin >= binCount ||
      !Number.isInteger(count) ||
      count <= 0
    ) {
      continue;
    }
    counts.set(bin, (counts.get(bin) ?? 0) + count);
  }

  return counts;
}

function countPlayers(counts: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}

function parseCloud(
  record: Record<string, string>
): Array<{ cx: number; cy: number; n: number }> {
  const cells: Array<{ cx: number; cy: number; n: number }> = [];

  for (const [field, raw] of Object.entries(record)) {
    if (!NUMERIC_FIELD.test(field.replace(':', ''))) {
      continue;
    }
    const parts = field.split(':');
    if (parts.length !== 2) {
      continue;
    }
    const [cxRaw, cyRaw] = parts;
    if (!cxRaw || !cyRaw) {
      continue;
    }
    const cx = Number(cxRaw);
    const cy = Number(cyRaw);
    const n = Number(raw);
    if (
      !Number.isInteger(cx) ||
      !Number.isInteger(cy) ||
      cx < 0 ||
      cy < 0 ||
      cx >= CLOUD_BINS ||
      cy >= CLOUD_BINS ||
      !Number.isInteger(n) ||
      n <= 0
    ) {
      continue;
    }
    cells.push({ cx, cy, n });
  }

  cells.sort((left, right) => left.cx - right.cx || left.cy - right.cy);
  return cells;
}

async function readHash(
  deps: ResultsDeps,
  key: string
): Promise<Record<string, string>> {
  try {
    return await deps.store.hGetAll(key);
  } catch {
    throw unavailable();
  }
}

export async function getResults(
  deps: ResultsDeps,
  userId: string,
  postId: string | undefined
): Promise<ResultsPayload> {
  const dateKey = await resolvePostDateKey(deps, postId);
  if (dateKey === null) {
    throw puzzleClosed();
  }

  const puzzle = await loadPuzzle(deps, dateKey);

  let rawGuess: string | null;
  try {
    rawGuess = await deps.store.hGet(guessesKey(dateKey), userId);
  } catch {
    throw unavailable();
  }
  if (rawGuess === null) {
    throw forbidden();
  }

  const guess = parseGuess(rawGuess);

  const [cloudRecord, mxRecord, myRecord, shRecord] = await Promise.all([
    readHash(deps, cloudKey(dateKey)),
    readHash(deps, marginalXKey(dateKey)),
    readHash(deps, marginalYKey(dateKey)),
    readHash(deps, scoreHistogramKey(dateKey)),
  ]);

  const scoreCounts = numericCounts(shRecord, SCORE_BINS);
  const playerCount = countPlayers(scoreCounts);
  const crowdAtLeastMinimum = playerCount >= MIN_PLAYERS_FOR_CROWD_STATS;

  const medianX = crowdAtLeastMinimum
    ? medianFromBins(
        numericCounts(mxRecord, MARGINAL_BINS),
        MARGINAL_BIN_KM,
        playerCount
      )
    : null;
  const medianY = crowdAtLeastMinimum
    ? medianFromBins(
        numericCounts(myRecord, MARGINAL_BINS),
        MARGINAL_BIN_KM,
        playerCount
      )
    : null;

  const stars = starsFromError(guess.errorKm);
  const payload: ResultsPayload = {
    truth: { x: puzzle.truth.x, y: puzzle.truth.y },
    solverFit: {
      x: puzzle.solverFit.x,
      y: puzzle.solverFit.y,
      errorKm: puzzle.solverFit.errorKm,
    },
    cloud: parseCloud(cloudRecord),
    crowdMedian:
      medianX !== null && medianY !== null
        ? { x: medianX, y: medianY }
        : null,
    playerCount,
    percentile: crowdAtLeastMinimum
      ? percentileFromBins(scoreCounts, guess.score)
      : null,
    you: {
      x: guess.x,
      y: guess.y,
      errorKm: guess.errorKm,
      score: guess.score,
      stars,
    },
    stations: puzzle.stations.map((station) => ({ ...station })),
    mapSizeKm: MAP_SIZE_KM,
    fault: puzzle.fault.map((point) => ({ ...point })),
  };

  void trackEvent(deps, resultsViewedEvent(stars, guess.score));
  return payload;
}
