/**
 * @file        src/shared/seismology.ts
 * @purpose     Converts between S-P delay (seconds) and epicenter distance (km) using the game's fixed wave speeds.
 * @layer       shared (pure: no I/O, no clock, no randomness)
 * @keyFunctions
 *   - delaySeconds(distanceKm): number
 *   - distanceFromDelay(delayS): number
 * @invariants  distanceFromDelay(delaySeconds(d)) = d; both monotonic increasing
 * @security    none (pure math)
 * @tests       tests/shared/seismology.test.ts
 * @spec        01-spec.md section 1
 */
import { KM_PER_SECOND_OF_DELAY } from './constants';

export function delaySeconds(distanceKm: number): number {
  return distanceKm / KM_PER_SECOND_OF_DELAY;
}

export function distanceFromDelay(delayS: number): number {
  return delayS * KM_PER_SECOND_OF_DELAY;
}
