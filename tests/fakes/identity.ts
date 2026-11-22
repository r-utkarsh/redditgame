/**
 * @file        tests/fakes/identity.ts
 * @purpose     Fake Identity that returns a scripted user and post id, or null for a missing identity.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; 04-security.md S4
 */
import type { Identity, IdentityValue } from '../../src/server/ports';

export class FakeIdentity implements Identity {
  constructor(private value: IdentityValue | null = null) {}

  set(value: IdentityValue | null): void {
    this.value = value;
  }

  async get(): Promise<IdentityValue | null> {
    return this.value ? { ...this.value } : null;
  }
}
