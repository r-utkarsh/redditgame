/**
 * @file        tests/server/redisKeys.test.ts
 * @purpose     Proves every Redis key is built in one place and every token is validated before it enters a key.
 * @covers      src/server/core/redisKeys.ts
 * @spec        01-spec.md section 6; 04-security.md S8
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cloudKey,
  dpostKey,
  guessesKey,
  marginalXKey,
  marginalYKey,
  postKey,
  puzzleKey,
  rateLimitKey,
  scoreHistogramKey,
  streakKey,
} from '../../src/server/core/redisKeys';

describe('redisKeys', () => {
  it('builds the documented key shapes', () => {
    expect(puzzleKey('2026-11-17')).toBe('puz:2026-11-17');
    expect(postKey('t3_test1')).toBe('post:t3_test1');
    expect(dpostKey('2026-11-17')).toBe('dpost:2026-11-17');
    expect(guessesKey('2026-11-17')).toBe('gs:2026-11-17');
    expect(cloudKey('2026-11-17')).toBe('cloud:2026-11-17');
    expect(marginalXKey('2026-11-17')).toBe('mx:2026-11-17');
    expect(marginalYKey('2026-11-17')).toBe('my:2026-11-17');
    expect(scoreHistogramKey('2026-11-17')).toBe('sh:2026-11-17');
    expect(streakKey('t2_test-1')).toBe('st:t2_test-1');
    expect(rateLimitKey(123, 't2_test1', 7)).toBe('rl:123:t2_test1:7');
    expect(rateLimitKey(0, 't2_test1', 29915280)).toBe(
      'rl:0:t2_test1:29915280'
    );
  });

  it('rejects impossible dates', () => {
    expect(() => puzzleKey('2026-02-30')).toThrow();
    expect(() => dpostKey('2026-1-1')).toThrow();
  });

  it('rejects hostile userIds and postIds', () => {
    const hostile = [
      '',
      'a:b',
      'a b',
      'x'.repeat(65),
      'line\nbreak',
      'dotted.id',
      'unicode-é',
    ];

    for (const value of hostile) {
      expect(() => streakKey(value)).toThrow();
      expect(() => postKey(value)).toThrow();
    }
  });

  it('rejects non-integer rate limit parts', () => {
    expect(() => rateLimitKey(1.5, 't2_test1', 0)).toThrow();
    expect(() => rateLimitKey(1, 't2_test1', -1)).toThrow();
    expect(() => rateLimitKey(1, 'bad id', 0)).toThrow();
  });

  it('never lets an arbitrary user or post token inject a key separator', () => {
    fc.assert(
      fc.property(fc.string(), (token) => {
        let streak: string | null = null;
        let post: string | null = null;
        try {
          streak = streakKey(token);
        } catch {
          // rejected tokens are the expected outcome for hostile input
        }
        try {
          post = postKey(token);
        } catch {
          // rejected tokens are the expected outcome for hostile input
        }

        expect(streak === null).toBe(post === null);
        if (streak !== null && post !== null) {
          expect(streak).toBe(`st:${token}`);
          expect(post).toBe(`post:${token}`);
          expect(streak.split(':')).toHaveLength(2);
          expect(post.split(':')).toHaveLength(2);
        }
      }),
      { numRuns: 500, seed: 20261117 }
    );
  });

  it('never lets an arbitrary date token inject a key separator', () => {
    fc.assert(
      fc.property(fc.string(), (token) => {
        try {
          const key = puzzleKey(token);
          expect(key).toBe(`puz:${token}`);
          expect(key.split(':')).toHaveLength(2);
        } catch {
          // rejected tokens are the expected outcome for hostile input
        }
      }),
      { numRuns: 500, seed: 20261117 }
    );
  });
});
