/**
 * @file        src/shared/rng.ts
 * @purpose     Provides a seeded integer PRNG and a Box-Muller Gaussian so puzzles are deterministic and reproducible.
 * @layer       shared (pure: no I/O, no clock, no Math.random)
 * @keyFunctions
 *   - createRng(seed): Rng
 *   - nextFloat(rng): number
 *   - nextInt(rng, minInclusive, maxInclusive): number
 *   - gaussian(rng): number
 * @invariants  the same seed always yields the same stream on one JS engine; nextFloat is in [0, 1)
 * @security    none (generator internals)
 * @tests       tests/shared/rng.test.ts
 * @spec        01-spec.md section 4 step 4; 03-tdd-and-testing.md section 4
 */
export type Rng = { state: number };

/** mulberry32: a small, fast, deterministic 32-bit PRNG. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let value = rng.state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  const range = Math.floor(maxInclusive) - Math.ceil(minInclusive) + 1;
  if (range <= 0) {
    return Math.ceil(minInclusive);
  }
  return Math.ceil(minInclusive) + Math.floor(nextFloat(rng) * range);
}

export function gaussian(rng: Rng): number {
  const u1 = 1 - nextFloat(rng);
  const u2 = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
