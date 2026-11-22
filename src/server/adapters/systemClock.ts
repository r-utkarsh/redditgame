/**
 * @file        src/server/adapters/systemClock.ts
 * @purpose     Implements the Clock port with the real system clock.
 * @layer       server adapters
 * @keyFunctions
 *   - createSystemClock(): Clock
 * @invariants  every call returns a fresh Date; no date is cached
 * @security    S11: the server clock is the only time source for puzzle dates
 * @tests       tests/server/adapters.test.ts
 * @spec        02-architecture-and-headers.md section 1; 04-security.md S11
 */
import type { Clock } from '../ports';

export function createSystemClock(): Clock {
  return {
    now() {
      return new Date();
    },
  };
}
