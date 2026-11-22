/**
 * @file        src/client/view/chips.ts
 * @purpose     Builds station chip copy, station-centred ring radii and live pin-to-station spokes.
 * @layer       client view (pure: no DOM, no I/O)
 * @keyFunctions
 *   - stationChips(stations): StationChip[]
 *   - spokes(pin, stations, rect, mapSizeKm): Spoke[]
 *   - ringRadiusPx(station, rect, mapSizeKm): number
 * @invariants  ring radius is K times the delay; spoke labels show whole km; no fit or residual value is produced
 * @security    none (public gameplay geometry)
 * @tests       tests/client/viewChips.test.ts
 * @spec        06-design-and-ux.md playing; 01-spec.md sections 1 and 2
 */
import { KM_PER_SECOND_OF_DELAY } from '../../shared/constants';
import { distanceKm } from '../../shared/geometry';
import type { Point, Station } from '../../shared/types';
import { formatDelay, formatDistanceLabel, formatWholeKm } from './format';
import { canvasPoint } from './pin';
import type { Rect } from './pin';

export type StationChip = {
  id: Station['id'];
  label: string;
  delay: string;
  distance: string;
  position: Point;
};

export type Spoke = {
  id: Station['id'];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  labelX: number;
  labelY: number;
};

export function stationChips(stations: readonly Station[]): StationChip[] {
  return stations.map((station) => ({
    id: station.id,
    label: `STA ${station.id}`,
    delay: formatDelay(station.delayS),
    distance: formatDistanceLabel(station.delayS),
    position: { x: station.x, y: station.y },
  }));
}

export function ringRadiusPx(
  station: Station,
  rect: Rect,
  mapSizeKm: number
): number {
  if (!(mapSizeKm > 0) || !(rect.width > 0)) {
    return 0;
  }
  return (KM_PER_SECOND_OF_DELAY * station.delayS * rect.width) / mapSizeKm;
}

export function spokes(
  pin: Point,
  stations: readonly Station[],
  rect: Rect,
  mapSizeKm: number
): Spoke[] {
  if (!(mapSizeKm > 0) || !(rect.width > 0) || !(rect.height > 0)) {
    return [];
  }

  const from = canvasPoint(pin, rect, mapSizeKm);

  return stations.map((station) => {
    const to = canvasPoint(station, rect, mapSizeKm);
    return {
      id: station.id,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      label: formatWholeKm(distanceKm(pin, station)),
      labelX: (from.x + to.x) / 2,
      labelY: (from.y + to.y) / 2,
    };
  });
}
