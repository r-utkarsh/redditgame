/**
 * @file        scripts/scan-unsafe-dom.ts
 * @purpose     Scans client TypeScript for banned DOM sinks and dynamic code evaluation.
 * @layer       scripts (meta tooling)
 * @keyFunctions
 *   - UnsafeDomFinding
 *   - findUnsafeDom(text)
 *   - scanClient(cwd?)
 * @invariants  read-only; deterministic order; one finding per rule per line
 * @security    S9: proves the client never uses innerHTML, outerHTML, insertAdjacentHTML, document.write, eval or Function
 * @tests       tests/meta/noUnsafeDom.test.ts
 * @spec        04-security.md S9; 03-tdd-and-testing.md section 6; P0-scaffold.md step 5
 */
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listFiles } from './check-headers';

export type UnsafeDomFinding = { file: string; line: number; rule: string };

const RULES: Array<{ rule: string; pattern: RegExp }> = [
  { rule: 'innerHTML', pattern: /\.innerHTML\s*=/ },
  { rule: 'outerHTML', pattern: /\.outerHTML\s*=/ },
  { rule: 'insertAdjacentHTML', pattern: /\.insertAdjacentHTML\s*\(/ },
  { rule: 'document.write', pattern: /\bdocument\.write\s*\(/ },
  { rule: 'eval', pattern: /\beval\s*\(/ },
  { rule: 'new Function', pattern: /\bnew\s+Function\s*\(/ },
  { rule: 'Function', pattern: /(?<!new\s+)\bFunction\s*\(/ },
];

export function findUnsafeDom(text: string): UnsafeDomFinding[] {
  const findings: UnsafeDomFinding[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ file: '', line: index + 1, rule: rule.rule });
      }
    }
  }

  return findings;
}

export function scanClient(cwd = process.cwd()): UnsafeDomFinding[] {
  const files = listFiles(
    join(cwd, 'src', 'client'),
    new Set(['.ts', '.tsx'])
  ).sort((left, right) => left.localeCompare(right));

  const findings: UnsafeDomFinding[] = [];
  for (const absoluteFile of files) {
    const file = relative(cwd, absoluteFile).split(sep).join('/');
    for (const finding of findUnsafeDom(readFileSync(absoluteFile, 'utf8'))) {
      findings.push({ ...finding, file });
    }
  }

  return findings;
}

function main(): void {
  const findings = scanClient();
  if (findings.length === 0) {
    console.log('unsafe DOM scan: ok');
    return;
  }

  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.rule}`);
  }
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
