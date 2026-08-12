import fs from 'node:fs';
import path from 'node:path';
import { filenamesFor } from './approval.js';
import type { ExitCodeValue } from './exit.js';
import { ExitCode } from './exit.js';
import { commitsOnBranch, worktreeDiffStat } from './preflight.js';
import type { RunContext } from './preflight.js';
import type { RunOutcome } from './run.js';
import type { VerifyResult } from './verify.js';

export interface ReportInputs {
  ctx: RunContext;
  outcome: RunOutcome;
  verify: VerifyResult | null;
  exitCode: ExitCodeValue;
  journalPath: string;
  proposalWritten: string | null;
}

function fenced(body: string): string {
  return ['```', body, '```'].join('\n');
}

function subtypeExplanation(outcome: RunOutcome): string {
  switch (outcome.subtype) {
    case 'success':
      return 'the agent finished on its own';
    case 'error_max_turns':
      return 'stopped at the turn ceiling before finishing';
    case 'error_max_budget_usd':
      return 'stopped at the cost ceiling before finishing';
    case 'error_timeout':
      return 'aborted by the host wall-clock timeout';
    case 'error_during_execution':
      return 'the agent errored mid-run';
    case 'no_result':
      return 'no result was reported';
    default:
      return outcome.subtype;
  }
}

