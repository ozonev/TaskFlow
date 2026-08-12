import assert from 'node:assert/strict';
import os from 'node:os';
import test, { describe } from 'node:test';
import type { ArtifactFilenames } from '../src/approval.js';
import { filenamesFor } from '../src/approval.js';
import type { Mode, ParsedArgs } from '../src/args.js';
import { ExitCode } from '../src/exit.js';
import { buildReport } from '../src/report.js';
import type { RunContext, RunMeta } from '../src/preflight.js';
import type { RunOutcome } from '../src/run.js';

const WORKTREE = os.tmpdir();
const BASE = '539b3f3e1a2b4c5d6e7f8091a2b3c4d5e6f70819';

function args(mode: Mode, overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    mode,
    inputFlag: mode === 'intake' ? '--ticket' : mode === 'plan' ? '--brief' : '--approved-plan',
    inputPath: mode === 'intake' ? '' : '/repo/brief.md',
    ticketKey: mode === 'intake' ? 'TASK-123' : null,
    worktree: WORKTREE,
    branch: 'agent/run-1',
    runId: 'run-1',
    model: 'claude-sonnet-5',
    maxTurns: 10,
    maxCostUsd: 1,
    timeoutMinutes: 30,
    ...overrides,
  };
}

function meta(mode: Mode): RunMeta {
  return {
    runId: 'run-1',
    worktree: WORKTREE,
    branch: 'agent/run-1',
    baseCommit: BASE,
    repoRoot: '/repo',
    createdAt: new Date(0).toISOString(),
    createdBy: mode,
  };
}

function ctx(mode: Mode): RunContext {
  return {
    args: args(mode),
    repoRoot: '/repo',
    artifactsDir: '/repo/artifacts/run-1',
    meta: meta(mode),
    sourceHead: BASE,
    protectedBranch: 'Module12',
    protectedDetected: true,
    worktreeCreated: false,
    inputText: mode === 'intake' ? '' : 'brief text',
    inputSha: mode === 'intake' ? '' : 'abc123',
    approval: null,
    jiraCredentials: null,
  };
}

function outcome(overrides: Partial<RunOutcome> = {}): RunOutcome {
  return {
    subtype: 'success',
    numTurns: 3,
    totalCostUsd: 0.5,
    sessionId: 'session-1',
    stopReason: null,
    finalText: 'Some final text.',
    errors: [],
    gatePassed: 5,
    gateDenied: 0,
    denials: [],
    permissionDenials: 0,
    tokens: { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 },
    aborted: null,
    wallClockMs: 1234,
    ...overrides,
  };
}

describe('buildReport — intake', () => {
  test('points the next command at plan --brief with the approved ticket brief', () => {
    const filenames: ArtifactFilenames = filenamesFor('intake');
    const report = buildReport({
      ctx: ctx('intake'),
      outcome: outcome(),
      verify: null,
      exitCode: ExitCode.Success,
      journalPath: '/repo/artifacts/run-1/journal.jsonl',
      proposalWritten: `/repo/artifacts/run-1/${filenames.proposed}`,
    });
    assert.match(report, /## Ticket brief/);
    assert.match(report, /\| ticket \| `TASK-123` \|/);
    assert.match(report, /plan --brief artifacts\/run-1\/ticket-brief\.approved\.md/);
  });
});

describe('buildReport — plan (regression guard)', () => {
  test('still points the next command at execute --approved-plan with plan.approved.md', () => {
    const filenames: ArtifactFilenames = filenamesFor('plan');
    const report = buildReport({
      ctx: ctx('plan'),
      outcome: outcome(),
      verify: null,
      exitCode: ExitCode.Success,
      journalPath: '/repo/artifacts/run-1/journal.jsonl',
      proposalWritten: `/repo/artifacts/run-1/${filenames.proposed}`,
    });
    assert.match(report, /## Proposal/);
    assert.match(report, /execute --approved-plan artifacts\/run-1\/plan\.approved\.md/);
  });
});

describe('buildReport — execute', () => {
  test('surfaces the final message verbatim under Acceptance criteria', () => {
    const report = buildReport({
      ctx: ctx('execute'),
      outcome: outcome({ finalText: 'Satisfied: AC1 via FooTests. Not satisfied: AC2 (out of scope).' }),
      verify: { ran: true, passed: true, steps: [], skippedReason: null },
      exitCode: ExitCode.Success,
      journalPath: '/repo/artifacts/run-1/journal.jsonl',
      proposalWritten: null,
    });
    assert.match(report, /## Acceptance criteria/);
    assert.match(report, /Satisfied: AC1 via FooTests\. Not satisfied: AC2 \(out of scope\)\./);
  });

  test('falls back to pointing at the journal when there is no final message', () => {
    const report = buildReport({
      ctx: ctx('execute'),
      outcome: outcome({ finalText: null }),
      verify: { ran: false, passed: false, steps: [], skippedReason: 'the agent crashed' },
      exitCode: ExitCode.SdkError,
      journalPath: '/repo/artifacts/run-1/journal.jsonl',
      proposalWritten: null,
    });
    assert.match(report, /## Acceptance criteria/);
    assert.match(report, /Not available/);
    assert.match(report, /assistant\.turn/);
  });
});
