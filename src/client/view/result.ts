/**
 * @file        src/client/view/result.ts
 * @purpose     Builds the two result stat rows, screen-reader summary, marker legend and map markers.
 * @layer       client view (pure: no DOM, no I/O)
 * @keyFunctions
 *   - ResultView
 *   - resultSubline(errorKm): string
 *   - resultComputerLine(view): string
 *   - resultAria(results): string
 *   - resultRows(view): StatRow[]
 *   - resultLegend(): LegendItem[]
 *   - resultMarkers(results): ResultMarker[]
 * @invariants  exactly two rows; percentile and median only above the minimum; every marker has a text label
 * @security    none (after-guess public data)
 * @tests       tests/client/viewResult.test.ts
 * @spec        06-design-and-ux.md result card; 01-spec.md section 7; D-027
 */
import type { Point, ResultsPayload, Streak } from '../../shared/types';
import {
  formatPlayerCount,
  formatPercentile,
  formatScore,
  formatStarsLabel,
  formatStreakDays,
  formatSublabel,
} from './format';

export type ResultView = {
  results: ResultsPayload;
  streak: Streak;
  dateKey: string;
};

export type StatCell = { label: string; value: string };
export type StatRow = StatCell[];

export type LegendShape = 'ring' | 'cross' | 'diamond' | 'dot';

export type LegendItem = { label: string; shape: LegendShape };

export type ResultMarker = {
  kind: 'truth' | 'you' | 'best' | 'median';
  label: string;
  point: Point;
};

export function resultSubline(errorKm: number): string {
  return formatSublabel(errorKm);
}

export function resultComputerLine(view: ResultView): string {
  return `Computer's best guess: ${view.results.solverFit.errorKm.toFixed(1)} km off`;
}

export function resultAria(results: ResultsPayload): string {
  return `You were ${results.you.errorKm.toFixed(1)} km off. ${formatScore(
    results.you.score
  )}. ${formatStarsLabel(results.you.stars)}.`;
}

export function resultRows(view: ResultView): StatRow[] {
  const { results, streak } = view;
  const first: StatRow = [
    { label: 'Score', value: formatScore(results.you.score) },
    { label: 'Streak', value: formatStreakDays(streak.current) },
  ];

  if (results.percentile === null) {
    return [first, [{ label: 'Crowd', value: formatPlayerCount(results.playerCount) }]];
  }

  return [
    first,
    [
      { label: 'Crowd', value: formatPercentile(results.percentile) },
      { label: 'Players', value: String(results.playerCount) },
    ],
  ];
}

export function resultLegend(): LegendItem[] {
  return [
    { label: 'Truth', shape: 'ring' },
    { label: 'You', shape: 'cross' },
    { label: 'Best fit', shape: 'diamond' },
    { label: 'Crowd', shape: 'dot' },
  ];
}

export function resultMarkers(results: ResultsPayload): ResultMarker[] {
  const markers: ResultMarker[] = [
    { kind: 'truth', label: 'TRUTH', point: results.truth },
    { kind: 'you', label: 'YOU', point: { x: results.you.x, y: results.you.y } },
    {
      kind: 'best',
      label: 'BEST FIT',
      point: { x: results.solverFit.x, y: results.solverFit.y },
    },
  ];

  if (results.crowdMedian) {
    markers.push({
      kind: 'median',
      label: 'CROWD MEDIAN',
      point: results.crowdMedian,
    });
  }

  return markers;
}
