/**
 * @file        src/shared/splashState.ts
 * @purpose     Decides the server-authoritative splash layout from a post puzzle date and played flag.
 * @layer       shared (pure: no I/O, no clock reads, no randomness)
 * @keyFunctions
 *   - SplashState
 *   - getSplashState(postPuzzleDate, nowUtc, userHasPlayedThatPuzzle): SplashState
 * @invariants  the browser cannot determine closure; played always wins over closed; null or non-today dates are closed when unplayed
 * @security    S11: callers provide the server clock; S17: no identity or personal data enters the decision
 * @tests       tests/shared/splashState.test.ts
 * @spec        F8 splash; user-required splash state rules; 04-security.md S11, S17
 */
import { toDateKey } from './dates';

export type SplashState = 'open' | 'played' | 'closed';

export function getSplashState(
  postPuzzleDate: string | null,
  nowUtc: Date,
  userHasPlayedThatPuzzle: boolean
): SplashState {
  if (userHasPlayedThatPuzzle) {
    return 'played';
  }

  if (postPuzzleDate !== null && postPuzzleDate === toDateKey(nowUtc)) {
    return 'open';
  }

  return 'closed';
}
