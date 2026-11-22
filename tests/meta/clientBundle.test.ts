/**
 * @file        tests/meta/clientBundle.test.ts
 * @purpose     Proves neither the client source nor the built client bundle contains an /internal/ endpoint path.
 * @covers      src/client/**, dist/client/**
 * @spec        04-security.md S15; P3-devvit-wiring.md step 7
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src', 'client');
const BUILT = join(ROOT, 'dist', 'client');

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function internalReferences(directory: string): string[] {
  return filesUnder(directory).filter((file) =>
    readFileSync(file, 'utf8').includes('/internal/')
  );
}

async function ensureBuiltClient(): Promise<void> {
  if (existsSync(join(BUILT, 'splash.html'))) {
    return;
  }

  await build({
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'silent',
  });
}

describe('client bundle', () => {
  it('never references an internal endpoint in source', () => {
    expect(internalReferences(SRC)).toEqual([]);
  });

  it('never references an internal endpoint in the built output', async () => {
    await ensureBuiltClient();

    expect(existsSync(join(BUILT, 'splash.html'))).toBe(true);
    expect(existsSync(join(BUILT, 'game.html'))).toBe(true);
    expect(internalReferences(BUILT)).toEqual([]);
  });
});
