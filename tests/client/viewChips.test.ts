/**
 * @file        tests/client/viewChips.test.ts
 * @purpose     Proves station chip copy, spoke geometry and trilateration circle radii use the shared constants.
 * @covers      src/client/view/chips.ts
 * @spec        06-design-and-ux.md playing; 01-spec.md sections 1 and 2
 */
import { describe, expect, it } from 'vitest';
import type { Station } from '../../src/shared/types';
import {
  ringRadiusPx,
  spokes,
  stationChips,
} from '../../src/client/view/chips';

const stations: Station[] = [
  { id: 'A', x: 200, y: 200, delayS: 12.6 },
  { id: 'B', x: 800, y: 300, delayS: 4 },
  { id: 'C', x: 500, y: 800, delayS: 9.5 },
];

const rect = { x: 0, y: 0, width: 1000, height: 1000 };

describe('station chips', () => {
  it('builds one chip per station with the approved copy', () => {
    expect(stationChips(stations)).toEqual([
      {
        id: 'A',
        label: 'STA A',
        delay: '12.6 s',
        distance: 'about 106 km',
        position: { x: 200, y: 200 },
      },
      {
        id: 'B',
        label: 'STA B',
        delay: '4.0 s',
        distance: 'about 34 km',
        position: { x: 800, y: 300 },
      },
      {
        id: 'C',
        label: 'STA C',
        delay: '9.5 s',
        distance: 'about 80 km',
        position: { x: 500, y: 800 },
      },
    ]);
  });

  it('returns no chips for an empty list', () => {
    expect(stationChips([])).toEqual([]);
  });
});

describe('spokes', () => {
  it('draws one spoke from the pin to each station with a distance label', () => {
    const result = spokes({ x: 500, y: 500 }, stations, rect, 1000);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 'A',
      x1: 500,
      y1: 500,
      x2: 200,
      y2: 200,
      label: '424 km',
    });
    expect(result[1]?.label).toBe('361 km');
    expect(result[2]?.label).toBe('300 km');
  });

  it('places the label at the spoke midpoint', () => {
    const [first] = spokes({ x: 500, y: 500 }, [stations[0]!], rect, 1000);

    expect(first?.labelX).toBe(350);
    expect(first?.labelY).toBe(350);
  });

  it('scales with a smaller map rect', () => {
    const result = spokes(
      { x: 500, y: 500 },
      [stations[0]!],
      { x: 10, y: 20, width: 500, height: 500 },
      1000
    );

    expect(result[0]).toMatchObject({ x1: 260, y1: 270, x2: 110, y2: 120 });
  });

  it('returns no spokes without a pin on the map', () => {
    expect(spokes({ x: 500, y: 500 }, [], rect, 1000)).toEqual([]);
  });
});

describe('trilateration ring radius', () => {
  it('uses K times the delay and the rect scale', () => {
    expect(ringRadiusPx(stations[0]!, rect, 1000)).toBeCloseTo(105.84, 2);
    expect(
      ringRadiusPx(stations[0]!, { x: 0, y: 0, width: 500, height: 500 }, 1000)
    ).toBeCloseTo(52.92, 2);
  });

  it('returns zero for an empty rect or invalid map size', () => {
    expect(
      ringRadiusPx(stations[0]!, { x: 0, y: 0, width: 0, height: 0 }, 1000)
    ).toBe(0);
    expect(ringRadiusPx(stations[0]!, rect, 0)).toBe(0);
  });
});
