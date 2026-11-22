/**
 * @file        tests/shared/scoring.test.ts
 * @purpose     Proves score bounds and monotonicity, inclusive star cutoffs and spoiler-free share text.
 * @covers      src/shared/scoring.ts
 * @spec        01-spec.md sections 2 and 7; 03-tdd-and-testing.md section 4
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildShareText,
  scoreFromError,
  starsFromError,
} from '../../src/shared/scoring';

describe('scoreFromError', () => {
  it('scores a perfect guess 1000 and stays within 0-1000', () => {
    expect(scoreFromError(0)).toBe(1000);
    expect(scoreFromError(1000)).toBe(0);
    expect(scoreFromError(-5)).toBe(1000);

    fc.assert(
      fc.property(fc.double({ min: 0, max: 5000, noNaN: true }), (errorKm) => {
        const score = scoreFromError(errorKm);
        return Number.isInteger(score) && score >= 0 && score <= 1000;
      })
    );
  });

  it('is monotonic non-increasing', () => {
    let previous = scoreFromError(0);
    for (let errorKm = 0; errorKm <= 500; errorKm += 5) {
      const score = scoreFromError(errorKm);
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });
});

describe('starsFromError', () => {
  it('uses inclusive thresholds', () => {
    expect(starsFromError(0)).toBe(3);
    expect(starsFromError(15)).toBe(3);
    expect(starsFromError(15.1)).toBe(2);
    expect(starsFromError(40)).toBe(2);
    expect(starsFromError(40.1)).toBe(1);
    expect(starsFromError(100)).toBe(1);
    expect(starsFromError(100.1)).toBe(0);
  });
});

describe('buildShareText', () => {
  it('pads stars to three and uses one decimal for the error', () => {
    expect(
      buildShareText({
        dateKey: '2026-11-17',
        stars: 2,
        errorKm: 40,
        percentile: 78,
      })
    ).toBe('Fault Lines 2026-11-17 ★★☆ 40.0 km off - beat 78% of players');
  });

  it('drops the beat clause when the crowd is too small', () => {
    expect(
      buildShareText({
        dateKey: '2026-11-17',
        stars: 1,
        errorKm: 99.94,
        percentile: null,
      })
    ).toBe('Fault Lines 2026-11-17 ★☆☆ 99.9 km off');
  });

  it('never contains coordinates, a URL, an em dash or an en dash', () => {
    const text = buildShareText({
      dateKey: '2026-11-17',
      stars: 0,
      errorKm: 123.4,
      percentile: 0,
    });

    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toContain('\u2013');
    expect(text).not.toContain('\u2014');
    expect(text).not.toContain('123.4,');
    expect(text.startsWith('Fault Lines 2026-11-17 ☆☆☆ 123.4 km off')).toBe(
      true
    );
  });
});
