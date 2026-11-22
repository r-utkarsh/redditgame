/**
 * @file        src/client/view/format.ts
 * @purpose     Formats dates, station labels, result copy and the spoiler-free share text.
 * @layer       client view (pure: no DOM, no I/O)
 * @keyFunctions
 *   - formatDateKey(dateKey): string
 *   - formatCompactDateKey(dateKey): string
 *   - formatDelay(delayS): string
 *   - formatDistanceLabel(delayS): string
 *   - formatErrorHeadline(errorKm): string
 *   - formatSublabel(errorKm): string
 *   - formatStars(stars): string
 *   - formatStarsLabel(stars): string
 *   - formatScore(score): string
 *   - formatStreakDays(current): string
 *   - formatSplashStreak(current): string
 *   - formatPlayerCount(count): string
 *   - formatPercentile(percentile): string
 *   - formatCoordinates(point): string
 *   - formatCountdown(seconds): string
 *   - shareText(input): string
 * @invariants  UTC only; one decimal for seconds, km and error; no coordinates in share text; no em dash or en dash
 * @security    S17: share text never carries coordinates, user ids or a URL
 * @tests       tests/client/viewFormat.test.ts
 * @spec        01-spec.md section 7; 06-design-and-ux.md; D-027
 */
import { KM_PER_SECOND_OF_DELAY, STAR_THRESHOLDS_KM } from '../../shared/constants';
import { isValidDateKey } from '../../shared/dates';
import type { Point } from '../../shared/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function oneDecimal(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return (Object.is(safe, -0) ? 0 : safe).toFixed(1);
}

function wholeKm(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.round(safe)} km`;
}

export function formatDateKey(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    return '';
  }

  const date = new Date(
    Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
      12
    )
  );

  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${
    MONTHS[date.getUTCMonth()]
  } ${date.getUTCFullYear()} UTC`;
}

export function formatCompactDateKey(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    return '';
  }

  const date = new Date(
    Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
      12
    )
  );

  const weekday = WEEKDAYS[date.getUTCDay()] ?? '';
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${weekday.toUpperCase()} ${date.getUTCDate()} ${month.toUpperCase()}`;
}

export function formatDelay(delayS: number): string {
  return `${oneDecimal(delayS)} s`;
}

export function formatDistanceLabel(delayS: number): string {
  return `about ${wholeKm((Number.isFinite(delayS) ? delayS : 0) * KM_PER_SECOND_OF_DELAY)}`;
}

export function formatWholeKm(distanceKm: number): string {
  return wholeKm(distanceKm);
}

export function formatErrorHeadline(errorKm: number): string {
  return `Off by ${oneDecimal(errorKm)} km.`;
}

export function formatSublabel(errorKm: number): string {
  if (errorKm <= STAR_THRESHOLDS_KM.threeStar) {
    return 'That is a bullseye.';
  }
  if (errorKm <= STAR_THRESHOLDS_KM.twoStar) {
    return 'Not bad for a hunch.';
  }
  if (errorKm <= STAR_THRESHOLDS_KM.oneStar) {
    return 'In the neighborhood.';
  }
  return 'The search continues.';
}

function clampStars(stars: number): number {
  if (!Number.isFinite(stars)) {
    return 0;
  }
  return Math.min(3, Math.max(0, Math.round(stars)));
}

export function formatStars(stars: number): string {
  const count = clampStars(stars);
  return `${'★'.repeat(count)}${'☆'.repeat(3 - count)}`;
}

export function formatStarsLabel(stars: number): string {
  return `${clampStars(stars)} of 3 stars`;
}

export function formatScore(score: number): string {
  const safe = Number.isFinite(score) ? Math.round(score) : 0;
  return `${safe} points`;
}

export function formatStreakDays(current: number): string {
  const safe = Number.isFinite(current) ? Math.max(0, Math.round(current)) : 0;
  return safe === 1 ? '1 day' : `${safe} days`;
}

export function formatSplashStreak(current: number): string {
  const safe = Number.isFinite(current) ? Math.max(0, Math.round(current)) : 0;
  if (safe === 0) {
    return 'No streak yet';
  }
  return safe === 1 ? '1 day streak' : `${safe} day streak`;
}

export function formatBest(best: number): string {
  const safe = Number.isFinite(best) ? Math.max(0, Math.round(best)) : 0;
  return safe === 0 ? '' : `Best ${safe}`;
}

export function formatPlayerCount(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  return safe === 1 ? '1 player so far' : `${safe} players so far`;
}

export function formatPercentile(percentile: number): string {
  const safe = Number.isFinite(percentile)
    ? Math.min(100, Math.max(0, Math.round(percentile)))
    : 0;
  return `Beat ${safe}% of players`;
}

export function formatCoordinates(point: Point): string {
  return `${oneDecimal(point.x)}, ${oneDecimal(point.y)} km`;
}

export function formatCountdown(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return `Try again in ${safe} s.`;
}

export type ShareInput = {
  dateKey: string;
  stars: number;
  errorKm: number;
  percentile: number | null;
};

export function shareText(input: ShareInput): string {
  const base = `Fault Lines ${input.dateKey} ${formatStars(input.stars)} ${oneDecimal(
    input.errorKm
  )} km off`;

  if (input.percentile === null || !Number.isFinite(input.percentile)) {
    return base;
  }

  return `${base} - beat ${Math.min(100, Math.max(0, Math.round(input.percentile)))}% of players`;
}
