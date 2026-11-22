/**
 * @file        src/shared/crowd.ts
 * @purpose     Bins crowd coordinates and scores and derives the crowd median and percentile.
 * @layer       shared (pure: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - binIndex(value, binKm, bins): number
 *   - medianFromBins(counts, binKm, playerCount?): number | null
 *   - percentileFromBins(counts, score): number | null
 * @invariants  binIndex clamps to [0, bins - 1]; helpers ignore non-finite and negative keys and return null below MIN_PLAYERS_FOR_CROWD_STATS
 * @security    none (aggregate values only; no user ids)
 * @tests       tests/shared/crowd.test.ts
 * @spec        01-spec.md sections 5 and 6
 */
import {
  MIN_PLAYERS_FOR_CROWD_STATS,
  SCORE_BIN,
  SCORE_BINS,
} from './constants';

export function binIndex(value: number, binKm: number, bins: number): number {
  return Math.min(Math.max(Math.floor(value / binKm), 0), bins - 1);
}

function cleanCounts(counts: ReadonlyMap<number, number>): Map<number, number> {
  const clean = new Map<number, number>();
  for (const [key, count] of counts) {
    if (Number.isInteger(key) && key >= 0 && Number.isFinite(count) && count > 0) {
      clean.set(key, (clean.get(key) ?? 0) + count);
    }
  }
  return clean;
}

function totalCount(counts: Map<number, number>): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}

export function medianFromBins(
  counts: ReadonlyMap<number, number>,
  binKm: number,
  playerCount?: number
): number | null {
  const clean = cleanCounts(counts);
  const total = playerCount ?? totalCount(clean);
  if (total < MIN_PLAYERS_FOR_CROWD_STATS) {
    return null;
  }

  const target = Math.ceil(total / 2);
  let cumulative = 0;
  const keys = [...clean.keys()].sort((left, right) => left - right);
  for (const key of keys) {
    cumulative += clean.get(key) ?? 0;
    if (cumulative >= target) {
      return (key + 0.5) * binKm;
    }
  }

  return null;
}

export function percentileFromBins(
  counts: ReadonlyMap<number, number>,
  score: number
): number | null {
  const clean = cleanCounts(counts);
  const total = totalCount(clean);
  if (total < MIN_PLAYERS_FOR_CROWD_STATS) {
    return null;
  }

  const playerBin = binIndex(score, SCORE_BIN, SCORE_BINS);
  let lower = 0;
  for (const [key, count] of clean) {
    if (key < playerBin) {
      lower += count;
    }
  }
  const sameBinOthers = Math.max(0, (clean.get(playerBin) ?? 0) - 1);
  const raw = (100 * (lower + 0.5 * sameBinOthers)) / Math.max(1, total - 1);
  return Math.min(100, Math.max(0, Math.round(raw)));
}
