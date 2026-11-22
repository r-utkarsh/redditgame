/**
 * @file        src/server/adapters/devvitTracker.ts
 * @purpose     Implements the Tracker port as a no-op until Journeys telemetry is installed and allowlisted in P5.
 * @layer       server adapters
 * @keyFunctions
 *   - createDevvitTracker(): Tracker
 * @invariants  track never throws and never blocks a response; the game works with telemetry unavailable
 * @security    S17: no user id, body or coordinate is accepted by this port
 * @tests       tests/server/adapters.test.ts
 * @spec        05-devvit-facts.md telemetry mapping; P3-devvit-wiring.md step 5; P5
 */
import type { Tracker } from '../ports';

export function createDevvitTracker(): Tracker {
  return {
    async track() {
      // Journeys is unavailable until P5 and needs an allowlist. Intentionally empty.
    },
  };
}
