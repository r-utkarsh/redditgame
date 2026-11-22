/**
 * @file        src/client/splash.ts
 * @purpose     Boots the inline splash: loads the puzzle, shows the UTC date, streak and one entry button.
 * @layer       client (thin DOM entry; documented coverage exclusion)
 * @keyFunctions
 *   - bootSplash(doc?): Promise<void>
 * @invariants  one button only; closed and never played shows no button; no score or streak is stored in the browser
 * @security    S9: textContent and DOM APIs only; S15: calls /api only, never /internal
 * @tests       none (thin DOM glue; copy and state are tested in tests/client)
 * @spec        06-design-and-ux.md entry flow; P4-client.md step 7; D-027
 */
import { requestExpandedMode } from '@devvit/web/client';
import type { PuzzlePayload } from '../shared/types';
import type { SplashState } from '../shared/splashState';
import { createApi } from './api';
import type { ApiErrorInfo } from './api';
import { drawSplashArt } from './render/splashArt';
import {
  formatBest,
  formatCompactDateKey,
  formatCountdown,
  formatSplashStreak,
} from './view/format';
import { setStatus } from './ui/items';
import { applyTheme } from './ui/theme';

type Mode = 'loading' | 'play' | 'retry';

export async function bootSplash(doc: Document = document): Promise<void> {
  applyTheme(doc.documentElement);

  const rootNode = doc.getElementById('splash-root');
  const cardNode = doc.getElementById('splash-card');
  const eyebrowNode = doc.getElementById('splash-eyebrow');
  const artNode = doc.getElementById('splash-art');
  const streakNode = doc.getElementById('splash-streak');
  const separatorNode = doc.getElementById('splash-separator');
  const bestNode = doc.getElementById('splash-best');
  const buttonNode = doc.getElementById('play-button');
  const statusNode = doc.getElementById('splash-status');

  if (
    !rootNode ||
    !cardNode ||
    !eyebrowNode ||
    !(artNode instanceof HTMLCanvasElement) ||
    !streakNode ||
    !separatorNode ||
    !bestNode ||
    !(buttonNode instanceof HTMLButtonElement) ||
    !statusNode
  ) {
    return;
  }

  const root = rootNode;
  const card = cardNode;
  const eyebrow = eyebrowNode;
  const art = artNode;
  const streak = streakNode;
  const separator = separatorNode;
  const best = bestNode;
  const button = buttonNode;
  const status = statusNode;

  const api = createApi();
  let payload: PuzzlePayload | null = null;
  let mode: Mode = 'loading';
  let timer: number | null = null;
  let splashState: SplashState = 'open';

  function drawArt(state?: SplashState): void {
    if (state !== undefined) {
      splashState = state;
    }
    drawSplashArt(art, splashState);
  }

  function clearTimer(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function showButton(label: string | null, disabled = false): void {
    if (label === null) {
      button.hidden = true;
      button.disabled = true;
      return;
    }
    button.hidden = false;
    button.disabled = disabled;
    button.textContent = label;
  }

  function setMode(next: Mode): void {
    mode = next;
    button.dataset.mode = next;
  }

  function retryAfter(error: ApiErrorInfo): number {
    return error.kind === 'http' && error.status === 429
      ? Math.max(1, error.retryAfterS ?? 30)
      : 0;
  }

  function fail(error: ApiErrorInfo): void {
    clearTimer();
    setMode('retry');
    card.setAttribute('aria-busy', 'false');

    if (error.kind === 'network') {
      setStatus(status, 'Connection lost. Try again.');
      showButton('Retry');
      return;
    }

    const seconds = retryAfter(error);
    if (seconds > 0) {
      let remaining = seconds;
      setStatus(status, formatCountdown(remaining));
      showButton('Retry', true);
      timer = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearTimer();
          setStatus(status, '');
          showButton('Retry', false);
        } else {
          setStatus(status, formatCountdown(remaining));
        }
      }, 1000);
      return;
    }

    setStatus(status, 'Seismographs warming up. Try again.');
    showButton('Retry');
  }

  function succeed(next: PuzzlePayload): void {
    clearTimer();
    payload = next;
    card.setAttribute('aria-busy', 'false');
    eyebrow.textContent = next.dateKey
      ? `Fault Lines • ${formatCompactDateKey(next.dateKey)}`
      : 'Fault Lines';
    streak.textContent = formatSplashStreak(next.streak.current);
    best.textContent = formatBest(next.streak.best);
    best.hidden = best.textContent === '';
    separator.hidden = best.hidden;

    if (next.status === 'open') {
      drawArt(next.splashState);
      setStatus(status, '');
      setMode('play');
      showButton(next.splashState === 'open' ? 'Play' : 'See your result');
      return;
    }

    drawArt(next.splashState);
    setStatus(status, next.splashState === 'closed' ? 'Puzzle closed' : '');
    setMode('play');
    showButton('See result');
  }

  async function load(): Promise<void> {
    clearTimer();
    setMode('loading');
    card.setAttribute('aria-busy', 'true');
    showButton(null);
    setStatus(status, 'Reading the seismographs...');

    const response = await api.getPuzzle();
    if (response.ok) {
      succeed(response.data);
    } else {
      fail(response.error);
    }
  }

  button.addEventListener('click', (event) => {
    if (mode === 'retry') {
      void load();
      return;
    }
    if (mode !== 'play' || !payload) {
      return;
    }

    try {
      requestExpandedMode(event as MouseEvent, 'game');
    } catch {
      setStatus(status, 'Could not open the map. Try again.');
    }
  });

  window.addEventListener('resize', () => drawArt());

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => drawArt());
    observer.observe(art);
  }

  drawArt();
  await load();
  root.dataset.ready = 'true';
}

void bootSplash();
