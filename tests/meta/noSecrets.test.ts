/**
 * @file        tests/meta/noSecrets.test.ts
 * @purpose     Proves the secret scan catches credentials and passes the current public repository.
 * @covers      scripts/secret-scan.ts
 * @spec        04-security.md S13; P0-scaffold.md step 4
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatFindings,
  scanForSecrets,
  scanText,
} from '../../scripts/secret-scan';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fault-lines-secrets-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('secret scan', () => {
  it('catches a fake credential assembled at runtime', () => {
    const fake = ['client', '_secret', ' = ', '"abc12345"'].join('');
    const findings = scanText(fake, 'src/config.ts');

    expect(findings.length).toBeGreaterThan(0);
    expect(formatFindings(findings)).toContain('src/config.ts:1');
  });

  it('leaves ordinary prose alone', () => {
    expect(scanText('The token is discussed in the README.', 'README.md')).toEqual(
      []
    );
  });

  it('flags a committed .env file and a fake token in a root file', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, '.env'), 'PLACEHOLDER=local\n');
    writeFileSync(
      join(dir, 'settings.ts'),
      ['api', '_key', ' = ', '"abc12345"'].join('')
    );

    const findings = scanForSecrets(dir);

    expect(findings.some((finding) => finding.file === '.env')).toBe(true);
    expect(
      findings.some((finding) => finding.file === 'settings.ts')
    ).toBe(true);
  });

  it('flags a nested .env file', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', '.env'), 'PLACEHOLDER=local\n');

    const findings = scanForSecrets(dir);

    expect(findings.some((finding) => finding.file === 'src/.env')).toBe(true);
  });

  it('finds no secrets in the current repository', () => {
    expect(scanForSecrets()).toEqual([]);
  });
});
