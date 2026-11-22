/**
 * @file        tests/server/logger.test.ts
 * @purpose     Proves the logger records only event names and status codes.
 * @covers      src/server/core/logger.ts
 * @spec        04-security.md S10; 03-tdd-and-testing.md section 5b
 */
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/server/core/logger';

describe('createLogger', () => {
  it('writes the event name and status to the sink', () => {
    const log = vi.fn();
    const error = vi.fn();
    const logger = createLogger({ log, error });

    logger.info('puzzle_open', 200);
    logger.error('store_failed', 503);

    expect(log).toHaveBeenCalledWith('event=puzzle_open status=200');
    expect(error).toHaveBeenCalledWith('event=store_failed status=503');
  });

  it('omits the status when none is given', () => {
    const log = vi.fn();
    const logger = createLogger({ log, error: vi.fn() });

    logger.info('server_started');

    expect(log).toHaveBeenCalledWith('event=server_started');
  });
});
