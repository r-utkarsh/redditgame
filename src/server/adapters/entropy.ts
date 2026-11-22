/**
 * @file        src/server/adapters/entropy.ts
 * @purpose     Implements the EntropySource port with the platform's secure random integer generator.
 * @layer       server adapters
 * @keyFunctions
 *   - createEntropy(): EntropySource
 * @invariants  every seed is an integer in [0, 2^32); no seed is derived from the date or from Math.random
 * @security    S19: the puzzle seed comes only from this source and never leaves the server
 * @tests       tests/server/adapters.test.ts
 * @spec        02-architecture-and-headers.md section 1; 04-security.md S19
 */
import { randomInt } from 'node:crypto';
import type { EntropySource } from '../ports';

const SEED_RANGE = 2 ** 32;

export function createEntropy(): EntropySource {
  return {
    nextSeed() {
      return randomInt(0, SEED_RANGE);
    },
  };
}
