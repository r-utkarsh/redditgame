/**
 * @file        src/client/render/rings.ts
 * @purpose     Draws the station-centred trilateration circles, live pin spokes and the coral pin.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawRings(ctx, rect, mapSizeKm, stations, resultMode): void
 *   - drawSpokes(ctx, rect, mapSizeKm, pin, stations): void
 *   - drawPin(ctx, rect, mapSizeKm, pin): void
 * @invariants  circles are centred on stations, never on the pin; no fit or residual meter is drawn
 * @security    none (drawing only)
 * @tests       tests/meta/canvasBalance.test.ts; tests/client/viewChips.test.ts (geometry)
 * @spec        06-design-and-ux.md playing; 01-spec.md section 1
 */
import type { Point, Station } from '../../shared/types';
import { COLORS, FONTS, TYPE_PX } from '../theme';
import { ringRadiusPx, spokes } from '../view/chips';
import type { Rect } from '../view/pin';
import { canvasPoint } from '../view/pin';
import { clipToMap, drawTag } from './canvas';

export function drawRings(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  stations: readonly Station[],
  resultMode: boolean
): void {
  ctx.save();
  clipToMap(ctx, rect);
  ctx.strokeStyle = COLORS.coralDeep;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = resultMode ? 0.1 : 0.2;

  for (const station of stations) {
    const center = canvasPoint(station, rect, mapSizeKm);
    const radius = ringRadiusPx(station, rect, mapSizeKm);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawSpokes(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  pin: Point,
  stations: readonly Station[]
): void {
  ctx.save();
  clipToMap(ctx, rect);

  for (const spoke of spokes(pin, stations, rect, mapSizeKm)) {
    ctx.strokeStyle = COLORS.coralDeep;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(spoke.x1, spoke.y1);
    ctx.lineTo(spoke.x2, spoke.y2);
    ctx.stroke();
    ctx.setLineDash([]);

    drawTag(ctx, spoke.label, spoke.labelX, spoke.labelY);
  }

  ctx.restore();
}

export function drawPin(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  pin: Point
): void {
  const point = canvasPoint(pin, rect, mapSizeKm);

  ctx.save();
  clipToMap(ctx, rect);

  ctx.fillStyle = COLORS.coral;
  ctx.strokeStyle = COLORS.inkText;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.cream;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.inkText;
  ctx.lineWidth = 2;
  for (const [dx, dy] of [
    [14, 0],
    [-14, 0],
    [0, 14],
    [0, -14],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(point.x + dx * 0.55, point.y + dy * 0.55);
    ctx.lineTo(point.x + dx, point.y + dy);
    ctx.stroke();
  }

  ctx.font = `${TYPE_PX.xs}px ${FONTS.mono}`;
  ctx.fillStyle = COLORS.inkText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.7;
  ctx.fillText(`${pin.x.toFixed(1)}, ${pin.y.toFixed(1)}`, point.x + 14, point.y + 12);

  ctx.restore();
}
