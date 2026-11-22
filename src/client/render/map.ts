/**
 * @file        src/client/render/map.ts
 * @purpose     Draws the ink backdrop, the paper map, the grid, the fault line, the scale bar and the stations.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawBackdrop(ctx, width, height): void
 *   - drawMapBase(ctx, rect, mapSizeKm, fault): void
 *   - drawStations(ctx, rect, mapSizeKm, stations, resultMode): void
 * @invariants  the map is paper on ink, the fault is drawn only when the payload includes it, labels are text tags
 * @security    none (drawing only)
 * @tests       tests/meta/canvasBalance.test.ts
 * @spec        06-design-and-ux.md look and feel; P4-client.md step 6
 */
import type { Point, Station } from '../../shared/types';
import { COLORS, FONTS, TYPE_PX } from '../theme';
import type { Rect } from '../view/pin';
import { canvasPoint } from '../view/pin';
import { clipToMap, drawTag } from './canvas';

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLORS.inkLine;
  ctx.globalAlpha = 0.35;
  const spacing = 22;
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawMapBase(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  fault: readonly Point[] | null
): void {
  if (!(rect.width > 0) || !(mapSizeKm > 0)) {
    return;
  }

  ctx.save();
  ctx.fillStyle = COLORS.inkSoft;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(rect.x + 5, rect.y + 7, rect.width, rect.height);
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.save();
  clipToMap(ctx, rect);

  const step = mapSizeKm / 10;
  ctx.strokeStyle = COLORS.paperLine;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.75;
  for (let index = 0; index <= 10; index += 1) {
    const offset = (index / 10) * rect.width;
    ctx.beginPath();
    ctx.moveTo(rect.x + offset, rect.y);
    ctx.lineTo(rect.x + offset, rect.y + rect.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + offset);
    ctx.lineTo(rect.x + rect.width, rect.y + offset);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (fault && fault.length >= 2) {
    ctx.strokeStyle = COLORS.inkText;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    fault.forEach((point, index) => {
      const px = canvasPoint(point, rect, mapSizeKm);
      if (index === 0) {
        ctx.moveTo(px.x, px.y);
      } else {
        ctx.lineTo(px.x, px.y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.inkText;
    for (const point of fault) {
      const px = canvasPoint(point, rect, mapSizeKm);
      ctx.beginPath();
      ctx.arc(px.x, px.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  ctx.strokeStyle = COLORS.inkLine;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  drawScaleBar(ctx, rect, mapSizeKm, step);
  drawNorth(ctx, rect);
  ctx.restore();
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  step: number
): void {
  const length = (step / mapSizeKm) * rect.width;
  const x = rect.x + 12;
  const y = rect.y + rect.height - 16;

  ctx.save();
  ctx.strokeStyle = COLORS.inkText;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + length, y - 4);
  ctx.lineTo(x + length, y + 4);
  ctx.stroke();

  ctx.fillStyle = COLORS.inkText;
  ctx.font = `${TYPE_PX.xs}px ${FONTS.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('100 km', x, y - 6);
  ctx.restore();
}

function drawNorth(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const x = rect.x + rect.width - 18;
  const y = rect.y + 18;

  ctx.save();
  ctx.fillStyle = COLORS.inkText;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + 4, y + 4);
  ctx.lineTo(x - 4, y + 4);
  ctx.closePath();
  ctx.fill();

  ctx.font = `${TYPE_PX.xs}px ${FONTS.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', x, y + 6);
  ctx.restore();
}

export function drawStations(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  stations: readonly Station[],
  resultMode: boolean
): void {
  ctx.save();
  clipToMap(ctx, rect);
  ctx.globalAlpha = resultMode ? 0.85 : 1;

  for (const station of stations) {
    const point = canvasPoint(station, rect, mapSizeKm);

    ctx.strokeStyle = COLORS.coralDeep;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = resultMode ? 0.85 : 1;

    ctx.fillStyle = COLORS.paper;
    ctx.strokeStyle = COLORS.inkText;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.inkText;
    ctx.font = `bold ${TYPE_PX.sm}px ${FONTS.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(station.id, point.x, point.y + 0.5);

    drawTag(ctx, `STA ${station.id}`, point.x + 16, point.y - 16, {
      align: 'left',
    });
  }

  ctx.restore();
}
