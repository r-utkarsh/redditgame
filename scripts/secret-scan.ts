/**
 * @file        scripts/secret-scan.ts
 * @purpose     Scans the public repository for private keys, credentials, bearer tokens and committed .env files.
 * @layer       scripts (meta tooling)
 * @keyFunctions
 *   - SecretFinding
 *   - scanText(text, file)
 *   - scanForSecrets(cwd?)
 *   - formatFindings(findings)
 * @invariants  read-only; deterministic order; skips binary files and generated directories
 * @security    S13: prevents secrets from reaching the public repository
 * @tests       tests/meta/noSecrets.test.ts
 * @spec        04-security.md S13; P0-scaffold.md step 4
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export type SecretFinding = { file: string; line: number; rule: string };

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.devvit', '.git']);
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.woff',
  '.woff2',
  '.ttf',
  '.map',
]);
const MAX_FILE_BYTES = 2_000_000;

const RULES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'credential-assignment',
    pattern:
      /\b(?:client_secret|client_id|api_key|apikey|access_token|refresh_token|password)\b\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    name: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/,
  },
  {
    name: 'devvit-token',
    pattern: /\bdevvit[_-]?token\b\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    name: 'github-token',
    pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/,
  },
];

function listTextFiles(root: string): string[] {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    return [];
  }

  if (stats.isFile()) {
    return stats.size <= MAX_FILE_BYTES ? [root] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...listTextFiles(join(root, entry.name)));
      }
    } else if (
      entry.isFile() &&
      !BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(join(root, entry.name));
    }
  }
  return files;
}

export function scanText(text: string, file: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ file, line: index + 1, rule: rule.name });
      }
    }
  }

  return findings;
}

export function scanForSecrets(cwd = process.cwd()): SecretFinding[] {
  const files: string[] = [];
  for (const folder of ['src', 'tests', 'scripts', 'docs']) {
    files.push(...listTextFiles(join(cwd, folder)));
  }

  for (const entry of readdirSync(cwd, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      !BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(join(cwd, entry.name));
    }
  }

  const findings: SecretFinding[] = [];
  for (const absoluteFile of files.sort((left, right) => left.localeCompare(right))) {
    const file = relative(cwd, absoluteFile).split(sep).join('/');
    const parts = file.split('/');
    if (parts.some((part) => IGNORED_DIRS.has(part))) {
      continue;
    }
    const basename = parts[parts.length - 1] ?? '';
    if (basename.startsWith('.env')) {
      findings.push({ file, line: 1, rule: 'env-file' });
    }

    let text: string;
    try {
      text = readFileSync(absoluteFile, 'utf8');
    } catch {
      continue;
    }
    findings.push(...scanText(text, file));
  }

  return findings.sort((left, right) =>
    left.file === right.file
      ? left.line - right.line
      : left.file.localeCompare(right.file)
  );
}

export function formatFindings(findings: SecretFinding[]): string {
  return findings
    .map((finding) => `${finding.file}:${finding.line}: ${finding.rule}`)
    .join('\n');
}

function main(): void {
  const findings = scanForSecrets();
  if (findings.length === 0) {
    console.log('secret scan: ok');
    return;
  }

  console.error(formatFindings(findings));
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
