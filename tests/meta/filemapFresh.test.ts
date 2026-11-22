/**
 * @file        tests/meta/filemapFresh.test.ts
 * @purpose     Proves docs/FILEMAP.md is generated from the current headers and is fresh.
 * @covers      scripts/filemap.ts
 * @spec        02-architecture-and-headers.md section 4; 03-tdd-and-testing.md section 5c; P0-scaffold.md step 4
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderFilemap } from '../../scripts/filemap';

describe('FILEMAP freshness', () => {
  it('matches the committed docs/FILEMAP.md exactly', () => {
    const committed = readFileSync(
      join(process.cwd(), 'docs', 'FILEMAP.md'),
      'utf8'
    );

    expect(renderFilemap()).toBe(committed);
  });

  it('includes a source, a test and a script entry', () => {
    const rendered = renderFilemap();

    expect(rendered).toContain('`src/server/app.ts`');
    expect(rendered).toContain('`tests/meta/headers.test.ts`');
    expect(rendered).toContain('`scripts/check-headers.ts`');
  });
});
