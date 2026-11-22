/**
 * @file        src/shared/dates.ts
 * @purpose     Converts between Date objects and UTC date keys, validates real calendar days and returns weekday difficulty.
 * @layer       shared (pure: no clock reads; callers pass the Date)
 * @keyFunctions
 *   - toDateKey(date): string
 *   - isValidDateKey(dateKey): boolean
 *   - difficultyForDateKey(dateKey): Difficulty
 *   - isSameUtcDay(left, right): boolean
 *   - addUtcDays(dateKey, days): string
 *   - previousDateKey(dateKey): string
 * @invariants  date keys are YYYY-MM-DD UTC and always describe a real calendar day; no local time zone is used
 * @security    none (pure date math)
 * @tests       tests/shared/dates.test.ts
 * @spec        01-spec.md sections 3 and 6
 */
import { DIFFICULTY_BY_WEEKDAY, type Difficulty } from './constants';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Parsed = { year: number; month: number; day: number; date: Date };

function parseDateKey(dateKey: string): Parsed | null {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return null;
  }

  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date };
}

export function toDateKey(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidDateKey(dateKey: string): boolean {
  return parseDateKey(dateKey) !== null;
}

export function difficultyForDateKey(dateKey: string): Difficulty {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`invalid date key: ${dateKey}`);
  }
  return DIFFICULTY_BY_WEEKDAY[parsed.date.getUTCDay()]!;
}

export function isSameUtcDay(left: Date, right: Date): boolean {
  return toDateKey(left) === toDateKey(right);
}

export function addUtcDays(dateKey: string, days: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`invalid date key: ${dateKey}`);
  }
  if (!Number.isInteger(days)) {
    throw new Error('days must be an integer');
  }

  return toDateKey(
    new Date(
      Date.UTC(parsed.year, parsed.month - 1, parsed.day + days, 12, 0, 0)
    )
  );
}

export function previousDateKey(dateKey: string): string {
  return addUtcDays(dateKey, -1);
}
