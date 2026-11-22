/**
 * @file        src/server/core/redisKeys.ts
 * @purpose     Builds every Redis key and validates each token before it enters a key.
 * @layer       server core (pure: no I/O)
 * @keyFunctions
 *   - assertDateKey(dateKey): void
 *   - isValidUserId(userId): boolean
 *   - isValidPostId(postId): boolean
 *   - assertUserId(userId): void
 *   - assertPostId(postId): void
 *   - puzzleKey(dateKey): string
 *   - postKey(postId): string
 *   - dpostKey(dateKey): string
 *   - guessesKey(dateKey): string
 *   - cloudKey(dateKey): string
 *   - marginalXKey(dateKey): string
 *   - marginalYKey(dateKey): string
 *   - scoreHistogramKey(dateKey): string
 *   - streakKey(userId): string
 *   - rateLimitKey(bucket, userId, minute): string
 * @invariants  no other module concatenates a key; tokens are ASCII and colon-free; the rate-limit bucket is the limit class and minute is the absolute UTC minute
 * @security    S8: dateKey must be a real calendar day; userId and postId are 1-64 chars of [A-Za-z0-9_-]
 * @tests       tests/server/redisKeys.test.ts
 * @spec        01-spec.md section 6; 04-security.md S8; D-008
 */
import { isValidDateKey } from '../../shared/dates';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function assertDateKey(dateKey: string): void {
  if (!isValidDateKey(dateKey)) {
    throw new Error('invalid date key');
  }
}

export function isValidUserId(userId: string): boolean {
  return TOKEN_PATTERN.test(userId);
}

export function isValidPostId(postId: string): boolean {
  return TOKEN_PATTERN.test(postId);
}

export function assertUserId(userId: string): void {
  if (!isValidUserId(userId)) {
    throw new Error('invalid user id');
  }
}

export function assertPostId(postId: string): void {
  if (!isValidPostId(postId)) {
    throw new Error('invalid post id');
  }
}

export function puzzleKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `puz:${dateKey}`;
}

export function postKey(postId: string): string {
  assertPostId(postId);
  return `post:${postId}`;
}

export function dpostKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `dpost:${dateKey}`;
}

export function guessesKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `gs:${dateKey}`;
}

export function cloudKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `cloud:${dateKey}`;
}

export function marginalXKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `mx:${dateKey}`;
}

export function marginalYKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `my:${dateKey}`;
}

export function scoreHistogramKey(dateKey: string): string {
  assertDateKey(dateKey);
  return `sh:${dateKey}`;
}

export function streakKey(userId: string): string {
  assertUserId(userId);
  return `st:${userId}`;
}

export function rateLimitKey(
  bucket: number,
  userId: string,
  minute: number
): string {
  if (!Number.isInteger(bucket) || bucket < 0) {
    throw new Error('invalid rate limit bucket');
  }
  if (!Number.isInteger(minute) || minute < 0) {
    throw new Error('invalid rate limit minute');
  }
  assertUserId(userId);
  return `rl:${bucket}:${userId}:${minute}`;
}
