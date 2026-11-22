/**
 * @file        tests/shared/crowd.test.ts
 * @purpose     Pins crowd bin clamping, median selection, ties and the percentile formula including small n.
 * @covers      src/shared/crowd.ts
 * @spec        01-spec.md sections 5 and 6; 03-tdd-and-testing.md section 4
 */
import { describe, expect, it } from 'vitest';
import {
  binIndex,
  medianFromBins,
  percentileFromBins,
} from '../../src/shared/crowd';

describe('binIndex', () => {
  it('clamps to the first and last bin', () => {
    expect(binIndex(0, 20, 50)).toBe(0);
    expect(binIndex(-5, 20, 50)).toBe(0);
    expect(binIndex(19.999, 20, 50)).toBe(0);
    expect(binIndex(20, 20, 50)).toBe(1);
    expect(binIndex(1000, 20, 50)).toBe(49);
    expect(binIndex(1000, 10, 100)).toBe(99);
  });
});

describe('medianFromBins', () => {
  it('returns null below the minimum player count', () => {
    expect(medianFromBins(new Map(), 10)).toBeNull();
    expect(medianFromBins(new Map([[10, 4]]), 10)).toBeNull();
  });

  it('returns the bin centre where the cumulative count first reaches half', () => {
    expect(medianFromBins(new Map([[10, 5]]), 10)).toBe(105);
    expect(medianFromBins(new Map([[0, 2], [1, 3]]), 10)).toBe(15);
    expect(medianFromBins(new Map([[0, 3], [1, 2]]), 10)).toBe(5);
  });

  it('ignores non-bin keys', () => {
    expect(
      medianFromBins(new Map<number, number>([[Number.NaN, 10], [3, 5]]), 10)
    ).toBe(35);
  });

  it('uses the player count for the halfway target when given', () => {
    expect(medianFromBins(new Map([[0, 3], [1, 2]]), 10, 10)).toBe(15);
    expect(medianFromBins(new Map([[10, 5]]), 10, 4)).toBeNull();
  });
});

describe('percentileFromBins', () => {
  it('returns null below the minimum player count', () => {
    expect(percentileFromBins(new Map([[10, 4]]), 100)).toBeNull();
  });

  it('uses lower bins plus half of the same-bin others', () => {
    expect(percentileFromBins(new Map([[10, 5]]), 100)).toBe(50);
    expect(percentileFromBins(new Map([[0, 1], [10, 4]]), 100)).toBe(63);
  });

  it('clamps to 0-100 and handles the top score bin', () => {
    expect(percentileFromBins(new Map([[10, 5]]), 0)).toBe(0);
    expect(percentileFromBins(new Map([[100, 5]]), 1000)).toBe(50);
    expect(percentileFromBins(new Map([[100, 5]]), 5000)).toBe(50);
  });
});
