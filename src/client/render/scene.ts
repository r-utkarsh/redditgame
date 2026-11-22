/**
 * @file        src/client/render/scene.ts
 * @purpose     Composes the map, rings, stations, spokes, pin, cloud, waves, markers and loupe into one canvas.
 * @layer       client render (DOM canvas: documented coverage exclusion)
 * @keyFunctions
 *   - createRenderer(canvas): SceneRenderer
 *   - SceneState
 * @invariants  the pre-guess scene never draws truth, solver fit or crowd data; the result scene draws all four
 * @security    S1: the renderer receives only the payload fields the client already has
 * @tests       none (render exclusion)
 * @spec        P4-client.md step 6; 06-design-and-ux.md playing and result
 */
import type { Point, ResultsPayload, Station } from '../../shared/types';
import type { LoupeCenter, Rect } from '../view/pin';
import { canvasPoint } from '../view/pin';
import { fitCanvas } from './canvas';
import { drawCrowdCloud, drawResultMarkers } from './cloud';
import { drawLoupe } from './loupe';
import { drawBackdrop, drawMapBase, drawStations } from './map';
import { drawPin, drawRings, drawSpokes } from './rings';
import { drawWaves } from './waves';
import type { WaveState } from './waves';

export type SceneState = {
  mode: 'play' | 'result';
  rect: Rect;
  mapSizeKm: number;
  stations: readonly Station[];
  fault: readonly Point[] | null;
  pin: Point | null;
  results?: ResultsPayload | undefined;
  waves?: WaveState | null | undefined;
  loupe?: {
    point: Point;
    center: LoupeCenter;
    screenPoint: Point;
  } | null | undefined;
};

export type SceneRenderer = {
  draw(scene: SceneState): void;
};

export function createRenderer(canvas: HTMLCanvasElement): SceneRenderer {
  function drawWorld(
    context: CanvasRenderingContext2D,
    scene: SceneState
  ): void {
    drawMapBase(context, scene.rect, scene.mapSizeKm, scene.fault);
    drawRings(context, scene.rect, scene.mapSizeKm, scene.stations, scene.mode === 'result');
    drawStations(
      context,
      scene.rect,
      scene.mapSizeKm,
      scene.stations,
      scene.mode === 'result'
    );

    if (scene.mode === 'play') {
      if (scene.waves) {
        drawWaves(
          context,
          scene.rect,
          scene.mapSizeKm,
          scene.stations,
          scene.waves
        );
      }
      if (scene.pin) {
        drawSpokes(context, scene.rect, scene.mapSizeKm, scene.pin, scene.stations);
        drawPin(context, scene.rect, scene.mapSizeKm, scene.pin);
      }
    }
  }

  function draw(scene: SceneState): void {
    const surface = fitCanvas(canvas);
    if (!surface) {
      return;
    }

    const { context, width, height } = surface;
    drawBackdrop(context, width, height);

    if (!(scene.rect.width > 0)) {
      return;
    }

    drawWorld(context, scene);

    if (scene.mode === 'result' && scene.results) {
      drawCrowdCloud(context, scene.rect, scene.mapSizeKm, scene.results.cloud);
      if (scene.waves) {
        drawWaves(
          context,
          scene.rect,
          scene.mapSizeKm,
          scene.stations,
          scene.waves
        );
      }
      drawResultMarkers(context, scene.rect, scene.mapSizeKm, scene.results);
    }

    if (scene.loupe && scene.mode === 'play') {
      drawLoupe(
        context,
        scene.loupe,
        height,
        (loupeContext) => {
          drawWorld(loupeContext, scene);
        }
      );
    }
  }

  return { draw };
}

export function screenPointFor(
  point: Point,
  rect: Rect,
  mapSizeKm: number
): Point {
  return canvasPoint(point, rect, mapSizeKm);
}
