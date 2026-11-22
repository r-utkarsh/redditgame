/**
 * @file        tests/server/errors.test.ts
 * @purpose     Proves the error type maps to the generic status and code matrix and hides unexpected details.
 * @covers      src/server/core/errors.ts
 * @spec        01-spec.md section 5 error matrix; 04-security.md S10
 */
import { describe, expect, it } from 'vitest';
import {
  AppError,
  badRequest,
  rateLimited,
  toErrorBody,
  toStatus,
  unavailable,
} from '../../src/server/core/errors';

describe('errors', () => {
  it('carries a status and a generic code', () => {
    const error = new AppError(410, 'puzzle_closed');

    expect(error.status).toBe(410);
    expect(error.code).toBe('puzzle_closed');
    expect(error.message).toBe('puzzle_closed');
  });

  it('offers the documented helpers', () => {
    expect(badRequest().status).toBe(400);
    expect(rateLimited(30).retryAfterS).toBe(30);
    expect(unavailable().status).toBe(503);
  });

  it('maps unknown errors to a generic 500 body without the message', () => {
    expect(toStatus(new Error('secret stack detail'))).toBe(500);
    expect(toErrorBody(new Error('secret stack detail'))).toEqual({
      error: 'internal',
    });
    expect(toErrorBody(new AppError(404, 'not_found'))).toEqual({
      error: 'not_found',
    });
  });
});
