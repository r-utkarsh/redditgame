/**
 * @file        tests/client/viewResult.test.ts
 * @purpose     Proves the result card text, two stat rows, accessible announcement, legend and markers.
 * @covers      src/client/view/result.ts
 * @spec        06-design-and-ux.md result card; 01-spec.md section 7; D-027
 */
import { describe, expect, it } from 'vitest';
import type { ResultsPayload, Streak } from '../../src/shared/types';
import {
  resultAria,
  resultComputerLine,
  resultLegend,
  resultMarkers,
  resultRows,
  resultSubline,
} from '../../src/client/view/result';
import type { ResultView } from '../../src/client/view/result';

function results(overrides: Partial<ResultsPayload> = {}): ResultsPayload {
  return {
    truth: { x: 400, y: 420 },
    solverFit: { x: 410, y: 430, errorKm: 12.4 },
    cloud: [{ cx: 20, cy: 21, n: 3 }],
    crowdMedian: { x: 405, y: 415 },
    playerCount: 12,
    percentile: 78,
    you: { x: 390, y: 440, errorKm: 23.4, score: 820, stars: 2 },
    stations: [
      { id: 'A', x: 200, y: 200, delayS: 12.6 },
      { id: 'B', x: 800, y: 300, delayS: 4 },
      { id: 'C', x: 500, y: 800, delayS: 9.5 },
    ],
    mapSizeKm: 1000,
    fault: [
      { x: 100, y: 100 },
      { x: 900, y: 900 },
    ],
    ...overrides,
  };
}

function view(overrides: Partial<ResultsPayload> = {}): ResultView {
  const streak: Streak = { current: 2, best: 9 };

  return { results: results(overrides), streak, dateKey: '2026-11-18' };
}

describe('result copy', () => {
  it('picks a subline from the player error', () => {
    expect(resultSubline(10)).toBe('That is a bullseye.');
    expect(resultSubline(23.4)).toBe('Not bad for a hunch.');
    expect(resultSubline(80)).toBe('In the neighborhood.');
    expect(resultSubline(200)).toBe('The search continues.');
  });

  it('shows the computer best fit error', () => {
    expect(resultComputerLine(view())).toBe(
      "Computer's best guess: 12.4 km off"
    );
  });

  it('announces the result once for screen readers', () => {
    expect(resultAria(results())).toBe(
      'You were 23.4 km off. 820 points. 2 of 3 stars.'
    );
  });
});

describe('stat rows', () => {
  it('returns exactly two compact rows with score, streak, crowd and players', () => {
    const rows = resultRows(view());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      { label: 'Score', value: '820 points' },
      { label: 'Streak', value: '2 days' },
    ]);
    expect(rows[1]).toEqual([
      { label: 'Crowd', value: 'Beat 78% of players' },
      { label: 'Players', value: '12' },
    ]);
  });

  it('shows the player count instead of percentile below five players', () => {
    const rows = resultRows(
      view({ playerCount: 3, percentile: null, crowdMedian: null })
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([{ label: 'Crowd', value: '3 players so far' }]);
  });

  it('uses the passed streak', () => {
    const input = view({
      you: { x: 1, y: 2, errorKm: 0, score: 1000, stars: 3 },
    });
    input.streak = { current: 7, best: 9 };

    expect(resultRows(input)[0]?.[1]).toEqual({
      label: 'Streak',
      value: '7 days',
    });
  });
});

describe('legend and markers', () => {
  it('labels every shape in text', () => {
    expect(resultLegend()).toEqual([
      { label: 'Truth', shape: 'ring' },
      { label: 'You', shape: 'cross' },
      { label: 'Best fit', shape: 'diamond' },
      { label: 'Crowd', shape: 'dot' },
    ]);
  });

  it('returns truth, player and best-fit markers plus the median when present', () => {
    expect(resultMarkers(results())).toEqual([
      { kind: 'truth', label: 'TRUTH', point: { x: 400, y: 420 } },
      { kind: 'you', label: 'YOU', point: { x: 390, y: 440 } },
      { kind: 'best', label: 'BEST FIT', point: { x: 410, y: 430 } },
      { kind: 'median', label: 'CROWD MEDIAN', point: { x: 405, y: 415 } },
    ]);
  });

  it('omits the median marker below the minimum', () => {
    const markers = resultMarkers(results({ crowdMedian: null }));

    expect(markers.map((marker) => marker.kind)).toEqual([
      'truth',
      'you',
      'best',
    ]);
  });
});
