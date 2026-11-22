/**
 * @file        src/client/game.ts
 * @purpose     Boots the expanded game: loads the puzzle, wires pin input, locks one guess and shows the single result card.
 * @layer       client (thin DOM entry; documented coverage exclusion)
 * @keyFunctions
 *   - bootGame(doc?): Promise<void>
 * @invariants  one guess per document; locked state ignores further input; no score or streak is stored in the browser
 * @security    S3, S9, S15: the client sends only {x,y}, writes textContent only, and calls /api only
 * @tests       none (thin DOM glue; state and view logic are tested in tests/client)
 * @spec        P4-client.md; 06-design-and-ux.md; D-027
 */
import { MAP_SIZE_KM } from '../shared/constants';
import type {
  ClosedPuzzle,
  Point,
  PuzzleOpenPayload,
  PuzzlePayload,
  ResultsPayload,
  Streak,
} from '../shared/types';
import { createApi } from './api';
import type { ApiErrorInfo } from './api';
import { attachPinInput } from './input/pin';
import type { LoupeInput } from './input/pin';
import { createRenderer } from './render/scene';
import type { SceneState } from './render/scene';
import {
  attachGuess,
  canLockIn,
  currentPin,
  initialState,
  lockIn,
  placePin,
  showResults,
  startPuzzle,
} from './state';
import type { GameState } from './state';
import { formatCountdown, formatDateKey, formatCoordinates, formatSplashStreak, shareText } from './view/format';
import { mapRect } from './view/layout';
import { resultAria } from './view/result';
import type { ResultView } from './view/result';
import { renderStationChips, setStatus } from './ui/items';
import { createOverlay } from './ui/overlay';
import { createResultCard } from './ui/resultCard';
import { applyTheme } from './ui/theme';
import type { WaveState } from './render/waves';

const ONBOARDING_ORIGIN: Point = {
  x: MAP_SIZE_KM * 0.3,
  y: MAP_SIZE_KM * 0.38,
};
const ONBOARDING_MS = 3000;
const REPLAY_MS = 2600;
const RETRY_FALLBACK_S = 30;

type Animation = {
  kind: 'onboarding' | 'replay';
  origin: Point;
  startedAt: number;
  durationMs: number;
};

