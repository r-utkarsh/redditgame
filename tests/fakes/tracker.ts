/**
 * @file        tests/fakes/tracker.ts
 * @purpose     Fake Tracker that records event names and actions for assertions.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; 04-security.md S10
 */
import type { Tracker, TrackerEvent } from '../../src/server/ports';

export class FakeTracker implements Tracker {
  readonly events: TrackerEvent[] = [];

  async track(event: TrackerEvent): Promise<void> {
    this.events.push({ ...event });
  }
}
