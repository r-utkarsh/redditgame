/**
 * @file        src/client/input/pin.ts
 * @purpose     Turns pointer, touch and arrow-key input on the canvas into clamped pin placements and loupe state.
 * @layer       client input (DOM: documented coverage exclusion)
 * @keyFunctions
 *   - attachPinInput(options): () => void
 * @invariants  no pin exists until the first tap, click or arrow key; the first arrow places at the centre; Enter and Space never lock in
 * @security    S5: input becomes a clamped, quantized point only; no HTML is written
 * @tests       none (DOM listener exclusion; point math is tested in tests/client/viewPin.test.ts)
 * @spec        P4-client.md step 4; 06-design-and-ux.md playing and keyboard
 */
import type { Point } from '../../shared/types';
import { centerPoint, isInsideRect, loupeCenter, nudgePoint, pointFromCanvas } from '../view/pin';
import type { LoupeCenter, Rect } from '../view/pin';

export type LoupeInput = {
  point: Point;
  center: LoupeCenter;
  screenPoint: Point;
};

export type PinInputOptions = {
  canvas: HTMLCanvasElement;
  getRect(): Rect;
  getMapSizeKm(): number;
  getPin(): Point | null;
  canEdit(): boolean;
  onPlace(point: Point): void;
  onCommit(): void;
  onLoupe(state: LoupeInput | null): void;
};

function eventPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent
): Point {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

export function attachPinInput(options: PinInputOptions): () => void {
  const { canvas } = options;
  let dragging = false;
  let placed = false;
  let pointerId: number | null = null;

  function showLoupe(screen: Point, point: Point): void {
    options.onLoupe({
      point,
      center: loupeCenter(screen, { top: 60 }),
      screenPoint: screen,
    });
  }

  function placeAt(screen: Point): Point | null {
    const rect = options.getRect();
    if (!isInsideRect(screen.x, screen.y, rect)) {
      return null;
    }
    const point = pointFromCanvas(screen.x, screen.y, rect, options.getMapSizeKm());
    options.onPlace(point);
    return point;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!options.canEdit() || event.button !== 0) {
      return;
    }

    const screen = eventPoint(canvas, event);
    const point = placeAt(screen);
    if (!point) {
      return;
    }

    event.preventDefault();
    dragging = true;
    placed = true;
    pointerId = event.pointerId;
    canvas.focus({ preventScroll: true });

    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best effort; the canvas still receives the gesture.
    }

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      showLoupe(screen, point);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || !options.canEdit() || event.pointerId !== pointerId) {
      return;
    }

    const screen = eventPoint(canvas, event);
    const point = placeAt(screen);
    if (point && (event.pointerType === 'touch' || event.pointerType === 'pen')) {
      showLoupe(screen, point);
    }
  }

  function endGesture(event: PointerEvent): void {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }
    dragging = false;
    pointerId = null;
    options.onLoupe(null);
    if (placed) {
      options.onCommit();
    }
    placed = false;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!options.canEdit()) {
      return;
    }

    const step = event.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') {
      dx = -step;
    } else if (event.key === 'ArrowRight') {
      dx = step;
    } else if (event.key === 'ArrowUp') {
      dy = -step;
    } else if (event.key === 'ArrowDown') {
      dy = step;
    } else {
      return;
    }

    event.preventDefault();
    const pin = options.getPin();
    if (!pin) {
      options.onPlace(centerPoint(options.getMapSizeKm()));
    } else {
      options.onPlace(nudgePoint(pin, dx, dy, options.getMapSizeKm()));
    }
    options.onCommit();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);
  canvas.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endGesture);
    canvas.removeEventListener('pointercancel', endGesture);
    canvas.removeEventListener('keydown', onKeyDown);
  };
}
