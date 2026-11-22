/**
 * @file        src/client/view/layout.ts
 * @purpose     Computes the square map rect inside the viewport for playing and for the result overlay.
 * @layer       client view (pure: no DOM, no I/O)
 * @keyFunctions
 *   - mapRect(width, height, mode): Rect
 *   - PLAY_HEADER_PX / PLAY_CONTROLS_PX / MAP_MAX_PX
 * @invariants  the map stays square, never covers the header or controls, and never exceeds 620 px
 * @security    none (layout math)
 * @tests       tests/client/viewLayout.test.ts
 * @spec        P4-client.md step 10; 06-design-and-ux.md viewport
 */
import type { Rect } from './pin';

export type MapMode = 'play' | 'result';

export const PLAY_HEADER_PX = 52;
export const PLAY_CONTROLS_PX = 132;
export const MAP_MAX_PX = 620;
export const RESULT_MAP_FRACTION = 0.48;
export const MAP_EDGE_PX = 8;

function clean(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function mapRect(width: number, height: number, mode: MapMode): Rect {
  const viewWidth = clean(width);
  const viewHeight = clean(height);

  if (viewWidth === 0 || viewHeight === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const availableWidth = Math.max(0, viewWidth - MAP_EDGE_PX * 2);

  if (mode === 'result') {
    const size = Math.max(
      0,
      Math.min(availableWidth, viewHeight * RESULT_MAP_FRACTION, MAP_MAX_PX)
    );
    return {
      x: (viewWidth - size) / 2,
      y: MAP_EDGE_PX,
      width: size,
      height: size,
    };
  }

  const availableHeight = Math.max(
    0,
    viewHeight - PLAY_HEADER_PX - PLAY_CONTROLS_PX
  );
  const size = Math.max(
    0,
    Math.min(availableWidth, availableHeight, MAP_MAX_PX)
  );

  return {
    x: (viewWidth - size) / 2,
    y: PLAY_HEADER_PX + (availableHeight - size) / 2,
    width: size,
    height: size,
  };
}
