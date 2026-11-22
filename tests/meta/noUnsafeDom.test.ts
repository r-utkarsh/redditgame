/**
 * @file        tests/meta/noUnsafeDom.test.ts
 * @purpose     Proves the client source has no banned DOM sinks and that the scanner catches every banned pattern.
 * @covers      scripts/scan-unsafe-dom.ts
 * @spec        04-security.md S9; 03-tdd-and-testing.md section 6
 */
import { describe, expect, it } from 'vitest';
import {
  findUnsafeDom,
  scanClient,
} from '../../scripts/scan-unsafe-dom';

describe('unsafe DOM scan', () => {
  it('catches every banned sink in a sample', () => {
    const sample = [
      "element.innerHTML = 'x';",
      "element.outerHTML = 'x';",
      "element.insertAdjacentHTML('beforeend', 'x');",
      "document.write('x');",
      "eval('x');",
      "new Function('return 1');",
      "Function('return 1')();",
    ].join('\n');

    const rules = findUnsafeDom(sample).map((finding) => finding.rule);

    expect(rules).toEqual(
      expect.arrayContaining([
        'innerHTML',
        'outerHTML',
        'insertAdjacentHTML',
        'document.write',
        'eval',
        'new Function',
        'Function',
      ])
    );
  });

  it('finds no banned sinks in src/client', () => {
    expect(scanClient(process.cwd())).toEqual([]);
  });
});
