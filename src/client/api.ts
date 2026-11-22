/**
 * @file        src/client/api.ts
 * @purpose     Calls the three public API routes and validates every response before the UI can use it.
 * @layer       client (I/O: fetch only, no DOM)
 * @keyFunctions
 *   - createApi(fetcher?, baseUrl?): ClientApi
 *   - ApiResponse / ApiErrorInfo / FetchLike
 *   - parsePuzzlePayload / parseGuessResult / parseResultsPayload
 * @invariants  a response reaches the UI only after a full shape check; the guess body is exactly {x,y}; no retries here
 * @security    S3, S5, S10: runtime validation, no score sent, no HTML or internal endpoint, generic error codes
 * @tests       tests/client/api.test.ts
 * @spec        01-spec.md section 5; P4-client.md step 2
 */
import {
  CLOUD_BINS,
  MAP_SIZE_KM,
  SCORE_BINS,
} from '../shared/constants';
import { isValidDateKey } from '../shared/dates';
import type {
  ClosedPuzzle,
  GuessInput,
  GuessResult,
  Point,
  PuzzlePayload,
  ResultsPayload,
  Station,
  StationId,
  SplashState,
  Streak,
} from '../shared/types';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type ApiErrorInfo =
  | {
      kind: 'http';
      status: number;
      code: string;
      retryAfterS: number | null;
    }
  | { kind: 'network' }
  | { kind: 'invalid' };

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorInfo };

export type ClientApi = {
  getPuzzle(): Promise<ApiResponse<PuzzlePayload>>;
  postGuess(input: GuessInput): Promise<ApiResponse<GuessResult>>;
  getResults(): Promise<ApiResponse<ResultsPayload>>;
};

type Rec = Record<string, unknown>;

const STATION_IDS: readonly StationId[] = ['A', 'B', 'C', 'D'];

function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function integerIn(value: unknown, low: number, high: number): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= low &&
    value <= high
    ? value
    : null;
}

function pointIn(value: unknown, mapSizeKm: number): Point | null {
  const record = asRecord(value);
  if (!record || !finite(record.x) || !finite(record.y)) {
    return null;
  }
  if (record.x < 0 || record.x > mapSizeKm || record.y < 0 || record.y > mapSizeKm) {
    return null;
  }
  return { x: record.x, y: record.y };
}

function parseStreak(value: unknown): Streak | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const current = integerIn(record.current, 0, Number.MAX_SAFE_INTEGER);
  const best = integerIn(record.best, 0, Number.MAX_SAFE_INTEGER);
  return current === null || best === null ? null : { current, best };
}

function parseStations(value: unknown, mapSizeKm: number): Station[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
    return null;
  }

  const stations: Station[] = [];
  const ids = new Set<StationId>();

  for (const entry of value) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string') {
      return null;
    }
    if (!STATION_IDS.includes(record.id as StationId)) {
      return null;
    }
    const id = record.id as StationId;
    if (ids.has(id)) {
      return null;
    }
    const point = pointIn(record, mapSizeKm);
    if (!point || !finite(record.delayS) || record.delayS < 0) {
      return null;
    }
    ids.add(id);
    stations.push({ id, x: point.x, y: point.y, delayS: record.delayS });
  }

  return stations;
}

function parseFault(value: unknown, mapSizeKm: number): Point[] | null | undefined {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }

  const points: Point[] = [];
  for (const entry of value) {
    const point = pointIn(entry, mapSizeKm);
    if (!point) {
      return undefined;
    }
    points.push(point);
  }
  return points;
}

function parseMapSize(value: unknown): number | null {
  return finite(value) && value > 0 ? value : null;
}

function parseSplashState(value: unknown): SplashState | null {
  return value === 'open' || value === 'played' || value === 'closed'
    ? value
    : null;
}

export function parsePuzzlePayload(value: unknown): PuzzlePayload | null {
  const record = asRecord(value);
  if (!record || typeof record.alreadyGuessed !== 'boolean') {
    return null;
  }

  const streak = parseStreak(record.streak);
  const splashState = parseSplashState(record.splashState);
  if (!streak || !splashState) {
    return null;
  }

  if (record.status === 'closed') {
    const dateKey =
      record.dateKey === null
        ? null
        : typeof record.dateKey === 'string' && isValidDateKey(record.dateKey)
          ? record.dateKey
          : undefined;
    if (dateKey === undefined) {
      return null;
    }
    const closed: ClosedPuzzle = {
      status: 'closed',
      splashState,
      dateKey,
      alreadyGuessed: record.alreadyGuessed,
      streak,
    };
    return closed;
  }

  if (record.status !== 'open') {
    return null;
  }
  if (typeof record.dateKey !== 'string' || !isValidDateKey(record.dateKey)) {
    return null;
  }
  const mapSizeKm = parseMapSize(record.mapSizeKm);
  if (mapSizeKm === null) {
    return null;
  }
  const stations = parseStations(record.stations, mapSizeKm);
  const fault = parseFault(record.fault, mapSizeKm);
  if (!stations || fault === undefined) {
    return null;
  }

  return {
    status: 'open',
    splashState,
    dateKey: record.dateKey,
    mapSizeKm,
    stations,
    fault,
    alreadyGuessed: record.alreadyGuessed,
    streak,
  };
}

