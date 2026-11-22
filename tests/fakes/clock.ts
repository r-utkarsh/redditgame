/**
 * @file        tests/fakes/clock.ts
 * @purpose     Mutable fake Clock for deterministic UTC midnight tests.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; 04-security.md S11
 */
import type { Clock } from '../../src/server/ports';

export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
