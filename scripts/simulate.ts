/**
 * @file        scripts/simulate.ts
 * @purpose     Runs the 500-seed calibration sweep and prints mean scores and star shares for three baselines.
 * @layer       scripts (calibration tooling)
 * @keyFunctions
 *   - parseSeeds(argv): number
 *   - runSimulation(seeds): SimulationResult
 *   - formatTable(result): string
 *   - checkTargets(result): string[]
 *   - writeCalibration(result): void
 * @invariants  deterministic for a fixed seed count; prints by default; writes docs/DECISIONS.md only with --write-calibration
 * @security    none (local tooling, no secrets)
 * @tests       none (the printed table and the target lines are the evidence)
 * @spec        03-tdd-and-testing.md section 4b; D-009; D-018; D-019
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRng, gaussian } from '../src/shared/rng';
import { clampToMap, distanceKm } from '../src/shared/geometry';
import { generatePuzzle } from '../src/shared/generator';
import { scoreFromError, starsFromError } from '../src/shared/scoring';
import type { Point, PrivatePuzzle } from '../src/shared/types';

const DEFAULT_SEEDS = 500;
const WEEK: ReadonlyArray<{ dateKey: string; weekday: string }> = [
  { dateKey: '2026-11-16', weekday: 'Mon' },
  { dateKey: '2026-11-17', weekday: 'Tue' },
  { dateKey: '2026-11-18', weekday: 'Wed' },
  { dateKey: '2026-11-19', weekday: 'Thu' },
  { dateKey: '2026-11-20', weekday: 'Fri' },
  { dateKey: '2026-11-21', weekday: 'Sat' },
  { dateKey: '2026-11-22', weekday: 'Sun' },
];

export type BaselineStats = {
  meanScore: number;
  starShare: [number, number, number, number];
};

export type DayResult = {
  dateKey: string;
  weekday: string;
  centroid: BaselineStats;
  human: BaselineStats;
  solver: BaselineStats;
};

export type SimulationResult = {
  seeds: number;
  days: DayResult[];
};

const HUMAN_PIN_SIGMA_KM = 15;
const HUMAN_DRAWS_PER_SEED = 3;
const CALIBRATION_BEGIN = '<!-- CALIBRATION:BEGIN -->';
const CALIBRATION_END = '<!-- CALIBRATION:END -->';

export function parseSeeds(argv: readonly string[]): number {
  const inline = argv.find((argument) => argument.startsWith('--seeds='));
  const index = argv.indexOf('--seeds');

  let raw = DEFAULT_SEEDS;
  if (inline) {
    raw = Number(inline.slice('--seeds='.length));
  } else if (index >= 0) {
    raw = Number(argv[index + 1]);
  }

  if (!Number.isInteger(raw) || raw < 1) {
    throw new Error('--seeds needs a positive integer');
  }
  return raw;
}

function centroid(puzzle: PrivatePuzzle): Point {
  let x = 0;
  let y = 0;
  for (const station of puzzle.stations) {
    x += station.x;
    y += station.y;
  }
  return { x: x / puzzle.stations.length, y: y / puzzle.stations.length };
}

function humanPins(puzzle: PrivatePuzzle): Point[] {
  const rng = createRng((puzzle.seed ^ 0x5eed1234) >>> 0);
  const pins: Point[] = [];
  for (let draw = 0; draw < HUMAN_DRAWS_PER_SEED; draw += 1) {
    const offsetX = gaussian(rng) * HUMAN_PIN_SIGMA_KM;
    const offsetY = gaussian(rng) * HUMAN_PIN_SIGMA_KM;
    pins.push(
      clampToMap({
        x: puzzle.solverFit.x + offsetX,
        y: puzzle.solverFit.y + offsetY,
      })
    );
  }
  return pins;
}

function statsFor(errors: readonly number[]): BaselineStats {
  let totalScore = 0;
  const stars = [0, 0, 0, 0];
  for (const error of errors) {
    const score = scoreFromError(error);
    totalScore += score;
    const star = starsFromError(error);
    stars[3 - star] = (stars[3 - star] ?? 0) + 1;
  }

  const count = Math.max(1, errors.length);
  return {
    meanScore: totalScore / count,
    starShare: stars.map((value) => (100 * value) / count) as [
      number,
      number,
      number,
      number,
    ],
  };
}

export function runSimulation(seeds: number): SimulationResult {
  const days: DayResult[] = [];

  for (const entry of WEEK) {
    const centroidErrors: number[] = [];
    const humanErrors: number[] = [];
    const solverErrors: number[] = [];

    for (let seed = 0; seed < seeds; seed += 1) {
      const puzzle = generatePuzzle(seed, entry.dateKey);
      centroidErrors.push(
        distanceKm(centroid(puzzle), puzzle.truth)
      );
      solverErrors.push(distanceKm(puzzle.solverFit, puzzle.truth));
      for (const pin of humanPins(puzzle)) {
        humanErrors.push(distanceKm(pin, puzzle.truth));
      }
    }

    days.push({
      dateKey: entry.dateKey,
      weekday: entry.weekday,
      centroid: statsFor(centroidErrors),
      human: statsFor(humanErrors),
      solver: statsFor(solverErrors),
    });
  }

  return { seeds, days };
}

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTable(result: SimulationResult): string {
  const lines: string[] = [
    `Calibration over ${result.seeds} seeds per weekday`,
    '',
    '| Day | Baseline | Mean score | 3-star | 2-star | 1-star | 0-star |',
    '|---|---|---|---|---|---|---|',
  ];

  for (const day of result.days) {
    for (const [name, stats] of [
      ['centroid', day.centroid],
      ['human proxy', day.human],
      ['solver', day.solver],
    ] as const) {
      lines.push(
        `| ${day.weekday} | ${name} | ${stats.meanScore.toFixed(1)} | ${percent(
          stats.starShare[0]
        )} | ${percent(stats.starShare[1])} | ${percent(
          stats.starShare[2]
        )} | ${percent(stats.starShare[3])} |`
      );
    }
  }

  return lines.join('\n');
}

export function checkTargets(result: SimulationResult): string[] {
  const mon = result.days.find((day) => day.weekday === 'Mon');
  const sat = result.days.find((day) => day.weekday === 'Sat');
  if (!mon || !sat) {
    return ['calibration data is missing Mon or Sat'];
  }

  const failures: string[] = [];
  const gap = mon.human.meanScore - sat.human.meanScore;
  if (gap < 40) {
    failures.push(`human mean score Mon minus Sat is ${gap.toFixed(1)}, needs >= 40`);
  }
  if (mon.human.starShare[0] > 50) {
    failures.push(
      `Mon human 3-star rate is ${mon.human.starShare[0].toFixed(1)}%, needs <= 50%`
    );
  }
  if (sat.human.starShare[0] > 40) {
    failures.push(
      `Sat human 3-star rate is ${sat.human.starShare[0].toFixed(1)}%, needs <= 40%`
    );
  }
  return failures;
}

export function writeCalibration(
  result: SimulationResult,
  cwd = process.cwd()
): void {
  const target = join(cwd, 'docs', 'DECISIONS.md');
  const section = [
    CALIBRATION_BEGIN,
    '## P1 calibration',
    '',
    `Generated by \`tsx scripts/simulate.ts --seeds ${result.seeds} --write-calibration\` on the P1 gate.`,
    '',
    formatTable(result),
    CALIBRATION_END,
  ].join('\n');

  const text = readFileSync(target, 'utf8');
  const start = text.indexOf(CALIBRATION_BEGIN);
  const end = text.indexOf(CALIBRATION_END);

  const next =
    start >= 0 && end > start
      ? `${text.slice(0, start)}${section}${text.slice(end + CALIBRATION_END.length)}`
      : `${text.trimEnd()}\n\n${section}\n`;

  writeFileSync(target, next, 'utf8');
}

function main(): void {
  const seeds = parseSeeds(process.argv.slice(2));
  const result = runSimulation(seeds);

  console.log(formatTable(result));

  const failures = checkTargets(result);
  if (failures.length > 0) {
    console.error('');
    for (const failure of failures) {
      console.error(`target missed: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\ntargets: ok');
  }

  if (process.argv.includes('--write-calibration')) {
    writeCalibration(result);
    console.log('calibration written to docs/DECISIONS.md');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
