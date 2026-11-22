/**
 * @file        src/client/render/seismogram.ts
 * @purpose     Draws the decorative paper seismogram in the splash card.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - drawSeismogram(canvas, delays): void
 * @invariants  the trace is deterministic, uses the public station delays only, and never draws the truth
 * @security    none (public pre-guess data)
 * @tests       none (render exclusion)
 * @spec        06-design-and-ux.md look and feel; P4-client.md step 6
 */
import { COLORS, FONTS, TYPE_PX } from '../theme';
import { fitCanvas } from './canvas';

export function drawSeismogram(
  canvas: HTMLCanvasElement,
  delays: readonly number[]
): void {
  const surface = fitCanvas(canvas);
  if (!surface) {
    return;
  }

  const { context, width, height } = surface;
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.paperShade;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = COLORS.paperLine;
  context.lineWidth = 1;
  context.globalAlpha = 0.8;
  for (let index = 1; index < 4; index += 1) {
    const y = (height / 4) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.globalAlpha = 1;

  const values = delays.length > 0 ? delays : [10, 7, 12];

  values.forEach((delay, index) => {
    const baseline = (height / (values.length + 1)) * (index + 1);
    const amplitude = Math.min(14, 5 + delay * 0.45);
    const phase = delay * 1.7 + index * 0.9;
    const frequency = 0.035 + index * 0.004;

    context.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const envelope = Math.sin((x / width) * Math.PI);
      const wave =
        Math.sin(x * frequency + phase) * 0.65 +
        Math.sin(x * frequency * 2.7 + phase * 1.3) * 0.25 +
        Math.sin(x * frequency * 5.1 + phase * 0.7) * 0.1;
      const y = baseline + wave * amplitude * envelope;
      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.strokeStyle = index === values.length - 1 ? COLORS.coralDeep : COLORS.inkText;
    context.globalAlpha = index === values.length - 1 ? 0.9 : 0.65;
    context.lineWidth = index === values.length - 1 ? 2 : 1.5;
    context.stroke();

    context.globalAlpha = 0.8;
    context.fillStyle = COLORS.inkText;
    context.font = `${TYPE_PX.xs}px ${FONTS.mono}`;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(`STA ${String.fromCharCode(65 + index)}`, 8, baseline + 4);
  });

  context.globalAlpha = 1;
}
