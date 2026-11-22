/**
 * @file        src/client/render/canvas.ts
 * @purpose     Provides canvas sizing, rounded rectangles and text tag helpers for every renderer.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - fitCanvas(canvas): CanvasSurface
 *   - roundedRectPath(ctx, x, y, width, height, radius): void
 *   - drawTag(ctx, text, x, y, options?): void
 * @invariants  the backing store follows devicePixelRatio; all drawing is in CSS pixels
 * @security    none (drawing only)
 * @tests       tests/meta/canvasBalance.test.ts; tests/client/viewLayout.test.ts (layout math)
 * @spec        P4-client.md step 6; 06-design-and-ux.md look and feel
 */
import { COLORS, FONTS, TYPE_PX } from '../theme';

export type CanvasSurface = {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
};

export function fitCanvas(canvas: HTMLCanvasElement): CanvasSurface | null {
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const width = Math.max(1, canvas.clientWidth || canvas.width);
  const height = Math.max(1, canvas.clientHeight || canvas.height);
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width, height, dpr };
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export type TagOptions = {
  align?: 'center' | 'left';
  background?: string;
  foreground?: string;
  font?: string;
};

export function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: TagOptions = {}
): void {
  const font = options.font ?? `${TYPE_PX.xs}px ${FONTS.mono}`;
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const paddingX = 6;
  const height = TYPE_PX.xs + 8;
  const width = ctx.measureText(text).width + paddingX * 2;
  const left = options.align === 'left' ? x : x - width / 2;
  const top = y - height / 2;

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = options.background ?? COLORS.paper;
  roundedRectPath(ctx, left, top, width, height, 4);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = options.foreground ?? COLORS.inkText;
  ctx.fillText(text, left + width / 2, top + height / 2 + 0.5);
  ctx.restore();
}

export function clipToMap(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number }
): void {
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
}
