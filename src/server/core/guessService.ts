/**
 * @file        src/server/core/guessService.ts
 * @purpose     Commits one guess per user per day, scores it on the server and updates streak and crowd counters.
 * @layer       server core
 * @keyFunctions
 *   - submitGuess(deps, userId, dateKey, guess): Promise<GuessResult>
 * @invariants  hSetNX on gs is the commit point; only the commit failure returns 503; later writes retry once, log and still return 200; UTC midnight closes the puzzle
 * @security    S2, S3, S11, S16, S17: one guess per user per day, the client sends coordinates only, the server computes score and stars, storage failures never fake a rejection, Journey events carry no PII
 * @tests       tests/server/guessService.test.ts; tests/server/telemetry.test.ts
 * @spec        01-spec.md sections 5 and 6; 04-security.md S2, S3, S11, S16; 05-devvit-facts.md telemetry mapping
 */
import { binIndex } from '../../shared/crowd';
import {
  CLOUD_BIN_KM,
  CLOUD_BINS,
  MARGINAL_BIN_KM,
  MARGINAL_BINS,
  SCORE_BIN,
  SCORE_BINS,
} from '../../shared/constants';
import { toDateKey } from '../../shared/dates';
import { distanceKm } from '../../shared/geometry';
import { scoreFromError, starsFromError } from '../../shared/scoring';
import type { GuessInput, GuessResult, Streak } from '../../shared/types';
import { alreadyGuessed, puzzleClosed, unavailable } from './errors';
import { loadPuzzle } from './puzzleService';
import {
  cloudKey,
  guessesKey,
  marginalXKey,
  marginalYKey,
  scoreHistogramKey,
} from './redisKeys';
import { saveGuessStreak } from './streakService';
import {
  guessSubmittedEvent,
  streakExtendedEvent,
  trackEvent,
} from './telemetry';
import type { Clock, EntropySource, Logger, Store, Tracker } from '../ports';

type GuessDeps = {
  store: Store;
  clock: Clock;
  entropy: EntropySource;
  tracker: Tracker;
  logger: Logger;
};

const FALLBACK_STREAK: Streak = { current: 0, best: 0 };

function roundToOneDecimal(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch {
    try {
      return await operation();
    } catch {
      return null;
    }
  }
}

export async function submitGuess(
  deps: GuessDeps,
  userId: string,
  dateKey: string | null,
  guess: GuessInput
): Promise<GuessResult> {
  if (dateKey === null || dateKey !== toDateKey(deps.clock.now())) {
    throw puzzleClosed();
  }

  const puzzle = await loadPuzzle(deps, dateKey);
  const errorKm = roundToOneDecimal(distanceKm(guess, puzzle.truth));
  const score = scoreFromError(errorKm);
  const stars = starsFromError(errorKm);

  let committed: boolean;
  try {
    committed = await deps.store.hSetNX(
      guessesKey(dateKey),
      userId,
      JSON.stringify({ x: guess.x, y: guess.y, errorKm, score })
    );
  } catch {
    throw unavailable();
  }

  if (!committed) {
    throw alreadyGuessed();
  }

  const savedStreak = await withRetry(() =>
    saveGuessStreak(deps.store, userId, dateKey)
  );
  const streak = savedStreak ?? FALLBACK_STREAK;
  if (savedStreak === null) {
    deps.logger.error('streak_write_failed');
  }

  const cloudX = binIndex(guess.x, CLOUD_BIN_KM, CLOUD_BINS);
  const cloudY = binIndex(guess.y, CLOUD_BIN_KM, CLOUD_BINS);
  const counters: Array<[string, string]> = [
    [cloudKey(dateKey), `${cloudX}:${cloudY}`],
    [marginalXKey(dateKey), String(binIndex(guess.x, MARGINAL_BIN_KM, MARGINAL_BINS))],
    [marginalYKey(dateKey), String(binIndex(guess.y, MARGINAL_BIN_KM, MARGINAL_BINS))],
    [scoreHistogramKey(dateKey), String(binIndex(score, SCORE_BIN, SCORE_BINS))],
  ];

  for (const [key, field] of counters) {
    const updated = await withRetry(() => deps.store.hIncrBy(key, field, 1));
    if (updated === null) {
      deps.logger.error('counter_write_failed');
    }
  }

  void trackEvent(deps, guessSubmittedEvent());
  if (streak.current >= 2) {
    void trackEvent(deps, streakExtendedEvent());
  }

  return {
    errorKm,
    score,
    stars,
    truth: { x: puzzle.truth.x, y: puzzle.truth.y },
    streak,
  };
}
