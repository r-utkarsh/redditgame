/**
 * @file        tests/shared/dates.test.ts
 * @purpose     Pins UTC date keys, real-calendar validation, weekday difficulty and midnight edges.
 * @covers      src/shared/dates.ts
 * @spec        01-spec.md sections 3 and 6; 03-tdd-and-testing.md section 4
 */
import { describe, expect, it } from 'vitest';
import {
  addUtcDays,
  difficultyForDateKey,
  isSameUtcDay,
  isValidDateKey,
  previousDateKey,
  toDateKey,
} from '../../src/shared/dates';

describe('toDateKey', () => {
  it('uses the UTC calendar day', () => {
    expect(toDateKey(new Date(Date.UTC(2026, 10, 17, 23, 59, 59)))).toBe(
      '2026-11-17'
    );
    expect(toDateKey(new Date(Date.UTC(2026, 10, 18, 0, 0, 0)))).toBe(
      '2026-11-18'
    );
  });

  it('formats single-digit months and days with two digits', () => {
    expect(toDateKey(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
  });
});

describe('isValidDateKey', () => {
  it('accepts real calendar days, including leap day', () => {
    expect(isValidDateKey('2026-11-17')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true);
  });

  it('rejects impossible days and malformed strings', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2027-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-00-10')).toBe(false);
    expect(isValidDateKey('2026-1-1')).toBe(false);
    expect(isValidDateKey('20261117')).toBe(false);
  });
});

describe('difficultyForDateKey', () => {
  it('follows the UTC weekday table', () => {
    expect(difficultyForDateKey('2026-11-16')).toEqual({
      stations: 4,
      sigmaS: 0.3,
      faultShown: true,
    });
    expect(difficultyForDateKey('2026-11-20')).toEqual({
      stations: 3,
      sigmaS: 1.0,
      faultShown: false,
    });
    expect(difficultyForDateKey('2026-11-21')).toEqual({
      stations: 3,
      sigmaS: 1.2,
      faultShown: false,
    });
    expect(difficultyForDateKey('2026-11-22')).toEqual({
      stations: 4,
      sigmaS: 1.2,
      faultShown: false,
    });
  });

  it('rejects an invalid date key', () => {
    expect(() => difficultyForDateKey('2026-02-30')).toThrow();
  });
});

describe('isSameUtcDay', () => {
  it('compares UTC calendar days, not elapsed time', () => {
    expect(
      isSameUtcDay(
        new Date(Date.UTC(2026, 10, 17, 0, 0, 1)),
        new Date(Date.UTC(2026, 10, 17, 23, 59, 59))
      )
    ).toBe(true);
    expect(
      isSameUtcDay(
        new Date(Date.UTC(2026, 10, 17, 23, 59, 59)),
        new Date(Date.UTC(2026, 10, 18, 0, 0, 0))
      )
    ).toBe(false);
  });
});

describe('addUtcDays', () => {
  it('moves forward and backward across month, year and leap boundaries', () => {
    expect(addUtcDays('2026-11-17', 1)).toBe('2026-11-18');
    expect(addUtcDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addUtcDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addUtcDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addUtcDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addUtcDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('rejects invalid date keys and non-integer offsets', () => {
    expect(() => addUtcDays('2026-02-30', 1)).toThrow();
    expect(() => addUtcDays('2026-11-17', 1.5)).toThrow();
  });

  it('returns yesterday for previousDateKey', () => {
    expect(previousDateKey('2026-11-17')).toBe('2026-11-16');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });
});
