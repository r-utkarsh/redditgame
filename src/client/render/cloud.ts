/**
 * @file        src/client/render/cloud.ts
 * @purpose     Draws the crowd cloud, crowd median and the truth, player and best-fit markers after a guess.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawCrowdCloud(ctx, rect, mapSizeKm, cloud): void
 *   - drawResultMarkers(ctx, rect, mapSizeKm, results): void
 * @invariants  every marker has a text label; the cloud is drawn below the markers; nothing is drawn before a guess
 * @security    none (after-guess public data)
 * @tests       tests/meta/canvasBalance.test.ts; tests/client/viewResult.test.ts (markers)
 * @spec        06-design-and-ux.md result card; P4-client.md step 6
 */
import { CLOUD_BIN_KM } from '../../shared/constants';
import type { Point, ResultsPayload } from '../../shared/types';
import { COLORS, FONTS, TYPE_PX } from '../theme';
import { resultMarkers } from '../view/result';
import type { ResultMarker } from '../view/result';
import type { Rect } from '../view/pin';
import { canvasPoint } from '../view/pin';
import { clipToMap, drawTag } from './canvas';

export function drawCrowdCloud(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  cloud: ResultsPayload['cloud']
): void {
  ctx.save();
  clipToMap(ctx, rect);

  for (const cell of cloud) {
    const point = canvasPoint(
      {
        x: (cell.cx + 0.5) * CLOUD_BIN_KM,
        y: (cell.cy + 0.5) * CLOUD_BIN_KM,
      },
      rect,
      mapSizeKm
    );
    const radius = 2 + Math.min(6, Math.sqrt(cell.n) * 2);

    ctx.fillStyle = COLORS.mint;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1, radius * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function labelY(marker: ResultMarker, point: Point): number {
  return marker.kind === 'truth' || marker.kind === 'best'
    ? point.y - 24
    : point.y + 24;
}

export function drawResultMarkers(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  results: ResultsPayload
): void {
  ctx.save();
  clipToMap(ctx, rect);

  for (const marker of resultMarkers(results)) {
    const point =
      marker.kind === 'median'
        ? canvasPoint(marker.point, rect, mapSizeKm)
        : canvasPoint(marker.point, rect, mapSizeKm);

    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.inkText;

    if (marker.kind === 'truth') {
      ctx.fillStyle = COLORS.cream;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.inkText;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (marker.kind === 'you') {
      ctx.fillStyle = COLORS.coral;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x - 12, point.y);
      ctx.lineTo(point.x + 12, point.y);
      ctx.moveTo(point.x, point.y - 12);
      ctx.lineTo(point.x, point.y + 12);
      ctx.stroke();
    } else if (marker.kind === 'best') {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = COLORS.mint;
      ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
    } else {
      ctx.strokeStyle = COLORS.mintDeep;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x - 4, point.y);
      ctx.lineTo(point.x + 4, point.y);
      ctx.moveTo(point.x, point.y - 4);
      ctx.lineTo(point.x, point.y + 4);
      ctx.stroke();
    }

    drawTag(ctx, marker.label, point.x, labelY(marker, point));
  }

  ctx.font = `${TYPE_PX.xs}px ${FONTS.mono}`;
  ctx.restore();
}
