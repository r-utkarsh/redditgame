/**
 * @file        tests/shared/validation.test.ts
 * @purpose     Proves the strict guess validator rejects every hostile body shape and quantizes valid coordinates.
 * @covers      src/shared/validation.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md sections 4 and 5
 */
import { describe, expect, it } from 'vitest';
import { parseGuessRequest } from '../../src/shared/validation';

describe('parseGuessRequest', () => {
  it('accepts a valid point and quantizes it to 0.1 km', () => {
    expect(parseGuessRequest({ x: 500, y: 250 })).toEqual({ x: 500, y: 250 });
    expect(parseGuessRequest({ x: 123.456, y: 0.04 })).toEqual({
      x: 123.5,
      y: 0,
    });
    expect(parseGuessRequest({ x: 0.05, y: 999.99 })).toEqual({
      x: 0.1,
      y: 1000,
    });
  });

  it('normalizes negative zero', () => {
    const parsed = parseGuessRequest({ x: -0, y: 0 });

    expect(parsed).toEqual({ x: 0, y: 0 });
    expect(Object.is(parsed?.x, -0)).toBe(false);
  });

  it('rejects non-objects, arrays and null', () => {
    for (const value of [null, undefined, 1, 'x', true, [], [1, 2]]) {
      expect(parseGuessRequest(value)).toBeNull();
    }
  });

  it('rejects string coercion and non-finite numbers', () => {
    for (const value of [
      { x: '500', y: 250 },
      { x: 500, y: '250' },
      { x: Number.NaN, y: 250 },
      { x: 500, y: Number.POSITIVE_INFINITY },
      { x: 500, y: Number.NEGATIVE_INFINITY },
      { x: Number.parseFloat('1e309'), y: 250 },
      { x: null, y: 250 },
      { x: 500, y: undefined },
    ]) {
      expect(parseGuessRequest(value)).toBeNull();
    }
  });

  it('rejects nested objects, extra keys and prototype keys', () => {
    for (const value of [
      { x: { value: 500 }, y: 250 },
      { x: 500, y: 250, z: 1 },
      { x: 500, y: 250, __proto__: { polluted: true } },
      { x: 500, y: 250, constructor: 1 },
      { x: 500 },
      { y: 250 },
      {},
    ]) {
      expect(parseGuessRequest(value)).toBeNull();
    }
  });

  it('rejects coordinates outside the map', () => {
    for (const value of [
      { x: -0.1, y: 250 },
      { x: 1000.1, y: 250 },
      { x: 500, y: -1 },
      { x: 500, y: 1001 },
    ]) {
      expect(parseGuessRequest(value)).toBeNull();
    }
  });

  it('rejects inherited coordinates', () => {
    const inherited = Object.create({ x: 500, y: 250 });

    expect(parseGuessRequest(inherited)).toBeNull();
  });
});
