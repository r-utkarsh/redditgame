/**
 * @file        src/server/core/telemetry.ts
 * @purpose     Maps committed game actions to the approved Journey events and forwards them through the Tracker port.
 * @layer       server core
 * @keyFunctions
 *   - TrackerDeps
 *   - trackEvent(deps, event): Promise<void>
 *   - appReadyEvent()
 *   - guessSubmittedEvent()
 *   - streakExtendedEvent()
 *   - resultsViewedEvent(stars, score)
 * @invariants  events carry no user id, coordinates or timestamps; a tracker failure is logged and never fails a request
 * @security    S17: the event payload is a fixed shape with no personal data; S10: failures are logged by name only
 * @tests       tests/server/telemetry.test.ts
 * @spec        05-devvit-facts.md telemetry mapping; P5-reddit-native.md step 3
 */
import type { Logger, Tracker, TrackerEvent } from '../ports';

export type TrackerDeps = {
  tracker: Tracker;
  logger: Logger;
};

export async function trackEvent(
  deps: TrackerDeps,
  event: TrackerEvent
): Promise<void> {
  try {
    await deps.tracker.track(event);
  } catch {
    deps.logger.error('telemetry_failed');
  }
}

export function appReadyEvent(): TrackerEvent {
  return { name: 'App.Ready' };
}

export function guessSubmittedEvent(): TrackerEvent {
  return {
    name: 'Journey.Progress',
    progress: 1,
    action: 'guess_submitted',
  };
}

export function streakExtendedEvent(): TrackerEvent {
  return { name: 'Journey.Interaction', action: 'streak_extended' };
}

export function resultsViewedEvent(stars: number, score: number): TrackerEvent {
  const fraction = Math.round((score / 1000) * 100) / 100;
  return {
    name: 'Journey.End',
    complete: true,
    win: stars >= 1,
    score: fraction,
  };
}
