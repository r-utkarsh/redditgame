/**
 * @file        tests/client/viewFormat.test.ts
 * @purpose     Proves the pure formatters produce the approved copy, UTC dates and spoiler-free share text.
 * @covers      src/client/view/format.ts
 * @spec        01-spec.md section 7; 06-design-and-ux.md; D-027
 */
import { describe, expect, it } from 'vitest';
import {
  formatBest,
  formatCoordinates,
  formatCompactDateKey,
  formatCountdown,
  formatDateKey,
  formatDelay,
  formatDistanceLabel,
  formatErrorHeadline,
  formatPlayerCount,
  formatPercentile,
  formatScore,
  formatSplashStreak,
  formatStars,
  formatStarsLabel,
  formatStreakDays,
  formatSublabel,
  shareText,
} from '../../src/client/view/format';

describe('date formatting', () => {
  it('formats a date key in UTC', () => {
    expect(formatDateKey('2026-11-18')).toBe('Wed 18 Nov 2026 UTC');
    expect(formatDateKey('2026-11-16')).toBe('Mon 16 Nov 2026 UTC');
  });

  it('returns an empty string for an invalid date key', () => {
    expect(formatDateKey('2026-02-30')).toBe('');
    expect(formatDateKey('nope')).toBe('');
  });

  it('formats the compact splash eyebrow date', () => {
    expect(formatCompactDateKey('2026-11-22')).toBe('SUN 22 NOV');
  });
});

describe('station formatting', () => {
  it('formats a delay with one decimal', () => {
    expect(formatDelay(12.6)).toBe('12.6 s');
    expect(formatDelay(8)).toBe('8.0 s');
  });

  it('formats the implied distance in whole km', () => {
    expect(formatDistanceLabel(12.6)).toBe('about 106 km');
    expect(formatDistanceLabel(0)).toBe('about 0 km');
  });
});

describe('result formatting', () => {
  it('formats the headline error with one decimal', () => {
    expect(formatErrorHeadline(23.4)).toBe('Off by 23.4 km.');
    expect(formatErrorHeadline(0)).toBe('Off by 0.0 km.');
  });

  it('picks a subline at each star threshold', () => {
    expect(formatSublabel(0)).toBe('That is a bullseye.');
    expect(formatSublabel(15)).toBe('That is a bullseye.');
    expect(formatSublabel(15.1)).toBe('Not bad for a hunch.');
    expect(formatSublabel(40)).toBe('Not bad for a hunch.');
    expect(formatSublabel(40.1)).toBe('In the neighborhood.');
    expect(formatSublabel(100)).toBe('In the neighborhood.');
    expect(formatSublabel(100.1)).toBe('The search continues.');
  });

  it('pads stars to three glyphs', () => {
    expect(formatStars(0)).toBe('☆☆☆');
    expect(formatStars(2)).toBe('★★☆');
    expect(formatStars(3)).toBe('★★★');
    expect(formatStars(9)).toBe('★★★');
    expect(formatStars(-1)).toBe('☆☆☆');
  });

  it('labels stars for screen readers', () => {
    expect(formatStarsLabel(2)).toBe('2 of 3 stars');
  });

  it('formats score, count, percentile and coordinates', () => {
    expect(formatScore(820)).toBe('820 points');
    expect(formatPlayerCount(0)).toBe('0 players so far');
    expect(formatPlayerCount(1)).toBe('1 player so far');
    expect(formatPlayerCount(12)).toBe('12 players so far');
    expect(formatPercentile(78)).toBe('Beat 78% of players');
    expect(formatCoordinates({ x: 412, y: 388.04 })).toBe('412.0, 388.0 km');
  });

  it('formats streak copy and hides a zero best', () => {
    expect(formatStreakDays(0)).toBe('0 days');
    expect(formatStreakDays(1)).toBe('1 day');
    expect(formatStreakDays(4)).toBe('4 days');
    expect(formatSplashStreak(0)).toBe('No streak yet');
    expect(formatSplashStreak(1)).toBe('1 day streak');
    expect(formatSplashStreak(4)).toBe('4 day streak');
    expect(formatBest(0)).toBe('');
    expect(formatBest(9)).toBe('Best 9');
  });

  it('formats the retry countdown', () => {
    expect(formatCountdown(30)).toBe('Try again in 30 s.');
    expect(formatCountdown(0)).toBe('Try again in 0 s.');
  });
});

describe('share text', () => {
  it('is spoiler free and matches the spec template', () => {
    expect(
      shareText({
        dateKey: '2026-11-18',
        stars: 2,
        errorKm: 23.4,
        percentile: 78,
      })
    ).toBe('Fault Lines 2026-11-18 ★★☆ 23.4 km off - beat 78% of players');
  });

  it('drops the crowd clause below the minimum', () => {
    expect(
      shareText({
        dateKey: '2026-11-18',
        stars: 2,
        errorKm: 23.4,
        percentile: null,
      })
    ).toBe('Fault Lines 2026-11-18 ★★☆ 23.4 km off');
  });

  it('keeps one decimal and never contains coordinates or a URL', () => {
    const text = shareText({
      dateKey: '2026-11-18',
      stars: 0,
      errorKm: 8,
      percentile: 0,
    });

    expect(text).toBe('Fault Lines 2026-11-18 ☆☆☆ 8.0 km off - beat 0% of players');
    expect(text).not.toContain('http');
    expect(text).not.toContain('412');
  });
});
