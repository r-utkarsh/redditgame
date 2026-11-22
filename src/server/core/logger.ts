/**
 * @file        src/server/core/logger.ts
 * @purpose     Writes event names and status codes only, never user ids, bodies or stack traces.
 * @layer       server core (logging sink wrapper)
 * @keyFunctions
 *   - createLogger(sink?): Logger
 * @invariants  the output line contains an event and an optional status, nothing else
 * @security    S10: no user ids, request bodies or error messages are logged
 * @tests       tests/server/logger.test.ts
 * @spec        04-security.md S10; 03-tdd-and-testing.md section 5b
 */
import type { Logger } from '../ports';

export type LogSink = {
  log(message: string): void;
  error(message: string): void;
};

function format(event: string, status?: number): string {
  return status === undefined
    ? `event=${event}`
    : `event=${event} status=${status}`;
}

export function createLogger(sink: LogSink = console): Logger {
  return {
    info(event, status) {
      sink.log(format(event, status));
    },
    error(event, status) {
      sink.error(format(event, status));
    },
  };
}
