/**
 * @file        src/client/render/waves.ts
 * @purpose     Animates the onboarding ripple and the after-guess P and S wave replay.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawWaves(ctx, rect, mapSizeKm, stations, wave): void
 * @invariants  onboarding uses a fixed demo origin, never the hidden truth; replay uses the revealed truth; reduced motion draws static rings
 * @security    S1: the pre-guess onboarding origin is a constant, not the puzzle truth
 * @tests       tests/meta/canvasBalance.test.ts
 * @spec        06-design-and-ux.md onboarding and motion; P4-client.md step 6
 */
import { VP_KM_S, VS_KM_S } from '../../shared/constants';
import { distanceKm } from '../../shared/geometry';
import type { Point, Station } from '../../shared/types';
import { COLORS, FONTS, TYPE_PX } from '../theme';
import type { Rect } from '../view/pin';
import { canvasPoint } from '../view/pin';
import { clipToMap, drawTag } from './canvas';

export type WaveState = {
  origin: Point;
  progress: number;
  reducedMotion: boolean;
};

export function drawWaves(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  mapSizeKm: number,
  stations: readonly Station[],
  wave: WaveState
): void {
  const progress = Math.min(1, Math.max(0, wave.progress));
  const origin = canvasPoint(wave.origin, rect, mapSizeKm);
  const maxDistance = Math.hypot(mapSizeKm, mapSizeKm);
  const elapsed = wave.reducedMotion
    ? maxDistance / VS_KM_S / 2
    : (progress * maxDistance) / VS_KM_S;

  ctx.save();
  clipToMap(ctx, rect);

  if (wave.reducedMotion) {
    drawRing(ctx, origin, (160 / mapSizeKm) * rect.width, COLORS.mint, 0.8, 2);
    drawRing(ctx, origin, (280 / mapSizeKm) * rect.width, COLORS.coral, 0.8, 2);
    ctx.restore();
    return;
  }

  const pRadius = (elapsed * VP_KM_S * rect.width) / mapSizeKm;
  const sRadius = (elapsed * VS_KM_S * rect.width) / mapSizeKm;

  drawRing(ctx, origin, pRadius, COLORS.mint, 0.8 - progress * 0.45, 2.5);
  drawRing(ctx, origin, sRadius, COLORS.coral, 0.85 - progress * 0.45, 3);

  for (const station of stations) {
    const point = canvasPoint(station, rect, mapSizeKm);
    const distance = distanceKm(wave.origin, station);
    const arrivals: Array<{ at: number; colour: string }> = [
      { at: distance / VP_KM_S, colour: COLORS.mint },
      { at: distance / VS_KM_S, colour: COLORS.coral },
    ];

    for (const arrival of arrivals) {
      const since = elapsed - arrival.at;
      if (since < 0 || since > 0.45) {
        continue;
      }
      const t = since / 0.45;
      ctx.strokeStyle = arrival.colour;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 11 + 34 * t, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 0.9;
  drawTag(ctx, 'P', origin.x + pRadius * 0.7, origin.y, {
    background: COLORS.mint,
    foreground: COLORS.ink,
    font: `${TYPE_PX.xs}px ${FONTS.mono}`,
  });
  drawTag(ctx, 'S', origin.x + sRadius * 0.7, origin.y + 16, {
    background: COLORS.coral,
    foreground: COLORS.ink,
    font: `${TYPE_PX.xs}px ${FONTS.mono}`,
  });
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  colour: string,
  alpha: number,
  width: number
): void {
  if (radius <= 0) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
