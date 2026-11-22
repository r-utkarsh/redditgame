/**
 * @file        tests/meta/headers.test.ts
 * @purpose     Proves the header checker accepts valid files and rejects missing, mismatched and unexported headers.
 * @covers      scripts/check-headers.ts
 * @spec        02-architecture-and-headers.md section 4; P0-scaffold.md step 4
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkHeaders } from '../../scripts/check-headers';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fault-lines-headers-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const validSource = `/**
 * @file        src/example.ts
 * @purpose     Example source file.
 * @layer       shared
 * @keyFunctions
 *   - example(): number
 * @security    none
 * @tests       tests/example.test.ts
 * @spec        02-architecture-and-headers.md section 4
 */
export function example(): number {
  return 1;
}
`;

describe('checkHeaders', () => {
  it('accepts a valid source file', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'example.ts'), validSource);

    expect(checkHeaders({ cwd: dir, roots: ['src'] })).toEqual([]);
  });

  it('rejects the deliberately bad fixture for a missing purpose and an unexported name', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'src'));
    const fixture = readFileSync(
      join(process.cwd(), 'tests', 'fixtures', 'bad-header.fixture.txt'),
      'utf8'
    );
    writeFileSync(join(dir, 'src', 'bad-header.ts'), fixture);

    const messages = checkHeaders({ cwd: dir, roots: ['src'] })
      .map((error) => error.message)
      .join('\n');

    expect(messages).toContain('@purpose');
    expect(messages).toContain('not exported');
  });

  it('rejects a header whose @file does not match the path', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'renamed.ts'), validSource);

    const messages = checkHeaders({ cwd: dir, roots: ['src'] })
      .map((error) => error.message)
      .join('\n');

    expect(messages).toContain('@file');
  });

  it('checks the DOM ids listed by an HTML header', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'src', 'client'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'client', 'page.html'),
      `<!--
  @file        src/client/page.html
  @purpose     Example page.
  @domIds      root, missing
-->
<div id="root"></div>`
    );

    const messages = checkHeaders({ cwd: dir, roots: ['src'] })
      .map((error) => error.message)
      .join('\n');

    expect(messages).toContain('missing');
  });
});