export function buildReport(inputs: ReportInputs): string {
  const { ctx, outcome, verify, exitCode, journalPath, proposalWritten } = inputs;
  const { args, meta } = ctx;
  const lines: string[] = [];

  lines.push(`# taskflow-agent ${args.mode} — run ${args.runId}`, '');
  lines.push(`Finished at ${new Date().toISOString()} with exit code ${exitCode}.`, '');

  lines.push('## Run', '');
  lines.push('| | |', '|---|---|');
  lines.push(`| mode | \`${args.mode}\` |`);
  lines.push(`| model | \`${args.model}\` |`);
  lines.push(`| worktree | \`${args.worktree}\` |`);
  lines.push(`| branch | \`${args.branch}\` |`);
  lines.push(`| base commit | \`${meta.baseCommit.slice(0, 12)}\` |`);
  lines.push(`| source checkout | \`${ctx.repoRoot}\` at \`${ctx.sourceHead.slice(0, 12)}\` |`);
  if (args.mode === 'intake') {
    lines.push(`| ticket | \`${args.ticketKey}\` |`);
  } else {
    lines.push(`| input | \`${args.inputPath}\` |`);
    lines.push(`| input sha256 | \`${ctx.inputSha}\` |`);
  }
  if (ctx.approval !== null) {
    lines.push(`| approved by | ${ctx.approval.approver} on ${ctx.approval.date} |`);
  }
  lines.push(
    `| protected branch | ${
      ctx.protectedDetected ? `\`${ctx.protectedBranch ?? 'unknown'}\` (from origin/HEAD)` : 'not detected; refused main/master'
    } |`,
  );
  lines.push(`| journal | \`${journalPath}\` |`);
  lines.push('');

  lines.push('## Bounds', '');
  lines.push('| bound | limit | actual |', '|---|---|---|');
  lines.push(`| turns | ${args.maxTurns} | ${outcome.numTurns} |`);
  lines.push(
    `| cost (estimated) | $${args.maxCostUsd.toFixed(2)} | ${
      outcome.totalCostUsd === null ? 'not reported' : `$${outcome.totalCostUsd.toFixed(4)}`
    } |`,
  );
  lines.push(
    `| wall clock | ${args.timeoutMinutes} min | ${(outcome.wallClockMs / 60_000).toFixed(1)} min |`,
  );
  lines.push('');
  lines.push(`Outcome: \`${outcome.subtype}\` — ${subtypeExplanation(outcome)}.`);
  if (outcome.aborted !== null) {
    lines.push('', `The host aborted this run (${outcome.aborted}); the agent did not stop by itself.`);
  }
  if (outcome.errors.length > 0) {
    lines.push('', 'Reported errors:', '', fenced(outcome.errors.join('\n')));
  }
  lines.push('');
  lines.push(
    `Tokens: ${outcome.tokens.input} in, ${outcome.tokens.output} out, ` +
      `${outcome.tokens.cacheRead} cache read, ${outcome.tokens.cacheCreation} cache write.`,
  );
  lines.push('');

  lines.push('## Tool decisions', '');
  lines.push(`Host gate: ${outcome.gatePassed} passed, ${outcome.gateDenied} denied.`);
  if (outcome.permissionDenials > 0) {
    lines.push('', `The permission layer denied a further ${outcome.permissionDenials} call(s).`);
  }
  if (outcome.denials.length > 0) {
    lines.push('', 'Denied by the host gate:', '');
    for (const denial of outcome.denials) {
      lines.push(`- \`${denial.tool}\` — ${denial.reason}`);
    }
  }
  lines.push('');

  if (args.mode === 'intake' || args.mode === 'plan') {
    const deliverable = args.mode === 'intake' ? 'ticket brief' : 'plan';
    const filenames = filenamesFor(args.mode);
    const nextCommand =
      args.mode === 'intake'
        ? `taskflow-agent plan --brief artifacts/${args.runId}/${filenames.approved} --worktree ${args.worktree}`
        : `taskflow-agent execute --approved-plan artifacts/${args.runId}/${filenames.approved} --worktree ${args.worktree}`;

    lines.push('## Verification', '');
    lines.push(`Not applicable: a ${args.mode} run changes nothing, so there is no build or test to run.`);
    lines.push('');
    lines.push(`## ${args.mode === 'intake' ? 'Ticket brief' : 'Proposal'}`, '');
    if (proposalWritten === null) {
      lines.push(
        `No ${deliverable} was written: the run did not finish successfully. The agent output is in ` +
          'the journal under `assistant.turn`.',
      );
    } else {
      lines.push(`${deliverable === 'plan' ? 'Proposal' : 'Brief'} written to \`${proposalWritten}\`.`, '');
      lines.push(`This is a **proposal, not an approved ${deliverable}**. To approve it:`, '');
      lines.push(
        fenced(
          [
            `cd ${path.dirname(proposalWritten)}`,
            `cp ${filenames.proposed} ${filenames.approved}`,
            `# read it, edit it, then add this as the first line:`,
            `# <!-- approved-by: Your Name ${new Date().toISOString().slice(0, 10)} base: ${meta.baseCommit.slice(0, 12)} -->`,
          ].join('\n'),
        ),
      );
      lines.push('', 'Then run:', '');
      lines.push(fenced(nextCommand));
    }
    lines.push('');
  } else {
    lines.push('## Verification', '');
    if (verify === null || !verify.ran) {
      lines.push(`Did not run: ${verify?.skippedReason ?? 'no verification was attempted'}.`);
    } else {
      lines.push('| step | command | exit |', '|---|---|---|');
      for (const step of verify.steps) {
        const result = step.timedOut ? 'timed out' : String(step.exitCode);
        lines.push(`| ${step.label} | \`${step.command}\` | ${result} |`);
      }
      lines.push('');
      lines.push(verify.passed ? 'Build and tests passed.' : 'Build or tests **failed**.');
      const failed = verify.steps.find((step) => step.exitCode !== 0);
      if (failed !== undefined) {
        lines.push('', `Tail of \`${failed.command}\`:`, '', fenced(failed.tail));
      }
    }
    lines.push('');

    lines.push('## Changes', '');
    lines.push(
      `Nothing was staged and nothing was committed — the branch is at ` +
        `${commitsOnBranch(args.worktree, meta.baseCommit)} commit(s) past its base by design.`,
      '',
    );
    lines.push(fenced(worktreeDiffStat(args.worktree)));
    lines.push('', 'Review it with:', '');
    lines.push(fenced(`git -C "${args.worktree}" diff`));
    lines.push('');

    lines.push('## Acceptance criteria', '');
    if (outcome.finalText === null) {
      lines.push(
        'Not available: the run ended without a final message. See `assistant.turn` in the journal ' +
          'for whatever the agent did produce.',
      );
    } else {
      lines.push(outcome.finalText.trim());
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export function writeReport(inputs: ReportInputs): string {
  const file = path.join(inputs.ctx.artifactsDir, 'report.md');
  fs.writeFileSync(file, buildReport(inputs), 'utf8');
  return file;
}

export function printSummary(inputs: ReportInputs, reportPath: string): void {
  const { ctx, outcome, verify, exitCode } = inputs;
  const status = exitCode === ExitCode.Success ? 'OK' : 'FAILED';
  const out: string[] = [
    '',
    `taskflow-agent ${ctx.args.mode}: ${status} (exit ${exitCode})`,
    `  outcome    ${outcome.subtype} — ${subtypeExplanation(outcome)}`,
    `  turns      ${outcome.numTurns} of ${ctx.args.maxTurns}`,
    `  cost       ${outcome.totalCostUsd === null ? 'not reported' : `$${outcome.totalCostUsd.toFixed(4)}`} of $${ctx.args.maxCostUsd.toFixed(2)} (estimated)`,
    `  tools      ${outcome.gatePassed} passed the gate, ${outcome.gateDenied} denied`,
  ];
  if (ctx.args.mode === 'execute' && verify !== null) {
    out.push(`  verify     ${verify.ran ? (verify.passed ? 'build and tests passed' : 'build or tests failed') : 'did not run'}`);
  }
  if (inputs.proposalWritten !== null) {
    out.push(`  proposal   ${inputs.proposalWritten}`);
  }
  out.push(`  worktree   ${ctx.args.worktree}`);
  out.push(`  report     ${reportPath}`);
  out.push('');
  process.stdout.write(out.join('\n'));
}
