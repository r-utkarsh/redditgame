/**
 * @file        tests/fakes/logger.ts
 * @purpose     Fake Logger that records event names and status codes only.
 * @covers      src/server/ports.ts
 * @spec        03-tdd-and-testing.md section 2; 04-security.md S10
 */
import type { Logger } from '../../src/server/ports';

export type LogEntry = { level: 'info' | 'error'; event: string; status?: number };

export class FakeLogger implements Logger {
  readonly entries: LogEntry[] = [];

  info(event: string, status?: number): void {
    this.entries.push({ level: 'info', event, ...(status === undefined ? {} : { status }) });
  }

  error(event: string, status?: number): void {
    this.entries.push({ level: 'error', event, ...(status === undefined ? {} : { status }) });
  }
}
