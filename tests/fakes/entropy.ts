/**
 * @file        tests/fakes/entropy.ts
 * @purpose     Fake EntropySource that returns a fixed seed sequence and records how many seeds were drawn.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; 04-security.md S19
 */
import type { EntropySource } from '../../src/server/ports';

export class FakeEntropy implements EntropySource {
  calls = 0;

  constructor(private readonly seeds: number[] = [123456]) {}

  nextSeed(): number {
    this.calls += 1;
    const seed = this.seeds.shift();
    if (seed === undefined) {
      throw new Error('fake entropy: no seeds left');
    }
    return seed;
  }
}
