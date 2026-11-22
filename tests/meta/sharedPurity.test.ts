/**
 * @file        tests/meta/sharedPurity.test.ts
 * @purpose     Proves the shared layer imports no Devvit or Node modules and reads no clock or global randomness.
 * @covers      src/shared
 * @spec        02-architecture-and-headers.md section 1; P1-shared-core.md gate
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFiles } from '../../scripts/check-headers';

const BANNED = ['@devvit/', 'Date.now', 'Math.random', 'performance.now', 'node:'];

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('shared purity', () => {
  it('has no Devvit imports, clock reads or global randomness', () => {
    const files = listFiles(join(process.cwd(), 'src', 'shared'), new Set(['.ts']));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const token of BANNED) {
        expect(
          code.includes(token),
          `${file} contains banned token ${token}`
        ).toBe(false);
      }
    }
  });
});
