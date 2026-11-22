/**
 * @file        tests/shared/splashState.test.ts
 * @purpose     Proves the splash state is decided from the post's puzzle date, server UTC time and that post's played flag.
 * @covers      src/shared/splashState.ts
 * @spec        F8 splash; user-required splash state rules; 04-security.md S11, S17
 */
import { describe, expect, it } from 'vitest';
import { getSplashState } from '../../src/shared/splashState';

const NOW = new Date('2026-11-22T12:00:00.000Z');

describe('getSplashState', () => {
  it("returns open for today's unplayed puzzle", () => {
    expect(getSplashState('2026-11-22', NOW, false)).toBe('open');
  });

  it("returns played when today's puzzle was played", () => {
    expect(getSplashState('2026-11-22', NOW, true)).toBe('played');
  });

  it('returns played when an old puzzle was played', () => {
    expect(getSplashState('2026-11-21', NOW, true)).toBe('played');
  });

  it('returns closed for an old puzzle that was never played', () => {
    expect(getSplashState('2026-11-21', NOW, false)).toBe('closed');
  });

  it('returns closed when the post has no mapped puzzle date', () => {
    expect(getSplashState(null, NOW, false)).toBe('closed');
  });

  it('changes at the server UTC midnight boundary', () => {
    expect(
      getSplashState('2026-11-22', new Date('2026-11-22T23:59:59.999Z'), false)
    ).toBe('open');
    expect(
      getSplashState('2026-11-22', new Date('2026-11-23T00:00:00.000Z'), false)
    ).toBe('closed');
  });
});
