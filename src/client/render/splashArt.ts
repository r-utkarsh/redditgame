/**
 * @file        src/client/render/splashArt.ts
 * @purpose     Draws the split-hero earthquake illustration used by the splash screen.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawSplashArt(canvas, state): void
 * @invariants  decorative only; it never receives or draws the hidden daily answer
 * @security    S1: the splash illustration contains no puzzle truth or solver data
 * @tests       none (render exclusion)
 * @spec        06-design-and-ux.md look and feel; design reference Split.dc.html
 */
import { COLORS } from '../theme';
import { fitCanvas } from './canvas';
import type { SplashState } from '../../shared/splashState';

export function drawSplashArt(
  canvas: HTMLCanvasElement,
  state: SplashState
): void {
  const surface = fitCanvas(canvas);
  if (!surface) {
    return;
  }

  const { context: ctx, width, height } = surface;
  const center = { x: width / 2, y: height / 2 };
  const maxRadius = Math.min(width, height) * 0.48;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, width, height);

  for (const [radius, alpha, lineWidth] of [
    [maxRadius * 0.2, 1, 3],
    [maxRadius * 0.45, 0.7, 2.5],
    [maxRadius * 0.7, 0.45, 2],
    [maxRadius * 0.95, 0.25, 1.5],
  ] as const) {
    ctx.strokeStyle = COLORS.coral;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(state === 'open' ? [6, 8] : []);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.paper;
  if (state === 'open') {
    ctx.font = `700 ${Math.min(width, height) * 0.18}px ui-rounded, Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', center.x, center.y + 4);
  } else {
    ctx.beginPath();
    ctx.arc(center.x, center.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const triangles = [
    { x: width * 0.2, y: height * 0.23 },
    { x: width * 0.8, y: height * 0.32 },
    { x: width * 0.4, y: height * 0.84 },
  ];
  for (const triangle of triangles) {
    ctx.beginPath();
    ctx.moveTo(triangle.x, triangle.y - 12);
    ctx.lineTo(triangle.x + 12, triangle.y + 10);
    ctx.lineTo(triangle.x - 12, triangle.y + 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
