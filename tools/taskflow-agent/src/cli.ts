#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PROPOSAL_FILENAME } from './approval.js';
import { parseCliArgs } from './args.js';
import type { ExitCodeValue } from './exit.js';
import { ExitCode, exitCodeOf, RunnerError } from './exit.js';
import { resolveRepoRoot } from './git.js';
import { Journal } from './journal.js';
import { runPreflight } from './preflight.js';
import { printSummary, writeReport } from './report.js';
import { crashedOutcome, runAgent } from './run.js';
import type { VerifyResult } from './verify.js';
import { runVerification } from './verify.js';

function exitCodeForOutcome(subtype: string): ExitCodeValue {
  switch (subtype) {
    case 'success':
      return ExitCode.Success;
    case 'error_max_turns':
      return ExitCode.MaxTurns;
    case 'error_max_budget_usd':
      return ExitCode.MaxBudget;
    default:
      return ExitCode.SdkError;
  }
}

async function main(): Promise<ExitCodeValue> {
  const parsed = parseCliArgs(process.argv.slice(2), process.cwd());
  if (parsed.kind === 'help') {
    process.stdout.write(parsed.text);
    return ExitCode.Success;
  }
  const args = parsed.args;

  // Resolved before the journal exists because the journal lives in the repo. Local, read-only, and no network -- the approval check still precedes any API call.
  const repoRoot = resolveRepoRoot(process.cwd());
  const artifactsDir = path.join(repoRoot, 'artifacts', args.runId);
  fs.mkdirSync(artifactsDir, { recursive: true });
  const journal = new Journal(path.join(artifactsDir, 'journal.jsonl'));

  journal.append('run.start', {
    mode: args.mode,
    runId: args.runId,
    argv: process.argv.slice(2),
    worktree: args.worktree,
    branch: args.branch,
    model: args.model,
    bounds: { maxTurns: args.maxTurns, maxCostUsd: args.maxCostUsd, timeoutMinutes: args.timeoutMinutes },
    repoRoot,
    inputPath: args.inputPath,
    node: process.version,
  });

  let ctx;
  try {
    ctx = runPreflight({ args, repoRoot, artifactsDir, journal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    journal.append('run.refused', { reason: message, exitCode: exitCodeOf(error) });
    throw error;
  }

  journal.append('run.input', { path: args.inputPath, sha256: ctx.inputSha, text: ctx.inputText });

  // A throw here must not skip verification and the report: in execute mode the agent may already have changed files, and that partial change is exactly what needs measuring. The full stack goes to the journal, one readable line to the operator.
  const agentStartedAt = Date.now();
  let outcome;
  let crashMessage: string | null = null;
  try {
    outcome = await runAgent(ctx, journal);
  } catch (error) {
    crashMessage = error instanceof Error ? error.message : String(error);
    journal.append('sdk.result', {
      subtype: 'error_during_execution',
      error: crashMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    outcome = crashedOutcome(crashMessage, Date.now() - agentStartedAt);
  }

  let planWritten: string | null = null;
  if (args.mode === 'plan' && outcome.finalText !== null && outcome.finalText.trim() !== '') {
    planWritten = path.join(artifactsDir, PROPOSAL_FILENAME);
    fs.writeFileSync(planWritten, `${outcome.finalText.trim()}\n`, 'utf8');
  }

  let verify: VerifyResult | null = null;
  if (args.mode === 'execute') {
    // Runs even when the agent errored: a partial change still needs measuring.
    verify = runVerification(args.worktree, journal);
  }

  let exitCode = exitCodeForOutcome(outcome.subtype);
  if (outcome.aborted === 'timeout') exitCode = ExitCode.SdkError;
  if (exitCode === ExitCode.Success && verify !== null && !verify.passed) {
    exitCode = ExitCode.VerificationFailed;
  }
  if (args.mode === 'plan' && exitCode === ExitCode.Success && planWritten === null) {
    exitCode = ExitCode.SdkError;
  }

  const reportInputs = { ctx, outcome, verify, exitCode, journalPath: journal.path, planWritten };
  const reportPath = writeReport(reportInputs);
  printSummary(reportInputs, reportPath);
  journal.append('run.end', { exitCode, report: reportPath, wallClockMs: outcome.wallClockMs });

  if (crashMessage !== null) {
    process.stderr.write(`taskflow-agent: the agent run did not complete:\n  ${crashMessage}\n`);
  }
  return exitCode;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`taskflow-agent: ${message}\n`);
    if (!(error instanceof RunnerError) && error instanceof Error && error.stack !== undefined) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = exitCodeOf(error);
  },
);