export function parseGuessResult(value: unknown): GuessResult | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const truth = pointIn(record.truth, MAP_SIZE_KM);
  const streak = parseStreak(record.streak);
  if (
    !truth ||
    !streak ||
    !finite(record.errorKm) ||
    record.errorKm < 0
  ) {
    return null;
  }
  const score = integerIn(record.score, 0, SCORE_BINS * 10 - 10);
  const stars = integerIn(record.stars, 0, 3);
  if (score === null || stars === null) {
    return null;
  }

  return {
    errorKm: record.errorKm,
    score,
    stars,
    truth,
    streak,
  };
}

function parseCloud(
  value: unknown
): Array<{ cx: number; cy: number; n: number }> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const cells: Array<{ cx: number; cy: number; n: number }> = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      return null;
    }
    const cx = integerIn(record.cx, 0, CLOUD_BINS - 1);
    const cy = integerIn(record.cy, 0, CLOUD_BINS - 1);
    const n = integerIn(record.n, 1, Number.MAX_SAFE_INTEGER);
    if (cx === null || cy === null || n === null) {
      return null;
    }
    cells.push({ cx, cy, n });
  }
  return cells;
}

export function parseResultsPayload(value: unknown): ResultsPayload | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const mapSizeKm = parseMapSize(record.mapSizeKm);
  if (mapSizeKm === null) {
    return null;
  }

  const truth = pointIn(record.truth, mapSizeKm);
  const solver = asRecord(record.solverFit);
  const solverPoint = solver ? pointIn(solver, mapSizeKm) : null;
  const cloud = parseCloud(record.cloud);
  const crowdMedian =
    record.crowdMedian === null ? null : pointIn(record.crowdMedian, mapSizeKm);
  const playerCount = integerIn(record.playerCount, 0, Number.MAX_SAFE_INTEGER);
  const percentile =
    record.percentile === null ? null : integerIn(record.percentile, 0, 100);
  const you = asRecord(record.you);
  const youPoint = you ? pointIn(you, mapSizeKm) : null;
  const stations = parseStations(record.stations, mapSizeKm);
  const fault = parseFault(record.fault, mapSizeKm);

  if (
    !truth ||
    !solver ||
    !solverPoint ||
    !finite(solver.errorKm) ||
    solver.errorKm < 0 ||
    !cloud ||
    (record.crowdMedian !== null && !crowdMedian) ||
    playerCount === null ||
    (record.percentile !== null && percentile === null) ||
    !you ||
    !youPoint ||
    !finite(you.errorKm) ||
    you.errorKm < 0 ||
    integerIn(you.score, 0, 1000) === null ||
    integerIn(you.stars, 0, 3) === null ||
    !stations ||
    !fault
  ) {
    return null;
  }

  return {
    truth,
    solverFit: { x: solverPoint.x, y: solverPoint.y, errorKm: solver.errorKm },
    cloud,
    crowdMedian,
    playerCount,
    percentile,
    you: {
      x: youPoint.x,
      y: youPoint.y,
      errorKm: you.errorKm,
      score: integerIn(you.score, 0, 1000)!,
      stars: integerIn(you.stars, 0, 3)!,
    },
    stations,
    mapSizeKm,
    fault,
  };
}

async function readError(response: Response): Promise<{
  code: string;
  retryAfterS: number | null;
}> {
  let code = 'unknown';
  try {
    const body: unknown = await response.json();
    const record = asRecord(body);
    if (record && typeof record.error === 'string') {
      code = record.error;
    }
  } catch {
    // A non-JSON error body keeps the generic code.
  }

  const header = response.headers.get('retry-after');
  const retryAfterS =
    header !== null && /^\d+$/.test(header) ? Number.parseInt(header, 10) : null;

  return { code, retryAfterS };
}

function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

async function request<T>(
  fetcher: FetchLike,
  url: string,
  init: RequestInit,
  parse: (value: unknown) => T | null
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (!response.ok) {
    const { code, retryAfterS } = await readError(response);
    return {
      ok: false,
      error: { kind: 'http', status: response.status, code, retryAfterS },
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: { kind: 'invalid' } };
  }

  const data = parse(body);
  return data === null
    ? { ok: false, error: { kind: 'invalid' } }
    : { ok: true, data };
}

export function createApi(
  fetcher: FetchLike = defaultFetch,
  baseUrl = ''
): ClientApi {
  return {
    getPuzzle() {
      return request(fetcher, `${baseUrl}/api/puzzle`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }, parsePuzzlePayload);
    },
    postGuess(input) {
      return request(fetcher, `${baseUrl}/api/guess`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ x: input.x, y: input.y }),
      }, parseGuessResult);
    },
    getResults() {
      return request(fetcher, `${baseUrl}/api/results`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }, parseResultsPayload);
    },
  };
}
