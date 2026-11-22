/**
 * @file        src/shared/validation.ts
 * @purpose     Strictly validates a guess body without coercion and quantizes accepted coordinates to 0.1 km.
 * @layer       shared (pure: no I/O)
 * @keyFunctions
 *   - parseGuessRequest(value): GuessInput | null
 * @invariants  only own enumerable x and y number properties are accepted; strings are never coerced; -0 becomes 0
 * @security    S6: hostile bodies (NaN, Infinity, arrays, nested objects, extra keys, prototype keys) return null
 * @tests       tests/shared/validation.test.ts
 * @spec        01-spec.md section 5; 03-tdd-and-testing.md section 5
 */
import { COORD_QUANTUM_KM, MAP_SIZE_KM } from './constants';
import type { GuessInput } from './types';

function quantize(value: number): number {
  const steps = Math.round(value / COORD_QUANTUM_KM);
  const quantized = steps / (1 / COORD_QUANTUM_KM);
  return quantized === 0 ? 0 : quantized;
}

export function parseGuessRequest(value: unknown): GuessInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('x') || !keys.includes('y')) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const x = record.x;
  const y = record.y;

  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  if (x < 0 || x > MAP_SIZE_KM || y < 0 || y > MAP_SIZE_KM) {
    return null;
  }

  return { x: quantize(x), y: quantize(y) };
}
