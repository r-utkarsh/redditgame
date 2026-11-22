/**
 * @file        tests/shared/rng.test.ts
 * @purpose     Proves the seeded PRNG is deterministic, stays in range and produces a sane Gaussian.
 * @covers      src/shared/rng.ts
 * @spec        03-tdd-and-testing.md section 4; 01-spec.md section 4 step 4
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng, gaussian, nextFloat, nextInt } from '../../src/shared/rng';

describe('rng', () => {
  it('repeats the same stream for the same seed', () => {
    const left = createRng(1234);
    const right = createRng(1234);

    const leftValues = Array.from({ length: 20 }, () => nextFloat(left));
    const rightValues = Array.from({ length: 20 }, () => nextFloat(right));

    expect(leftValues).toEqual(rightValues);
  });

  it('produces a different stream for a different seed', () => {
    const left = createRng(1);
    const right = createRng(2);

    expect(nextFloat(left)).not.toBe(nextFloat(right));
  });

  it('keeps nextFloat in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 100 }), (seed, draws) => {
        const rng = createRng(seed);
        for (let index = 0; index < draws; index += 1) {
          const value = nextFloat(rng);
          if (value < 0 || value >= 1) {
            return false;
          }
        }
        return true;
      })
    );
  });

  it('keeps nextInt inside inclusive bounds and covers them', () => {
    const rng = createRng(99);
    const seen = new Set<number>();

    for (let index = 0; index < 200; index += 1) {
      const value = nextInt(rng, 2, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(5);
      seen.add(value);
    }

    expect([...seen].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });

  it('returns the minimum when the range is empty', () => {
    expect(nextInt(createRng(1), 5, 2)).toBe(5);
  });

  it('produces a Gaussian with mean near 0 and variance near 1', () => {
    const rng = createRng(2026);
    const samples = Array.from({ length: 20000 }, () => gaussian(rng));
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance =
      samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      samples.length;

    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.1);
  });
});
