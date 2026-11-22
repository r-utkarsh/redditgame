/**
 * @file        src/client/render/loupe.ts
 * @purpose     Draws the 2.5x circular loupe, its crosshair and the km readout above or below the pointer.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawLoupe(ctx, view, viewHeight, drawWorld): void
 * @invariants  the loupe only magnifies existing map content; it never reveals hidden data; it flips below near the top edge
 * @security    none (drawing only)
 * @tests       tests/meta/canvasBalance.test.ts; tests/client/viewPin.test.ts (flip math)
 * @spec        06-design-and-ux.md playing; P4-client.md step 6
 */
import type { Point } from '../../shared/types';
import { COLORS } from '../theme';
import { formatCoordinates } from '../view/format';
import type { LoupeCenter } from '../view/pin';
import { drawTag } from './canvas';

export type LoupeView = {
  point: Point;
  center: LoupeCenter;
  screenPoint: Point;
};

export const LOUPE_RADIUS_PX = 58;
export const LOUPE_SCALE = 2.5;

export function drawLoupe(
  ctx: CanvasRenderingContext2D,
  view: LoupeView,
  viewHeight: number,
  drawWorld: (context: CanvasRenderingContext2D) => void
): void {
  const { center } = view;

  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, LOUPE_RADIUS_PX, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = COLORS.inkSoft;
  ctx.fillRect(
    center.x - LOUPE_RADIUS_PX,
    center.y - LOUPE_RADIUS_PX,
    LOUPE_RADIUS_PX * 2,
    LOUPE_RADIUS_PX * 2
  );

  ctx.translate(center.x, center.y);
  ctx.scale(LOUPE_SCALE, LOUPE_SCALE);
  ctx.translate(-view.screenPoint.x, -view.screenPoint.y);
  drawWorld(ctx);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = COLORS.cream;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, LOUPE_RADIUS_PX, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = COLORS.coral;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(center.x - 14, center.y);
  ctx.lineTo(center.x + 14, center.y);
  ctx.moveTo(center.x, center.y - 14);
  ctx.lineTo(center.x, center.y + 14);
  ctx.stroke();

  ctx.fillStyle = COLORS.coral;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const below = center.y + LOUPE_RADIUS_PX + 14;
  const labelY =
    below + 12 > viewHeight
      ? center.y - LOUPE_RADIUS_PX - 14
      : below;

  drawTag(ctx, formatCoordinates(view.point), center.x, labelY, {
    background: COLORS.inkSoft,
    foreground: COLORS.cream,
  });
}
