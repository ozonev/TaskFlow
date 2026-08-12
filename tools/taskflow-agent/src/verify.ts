import { spawnSync } from 'node:child_process';
import type { Journal } from './journal.js';

export interface VerifyStep {
  label: string;
  command: string;
  exitCode: number;
  durationMs: number;
  tail: string;
  timedOut: boolean;
}

export interface VerifyResult {
  ran: boolean;
  passed: boolean;
  steps: VerifyStep[];
  skippedReason: string | null;
}

const STEP_TIMEOUT_MS = 15 * 60_000;

const STEPS: Array<{ label: string; args: string[] }> = [
  { label: 'restore', args: ['restore'] },
  { label: 'tool restore', args: ['tool', 'restore'] },
  { label: 'build', args: ['build'] },
  // --nologo is deliberately absent: this repo's runner is Microsoft.Testing.Platform
  // (see global.json), which rejects it as an unknown option instead of ignoring it.
  // Category=Postgres needs a live Docker daemon, so it is excluded as it is in CI.
  { label: 'test', args: ['test', '--filter-not-trait', 'Category=Postgres'] },
];

function tailOf(text: string, lines = 25): string {
  return text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-lines).join('\n');
}

/**
 * Runs after the agent has stopped, from the host, with no agent involvement --
 * the model can neither skip these nor influence their result. Stops at the
 * first failure, since later steps would only report the same breakage.
 */
export function runVerification(worktree: string, journal: Journal): VerifyResult {
  const steps: VerifyStep[] = [];

  for (const step of STEPS) {
    const command = `dotnet ${step.args.join(' ')}`;
    const startedAt = Date.now();
    const result = spawnSync('dotnet', step.args, {
      cwd: worktree,
      encoding: 'utf8',
      timeout: STEP_TIMEOUT_MS,
      windowsHide: true,
    });
    const durationMs = Date.now() - startedAt;

    // spawnSync reports a timeout kill through result.error too, so a step that
    // ran for the full 15 minutes and was killed must not be reported the same
    // way as a dotnet binary that could not be launched at all.
    const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';

    if (result.error !== undefined && !timedOut) {
      const reason = `could not run '${command}': ${result.error.message}`;
      journal.append('verify.skipped', { command, reason });
      return { ran: false, passed: false, steps, skippedReason: reason };
    }

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const exitCode = timedOut ? -1 : (result.status ?? -1);
    steps.push({
      label: step.label,
      command,
      exitCode,
      durationMs,
      timedOut,
      tail: timedOut
        ? `killed after ${Math.round(STEP_TIMEOUT_MS / 60_000)} minutes\n${tailOf(output)}`
        : tailOf(output),
    });
    journal.append('verify.step', { command, exitCode, durationMs, timedOut });

    if (exitCode !== 0) {
      return { ran: true, passed: false, steps, skippedReason: null };
    }
  }

  return { ran: true, passed: true, steps, skippedReason: null };
}
