/**
 * @file        src/server/core/errors.ts
 * @purpose     Defines the generic API error type, the documented error codes and safe body mapping.
 * @layer       server core (pure: no I/O)
 * @keyFunctions
 *   - AppError
 *   - ErrorCode
 *   - badRequest(): AppError
 *   - unauthorized(): AppError
 *   - forbidden(): AppError
 *   - notFound(): AppError
 *   - methodNotAllowed(): AppError
 *   - alreadyGuessed(): AppError
 *   - puzzleClosed(): AppError
 *   - payloadTooLarge(): AppError
 *   - unsupportedMediaType(): AppError
 *   - rateLimited(retryAfterS): AppError
 *   - unavailable(): AppError
 *   - toStatus(error): number
 *   - toErrorBody(error): ApiError
 * @invariants  unknown errors always map to 500 internal; messages never reach the client
 * @security    S10: generic error bodies, no stack traces or internal messages
 * @tests       tests/server/errors.test.ts
 * @spec        01-spec.md section 5 error matrix
 */
import type { ApiError } from '../../shared/types';

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'already_guessed'
  | 'puzzle_closed'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'internal'
  | 'unavailable';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly retryAfterS?: number
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export function badRequest(): AppError {
  return new AppError(400, 'bad_request');
}

export function unauthorized(): AppError {
  return new AppError(401, 'unauthorized');
}

export function forbidden(): AppError {
  return new AppError(403, 'forbidden');
}

export function notFound(): AppError {
  return new AppError(404, 'not_found');
}

export function methodNotAllowed(): AppError {
  return new AppError(405, 'method_not_allowed');
}

export function alreadyGuessed(): AppError {
  return new AppError(409, 'already_guessed');
}

export function puzzleClosed(): AppError {
  return new AppError(410, 'puzzle_closed');
}

export function payloadTooLarge(): AppError {
  return new AppError(413, 'payload_too_large');
}

export function unsupportedMediaType(): AppError {
  return new AppError(415, 'unsupported_media_type');
}

export function rateLimited(retryAfterS: number): AppError {
  return new AppError(429, 'rate_limited', retryAfterS);
}

export function unavailable(): AppError {
  return new AppError(503, 'unavailable');
}

export function toStatus(error: unknown): number {
  return error instanceof AppError ? error.status : 500;
}

export function toErrorBody(error: unknown): ApiError {
  return {
    error: error instanceof AppError ? error.code : 'internal',
  };
}
