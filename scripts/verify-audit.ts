/**
 * @file        scripts/verify-audit.ts
 * @purpose     Runs the production dependency audit with a clean npm environment so a user-level allow-scripts setting cannot break nested npm commands.
 * @layer       scripts (meta tooling)
 * @keyFunctions
 *   - runAudit(): number
 * @invariants  forwards stdio; returns the child exit code; no user input is interpolated into the command
 * @security    S12: supply chain audit gate
 * @tests       none (thin spawn wrapper; the audit result is the gate)
 * @spec        03-tdd-and-testing.md section 6; P0-scaffold.md step 6; D-017
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function runAudit(): number {
  const env = { ...process.env };
  delete env.npm_config_allow_scripts;

  const args = ['audit', '--omit=dev', '--audit-level=high'];
  const npmCli = process.env.npm_execpath;
  const isWindows = process.platform === 'win32';
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], {
        stdio: 'inherit',
        env,
      })
    : spawnSync(isWindows ? 'npm.cmd' : 'npm', args, {
        stdio: 'inherit',
        env,
        shell: isWindows,
      });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runAudit();
}
