/**
 * @file        tests/meta/canvasBalance.test.ts
 * @purpose     Proves every render function leaves the canvas state stack balanced, so a leaked save can never corrupt the loupe clip or the zoom transform.
 * @covers      src/client/render/map.ts, src/client/render/rings.ts, src/client/render/cloud.ts, src/client/render/waves.ts, src/client/render/loupe.ts, src/client/render/canvas.ts
 * @spec        06-design-and-ux.md playing and loupe; P4-client.md step 6
 */
import { describe, expect, it } from 'vitest';
import { drawTag } from '../../src/client/render/canvas';
import { drawCrowdCloud, drawResultMarkers } from '../../src/client/render/cloud';
import { drawLoupe } from '../../src/client/render/loupe';
import { drawBackdrop, drawMapBase, drawStations } from '../../src/client/render/map';
import { drawPin, drawRings, drawSpokes } from '../../src/client/render/rings';
import { drawWaves } from '../../src/client/render/waves';
import type { WaveState } from '../../src/client/render/waves';
import type { Point, ResultsPayload, Station } from '../../src/shared/types';

type FakeContext = CanvasRenderingContext2D & { depth: number; minDepth: number };

const NOOP_METHODS = [
  'arc',
  'beginPath',
  'clip',
  'closePath',
  'fill',
  'fillRect',
  'fillText',
  'lineTo',
  'moveTo',
  'quadraticCurveTo',
  'rect',
  'rotate',
  'scale',
  'setLineDash',
  'stroke',
  'strokeRect',
  'translate',
  'clearRect',
] as const;

export function createFakeContext(): FakeContext {
  const state: FakeContext = {
    depth: 0,
    minDepth: 0,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as FakeContext;

  for (const name of NOOP_METHODS) {
    (state as unknown as Record<string, unknown>)[name] = () => undefined;
  }

  state.save = () => {
    state.depth += 1;
  };
  state.restore = () => {
    state.depth -= 1;
    state.minDepth = Math.min(state.minDepth, state.depth);
  };
  state.measureText = (text: string) =>
    ({ width: text.length * 6 }) as TextMetrics;

  return state;
}

const RECT = { x: 8, y: 73, width: 374, height: 374 };
const MAP_SIZE_KM = 1000;

const STATIONS: Station[] = [
  { id: 'A', x: 200, y: 200, delayS: 12.6 },
  { id: 'B', x: 800, y: 250, delayS: 9.4 },
  { id: 'C', x: 500, y: 850, delayS: 15.1 },
];

const PIN: Point = { x: 412, y: 388 };
const TRUTH: Point = { x: 430.2, y: 401.7 };

const CLOUD: ResultsPayload['cloud'] = [
  { cx: 20, cy: 19, n: 3 },
  { cx: 21, cy: 20, n: 1 },
];

const RESULTS: ResultsPayload = {
  truth: TRUTH,
  solverFit: { x: 425, y: 396, errorKm: 7.8 },
  cloud: CLOUD,
  crowdMedian: { x: 410, y: 390 },
  playerCount: 12,
  percentile: 78,
  you: { x: PIN.x, y: PIN.y, errorKm: 23.4, score: 557, stars: 2 },
  stations: STATIONS,
  mapSizeKm: MAP_SIZE_KM,
  fault: [
    { x: 100, y: 900 },
    { x: 900, y: 200 },
  ],
};

function expectBalanced(draw: (ctx: FakeContext) => void): void {
  const ctx = createFakeContext();
  draw(ctx);
  expect(ctx.depth).toBe(0);
  expect(ctx.minDepth).toBe(0);
}

describe('canvas save/restore balance', () => {
  it('drawBackdrop returns to depth zero', () => {
    expectBalanced((ctx) => drawBackdrop(ctx, 390, 600));
  });

  it('drawMapBase returns to depth zero', () => {
    expectBalanced((ctx) => drawMapBase(ctx, RECT, MAP_SIZE_KM, RESULTS.fault));
  });

  it('drawMapBase returns to depth zero without a fault line', () => {
    expectBalanced((ctx) => drawMapBase(ctx, RECT, MAP_SIZE_KM, null));
  });

  it('drawStations returns to depth zero', () => {
    expectBalanced((ctx) => drawStations(ctx, RECT, MAP_SIZE_KM, STATIONS, false));
    expectBalanced((ctx) => drawStations(ctx, RECT, MAP_SIZE_KM, STATIONS, true));
  });

  it('drawRings, drawSpokes and drawPin return to depth zero', () => {
    expectBalanced((ctx) => drawRings(ctx, RECT, MAP_SIZE_KM, STATIONS, false));
    expectBalanced((ctx) => drawSpokes(ctx, RECT, MAP_SIZE_KM, PIN, STATIONS));
    expectBalanced((ctx) => drawPin(ctx, RECT, MAP_SIZE_KM, PIN));
  });

  it('drawCrowdCloud and drawResultMarkers return to depth zero', () => {
    expectBalanced((ctx) => drawCrowdCloud(ctx, RECT, MAP_SIZE_KM, CLOUD));
    expectBalanced((ctx) => drawResultMarkers(ctx, RECT, MAP_SIZE_KM, RESULTS));
  });

  it('drawWaves returns to depth zero in both motion modes', () => {
    const animated: WaveState = { origin: TRUTH, progress: 0.4, reducedMotion: false };
    const reduced: WaveState = { origin: TRUTH, progress: 1, reducedMotion: true };

    expectBalanced((ctx) => drawWaves(ctx, RECT, MAP_SIZE_KM, STATIONS, animated));
    expectBalanced((ctx) => drawWaves(ctx, RECT, MAP_SIZE_KM, STATIONS, reduced));
  });

  it('drawTag returns to depth zero', () => {
    expectBalanced((ctx) => drawTag(ctx, '412.0, 388.0 km', 100, 100));
  });

  it('drawLoupe returns to depth zero and never underflows', () => {
    const ctx = createFakeContext();
    drawLoupe(
      ctx,
      {
        point: PIN,
        center: { x: 200, y: 120, flipped: false },
        screenPoint: { x: 200, y: 240 },
      },
      600,
      (inner) => {
        drawMapBase(inner, RECT, MAP_SIZE_KM, RESULTS.fault);
        drawRings(inner, RECT, MAP_SIZE_KM, STATIONS, false);
        drawStations(inner, RECT, MAP_SIZE_KM, STATIONS, false);
        drawSpokes(inner, RECT, MAP_SIZE_KM, PIN, STATIONS);
        drawPin(inner, RECT, MAP_SIZE_KM, PIN);
      }
    );

    expect(ctx.depth).toBe(0);
    expect(ctx.minDepth).toBe(0);
  });

  it('drawLoupe stays balanced when the world draw itself leaks a save', () => {
    const ctx = createFakeContext();
    drawLoupe(
      ctx,
      {
        point: PIN,
        center: { x: 200, y: 120, flipped: false },
        screenPoint: { x: 200, y: 240 },
      },
      600,
      (inner) => {
        // A draw that forgets its restore must not corrupt the loupe clip.
        inner.save();
      }
    );

    expect(ctx.depth).toBe(1);
  });
});
