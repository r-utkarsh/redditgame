/**
 * @file        tests/shared/seismology.test.ts
 * @purpose     Proves the delay-distance round trip and monotonicity across the full map range.
 * @covers      src/shared/seismology.ts
 * @spec        01-spec.md section 1; 03-tdd-and-testing.md section 4
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  delaySeconds,
  distanceFromDelay,
} from '../../src/shared/seismology';

describe('seismology', () => {
  it('round-trips distance through delay for all d in [0, 1500]', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1500, noNaN: true }), (distance) => {
        const roundTrip = distanceFromDelay(delaySeconds(distance));
        return Math.abs(roundTrip - distance) <= 1e-9;
      })
    );
  });

  it('is monotonic increasing and starts at zero', () => {
    expect(delaySeconds(0)).toBe(0);
    expect(distanceFromDelay(0)).toBe(0);

    let previous = -1;
    for (let distance = 0; distance <= 1500; distance += 25) {
      const delay = delaySeconds(distance);
      expect(delay).toBeGreaterThan(previous);
      previous = delay;
    }
  });
});
