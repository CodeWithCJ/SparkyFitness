import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { executeCommand } from '../services/backupService.js';

// Regression coverage for GHSA-jh96-mj9m-x796 (CWE-78 OS command injection).
// The restore path once interpolated attacker-controlled values into a shell
// `tar` string. executeCommand now runs argv-based execFile, so metacharacters
// in any argument are inert.
describe('executeCommand runs argv without a shell', () => {
  // Echo each extra argv entry back, `|`-joined, so we can assert the exact
  // values the child received. process.execPath is guaranteed present and
  // portable across the Linux/Mac CI runners.
  const ECHO_ARGV = 'process.stdout.write(process.argv.slice(1).join("|"))';

  it('passes a metacharacter-laden value as a single literal argument', async () => {
    const stdout = await executeCommand(process.execPath, [
      '-e',
      ECHO_ARGV,
      'harmless; echo INJECTED',
      'x',
    ]);
    // The `;`-laden value stays one argument and `echo INJECTED` never runs.
    expect(stdout).toBe('harmless; echo INJECTED|x');
  });

  it('does not evaluate $(...) or backtick command substitution', async () => {
    const stdout = await executeCommand(process.execPath, [
      '-e',
      ECHO_ARGV,
      '$(id)',
      '`id`',
    ]);
    expect(stdout).toBe('$(id)|`id`');
  });
});

// Static guard: the behavioral test proves the helper is safe, but not that
// every call site was migrated off a shell string. This reads the source and
// fails loudly if a future edit reintroduces a shell call.
describe('backupService has no shell-string call sites', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../services/backupService.ts', import.meta.url)),
    'utf8'
  );

  it('never calls exec() (a shell) — only execFile', () => {
    // Matches a bare `exec(`; does not match `execFile(`/`execFileAsync(`,
    // whose next char is `F`.
    expect(source).not.toMatch(/\bexec\s*\(/);
  });

  it('never passes a shell template literal to executeCommand', () => {
    expect(source).not.toMatch(/executeCommand\(\s*`/);
  });
});