export async function bootGame(doc: Document = document): Promise<void> {
  applyTheme(doc.documentElement);

  const gameRootNode = doc.getElementById('game-root');
  const canvasNode = doc.getElementById('map-canvas');
  const dateEl = doc.getElementById('game-date');
  const streakEl = doc.getElementById('game-streak');
  const hintEl = doc.getElementById('game-hint');
  const chipsEl = doc.getElementById('station-chips');
  const lockEl = doc.getElementById('lock-button');
  const statusEl = doc.getElementById('game-status');
  const resultEl = doc.getElementById('result-card');
  const overlayEl = doc.getElementById('overlay');

  if (
    !gameRootNode ||
    !(canvasNode instanceof HTMLCanvasElement) ||
    !dateEl ||
    !streakEl ||
    !hintEl ||
    !chipsEl ||
    !(lockEl instanceof HTMLButtonElement) ||
    !statusEl ||
    !resultEl ||
    !overlayEl
  ) {
    return;
  }

  const gameRoot = gameRootNode;
  const canvas = canvasNode;
  const dateNode = dateEl;
  const streakNode = streakEl;
  const hintNode = hintEl;
  const chipsNode = chipsEl;
  const lockNode = lockEl;
  const statusNode = statusEl;
  const resultRoot = resultEl;
  const overlayRoot = overlayEl;

  const api = createApi();
  const renderer = createRenderer(canvas);
  const overlay = createOverlay(overlayRoot);
  const resultCard = createResultCard(resultRoot, () => {
    void shareResult();
  });

  let state: GameState = initialState();
  let loupe: LoupeInput | null = null;
  let waves: WaveState | null = null;
  let animation: Animation | null = null;
  let frameId: number | null = null;
  let retryTimer: number | null = null;
  let onboardingTimer: number | null = null;
  let onboardingDone = false;
  let sending = false;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;

  motionQuery.addEventListener('change', (event) => {
    reducedMotion = event.matches;
  });

  function viewport(): { width: number; height: number } {
    return {
      width: canvas.clientWidth || window.innerWidth,
      height: canvas.clientHeight || window.innerHeight,
    };
  }

  function mode(): 'play' | 'result' {
    return state.phase === 'results' ? 'result' : 'play';
  }

  function rect() {
    const { width, height } = viewport();
    return mapRect(width, height, mode());
  }

  function mapSizeKm(): number {
    if (state.phase === 'playing' || state.phase === 'locked') {
      return state.puzzle.mapSizeKm;
    }
    if (state.phase === 'results') {
      return state.results.mapSizeKm;
    }
    return MAP_SIZE_KM;
  }

  function scene(): SceneState {
    let stations: PuzzleOpenPayload['stations'] = [];
    let fault: Point[] | null = null;
    let results: ResultsPayload | undefined;

    if (state.phase === 'playing' || state.phase === 'locked') {
      stations = state.puzzle.stations;
      fault = state.puzzle.fault;
      results = undefined;
    } else if (state.phase === 'results') {
      stations = state.results.stations;
      fault = state.results.fault;
      results = state.results;
    }

    return {
      mode: mode(),
      rect: rect(),
      mapSizeKm: mapSizeKm(),
      stations,
      fault,
      pin: currentPin(state),
      results,
      waves,
      loupe: state.phase === 'playing' ? loupe : null,
    };
  }

  function render(): void {
    renderer.draw(scene());
  }

  function clearRetryTimer(): void {
    if (retryTimer !== null) {
      window.clearInterval(retryTimer);
      retryTimer = null;
    }
  }

  function clearOnboardingTimer(): void {
    if (onboardingTimer !== null) {
      window.clearTimeout(onboardingTimer);
      onboardingTimer = null;
    }
  }

  function announce(text: string): void {
    setStatus(statusNode as HTMLElement, text);
  }

  function syncUi(): void {
    gameRoot.classList.toggle('is-result', state.phase === 'results');

    let dateKey: string | null = null;
    let streak: Streak | null = null;
    let stations: PuzzleOpenPayload['stations'] = [];

    if (state.phase === 'playing' || state.phase === 'locked') {
      dateKey = state.puzzle.dateKey;
      streak = state.puzzle.streak;
      stations = state.puzzle.stations;
    } else if (state.phase === 'results') {
      dateKey = state.dateKey;
      streak = state.streak;
      stations = state.results.stations;
    } else if (state.phase === 'closed') {
      dateKey = state.puzzle.dateKey;
      streak = state.puzzle.streak;
    }

    dateNode.textContent = dateKey ? formatDateKey(dateKey) : '';
    streakNode.textContent = streak ? formatSplashStreak(streak.current) : '';
    renderStationChips(chipsNode, stations);

    lockNode.textContent =
      sending || state.phase === 'locked' ? 'Locking in...' : 'Lock in';
    lockNode.disabled = !canLockIn(state) || sending;

    const showHint =
      state.phase === 'playing' && !state.moved && !onboardingDone;
    hintNode.hidden = !showHint;
  }

  function stopAnimation(): void {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    animation = null;
  }

  function finishOnboarding(): void {
    if (onboardingDone) {
      return;
    }
    onboardingDone = true;
    clearOnboardingTimer();
    stopAnimation();
    waves = null;
    syncUi();
    render();
  }

  function step(now: number): void {
    if (!animation) {
      frameId = null;
      return;
    }

    const progress = Math.min(
      1,
      Math.max(0, (now - animation.startedAt) / animation.durationMs)
    );
    waves = {
      origin: animation.origin,
      progress,
      reducedMotion: false,
    };
    render();

    if (progress < 1) {
      frameId = window.requestAnimationFrame(step);
      return;
    }

    const kind = animation.kind;
    animation = null;
    frameId = null;

    if (kind === 'onboarding') {
      onboardingDone = true;
      waves = null;
      syncUi();
      render();
      return;
    }

    waves = null;
    render();
  }

  function startAnimation(
    kind: Animation['kind'],
    origin: Point,
    durationMs: number
  ): void {
    stopAnimation();
    waves = { origin, progress: 0, reducedMotion: false };
    render();

    if (reducedMotion) {
      waves = { origin, progress: 1, reducedMotion: true };
      render();
      if (kind === 'onboarding') {
        clearOnboardingTimer();
        onboardingTimer = window.setTimeout(() => {
          onboardingDone = true;
          waves = null;
          syncUi();
          render();
        }, ONBOARDING_MS);
      }
      return;
    }

    animation = {
      kind,
      origin,
      startedAt: window.performance.now(),
      durationMs,
    };
    frameId = window.requestAnimationFrame(step);
  }

  function startOnboarding(): void {
    onboardingDone = false;
    syncUi();
    startAnimation('onboarding', ONBOARDING_ORIGIN, ONBOARDING_MS);
  }

  function startReplay(truth: Point): void {
    startAnimation('replay', truth, REPLAY_MS);
  }

  function closedPayload(): ClosedPuzzle | null {
    if (state.phase === 'playing' || state.phase === 'locked') {
      return {
        status: 'closed',
        splashState: 'closed',
        dateKey: state.puzzle.dateKey,
        alreadyGuessed: true,
        streak: state.puzzle.streak,
      };
    }
    if (state.phase === 'closed') {
      return state.puzzle;
    }
    return null;
  }

  function showClosed(): void {
    const payload = closedPayload();
    if (!payload) {
      return;
    }
    stopAnimation();
    clearRetryTimer();
    state = startPuzzle(initialState(), payload);
    syncUi();
    render();
    overlay.show({ message: 'This puzzle has closed.' });
    announce('This puzzle has closed.');
  }

  function showError(error: ApiErrorInfo, retry: () => void): void {
    clearRetryTimer();

    if (
      error.kind === 'http' &&
      (error.status === 410 || error.status === 403)
    ) {
      const payload = closedPayload();
      if (payload) {
        showClosed();
      } else {
        overlay.show({ message: 'This puzzle has closed.' });
      }
      return;
    }

    if (error.kind === 'http' && error.status === 429) {
      let remaining = Math.max(
        1,
        error.retryAfterS ?? RETRY_FALLBACK_S
      );
      overlay.show({
        message: formatCountdown(remaining),
        retryLabel: 'Retry',
        retryDisabled: true,
        onRetry: () => {
          clearRetryTimer();
          retry();
        },
      });
      retryTimer = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearRetryTimer();
          overlay.setMessage(formatCountdown(0));
          overlay.setRetryEnabled(true);
        } else {
          overlay.setMessage(formatCountdown(remaining));
        }
      }, 1000);
      return;
    }

    overlay.show({
      message:
        error.kind === 'network'
          ? 'Connection lost. Try again.'
          : 'Seismographs warming up. Try again.',
      retryLabel: 'Retry',
      onRetry: () => {
        clearRetryTimer();
        retry();
      },
    });
  }

  async function loadResults(
    dateKey: string,
    streak: Streak,
    returning: boolean
  ): Promise<boolean> {
    clearRetryTimer();
    overlay.hide();

    const response = await api.getResults();
    if (response.ok) {
      const view: ResultView = {
        results: response.data,
        streak,
        dateKey,
      };
      state = showResults(state, view);
      resultCard.show(view);
      syncUi();
      render();
      announce(resultAria(response.data));
      startReplay(response.data.truth);
      return true;
    }

    if (returning) {
      showError(response.error, () => {
        void loadResults(dateKey, streak, true);
      });
      return false;
    }

    showError(response.error, () => {
      void loadResults(dateKey, streak, false);
    });
    return false;
  }

  async function sendGuess(pin: Point): Promise<void> {
    if (sending) {
      return;
    }

    clearRetryTimer();
    overlay.hide();
    sending = true;
    syncUi();

    const response = await api.postGuess(pin);
    sending = false;
    syncUi();

    if (response.ok) {
      if (state.phase === 'locked') {
        state = attachGuess(state, response.data);
      }
      if (state.phase === 'locked') {
        await loadResults(
          state.puzzle.dateKey,
          response.data.streak,
          false
        );
      }
      return;
    }

    if (response.error.kind === 'http' && response.error.status === 409) {
      if (state.phase === 'locked') {
        await loadResults(
          state.puzzle.dateKey,
          state.puzzle.streak,
          true
        );
      }
      return;
    }

    if (response.error.kind === 'http' && response.error.status === 410) {
      showClosed();
      return;
    }

    showError(response.error, () => {
      void sendGuess(pin);
    });
  }

  async function submitGuess(): Promise<void> {
    if (state.phase !== 'playing' || state.pin === null || sending) {
      return;
    }

    state = lockIn(state);
    const pin = currentPin(state);
    syncUi();
    render();
    announce('Locked in. Scoring your pin.');
    finishOnboarding();

    if (pin) {
      await sendGuess(pin);
    }
  }

  async function loadPuzzle(): Promise<void> {
    clearRetryTimer();
    stopAnimation();
    waves = null;
    loupe = null;
    resultCard.hide();
    overlay.hide();
    gameRoot.classList.remove('is-result');
    announce('Reading the seismographs...');

    const response = await api.getPuzzle();
    if (!response.ok) {
      showError(response.error, () => {
        void loadPuzzle();
      });
      return;
    }

    const payload: PuzzlePayload = response.data;
    state = startPuzzle(initialState(), payload);
    syncUi();
    render();

    if (payload.status === 'closed') {
      if (payload.alreadyGuessed && payload.dateKey) {
        await loadResults(payload.dateKey, payload.streak, true);
        return;
      }
      overlay.show({ message: 'This puzzle has closed.' });
      announce('This puzzle has closed.');
      return;
    }

    if (payload.alreadyGuessed) {
      await loadResults(payload.dateKey, payload.streak, true);
      return;
    }

    announce('');
    startOnboarding();
  }

  async function shareResult(): Promise<void> {
    if (state.phase !== 'results') {
      return;
    }

    const text = shareText({
      dateKey: state.dateKey,
      stars: state.results.you.stars,
      errorKm: state.results.you.errorKm,
      percentile: state.results.percentile,
    });

    try {
      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await clipboard.writeText(text);
      resultCard.setShareStatus('Copied. Paste it anywhere.');
    } catch {
      resultCard.showShareText(text);
      resultCard.setShareStatus('Select the text above to copy.');
    }
  }

  function onPlace(point: Point): void {
    if (state.phase !== 'playing') {
      return;
    }
    state = placePin(state, point, state.puzzle.mapSizeKm);
    syncUi();
    render();
  }

  function onCommit(): void {
    if (state.phase !== 'playing' || state.pin === null) {
      return;
    }
    announce(`Pin placed at ${formatCoordinates(state.pin)}`);
    finishOnboarding();
  }

  lockNode.addEventListener('click', () => {
    void submitGuess();
  });

  attachPinInput({
    canvas,
    getRect: rect,
    getMapSizeKm: mapSizeKm,
    getPin: () => currentPin(state),
    canEdit: () => state.phase === 'playing' && !sending,
    onPlace,
    onCommit,
    onLoupe: (next) => {
      loupe = next;
      render();
    },
  });

  window.addEventListener('resize', () => {
    loupe = null;
    render();
  });

  syncUi();
  render();
  await loadPuzzle();
}

void bootGame();
