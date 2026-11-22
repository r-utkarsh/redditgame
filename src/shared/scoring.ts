/**
 * @file        src/shared/scoring.ts
 * @purpose     Turns an error distance into a score and stars and builds the spoiler-free share text.
 * @layer       shared (pure: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - scoreFromError(errorKm): number
 *   - starsFromError(errorKm): number
 *   - buildShareText(input): string
 * @invariants  score is an integer in [0, 1000] and never increases with error; star thresholds are inclusive
 * @security    S1: share text never contains coordinates, the seed or the truth object
 * @tests       tests/shared/scoring.test.ts
 * @spec        01-spec.md sections 2 and 7
 */
import { SCORE_SCALE_KM, STAR_THRESHOLDS_KM } from './constants';

export function scoreFromError(errorKm: number): number {
  const safeError = Math.max(0, errorKm);
  const score = Math.round(1000 * Math.exp(-safeError / SCORE_SCALE_KM));
  return Math.min(1000, Math.max(0, score));
}

export function starsFromError(errorKm: number): number {
  if (errorKm <= STAR_THRESHOLDS_KM.threeStar) {
    return 3;
  }
  if (errorKm <= STAR_THRESHOLDS_KM.twoStar) {
    return 2;
  }
  if (errorKm <= STAR_THRESHOLDS_KM.oneStar) {
    return 1;
  }
  return 0;
}

export type ShareTextInput = {
  dateKey: string;
  stars: number;
  errorKm: number;
  percentile: number | null;
};

export function buildShareText(input: ShareTextInput): string {
  const stars = Math.min(3, Math.max(0, Math.round(input.stars)));
  const glyphs = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  const base = `Fault Lines ${input.dateKey} ${glyphs} ${input.errorKm.toFixed(1)} km off`;

  if (input.percentile === null) {
    return base;
  }

  return `${base} - beat ${input.percentile}% of players`;
}
