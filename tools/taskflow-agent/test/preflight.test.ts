import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';
import { approvalHeaderExample, filenamesFor } from '../src/approval.js';
import type { Mode, ParsedArgs } from '../src/args.js';
import { PreflightError } from '../src/exit.js';
import { git } from '../src/git.js';
import { Journal } from '../src/journal.js';
import type { RunMeta } from '../src/preflight.js';
import { runPreflight } from '../src/preflight.js';

// runPreflight shells out to real git and touches only the filesystem -- no Agent SDK, no network --
// so it's unit-testable the same way policy.test.ts jails a temp directory, just with a real repo.
const tempRoots: string[] = [];
let counter = 0;

function tempDir(prefix: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tempRoots.push(dir);
  return dir;
}

function makeRepo(): string {
  const repoRoot = tempDir('tfa-repo-');
  git(['init'], repoRoot);
  git(['config', 'user.email', 'test@example.com'], repoRoot);
  git(['config', 'user.name', 'Test'], repoRoot);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'hello\n');
  git(['add', '.'], repoRoot);
  git(['commit', '-m', 'init'], repoRoot);
  return repoRoot;
}

function nextRunId(): string {
  counter += 1;
  return `run-${counter}`;
}

function planArgs(overrides: Partial<ParsedArgs> & { worktree: string; runId: string; inputPath: string }): ParsedArgs {
  return {
    mode: 'plan',
    inputFlag: '--brief',
    ticketKey: null,
    branch: `agent/${overrides.runId}`,
    model: 'claude-sonnet-5',
    maxTurns: 15,
    maxCostUsd: 2,
    timeoutMinutes: 30,
    ...overrides,
  };
}

function run(repoRoot: string, artifactsDir: string, args: ParsedArgs) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const journal = new Journal(path.join(artifactsDir, 'journal.jsonl'));
  return runPreflight({ args, repoRoot, artifactsDir, journal });
}

function writeMetaFile(artifactsDir: string, meta: RunMeta): void {
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function fabricatedMeta(overrides: Partial<RunMeta> & { runId: string; worktree: string; branch: string; baseCommit: string; repoRoot: string; createdBy: Mode }): RunMeta {
  return { createdAt: new Date(0).toISOString(), ...overrides };
}

before(() => {
  process.env['ANTHROPIC_API_KEY'] = 'test-key-not-real';
});

after(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeBrief(artifactsDir: string, text = 'A hand-written brief.\n'): string {
  const briefPath = path.join(artifactsDir, 'brief.md');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(briefPath, text);
  return briefPath;
}

describe('runPreflight — a fresh run-id', () => {
  test('plan with a hand-written brief needs no approval and records createdBy: plan', () => {
    const repoRoot = makeRepo();
    const runId = nextRunId();
    const worktree = path.join(os.tmpdir(), `tfa-wt-${runId}`);
    tempRoots.push(worktree);
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir, 'A hand-written brief, never touched intake.\n');

    const ctx = run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath }));

    assert.equal(ctx.approval, null);
    assert.equal(ctx.meta.createdBy, 'plan');
    assert.ok(fs.existsSync(path.join(artifactsDir, 'meta.json')), 'meta.json should have been written');
  });
});

describe('runPreflight — protected branch', () => {
  test('refuses when --branch matches the detected default branch (origin/HEAD)', () => {
    const repoRoot = makeRepo();
    // No real network remote needed: detectDefaultBranch only ever reads local ref files.
    const defaultBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot).trim();
    git(['update-ref', `refs/remotes/origin/${defaultBranch}`, `refs/heads/${defaultBranch}`], repoRoot);
    git(['symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${defaultBranch}`], repoRoot);

    const runId = nextRunId();
    const worktree = path.join(os.tmpdir(), `tfa-wt-${runId}`);
    tempRoots.push(worktree);
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir);

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch: defaultBranch })),
      (error) => error instanceof PreflightError && /is this repository's default branch/.test(error.message),
    );
  });

  test('refuses a conventionally protected branch name when origin/HEAD cannot be detected', () => {
    const repoRoot = makeRepo(); // no origin ref set up at all
    const runId = nextRunId();
    const worktree = path.join(os.tmpdir(), `tfa-wt-${runId}`);
    tempRoots.push(worktree);
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir);

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch: 'main' })),
      (error) => error instanceof PreflightError && /conventionally protected branch/.test(error.message),
    );
  });
});

describe('runPreflight — worktree placement and reuse', () => {
  test('refuses a worktree nested inside the source checkout', () => {
    const repoRoot = makeRepo();
    const runId = nextRunId();
    const worktree = path.join(repoRoot, 'nested-worktree');
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir);

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath })),
      (error) => error instanceof PreflightError && /inside the source checkout/.test(error.message),
    );
  });

  test('refuses an existing --worktree path that is not a git worktree of this repo', () => {
    const repoRoot = makeRepo();
    const runId = nextRunId();
    const worktree = tempDir('tfa-plain-dir-'); // exists, but never `git worktree add`-ed
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir);

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath })),
      (error) => error instanceof PreflightError && /is not a git worktree of/.test(error.message),
    );
  });

  test('refuses an existing worktree whose checked-out branch does not match --branch', () => {
    const repoRoot = makeRepo();
    const runId = nextRunId();
    const worktree = path.join(os.tmpdir(), `tfa-wt-${runId}`);
    tempRoots.push(worktree);
    git(['worktree', 'add', '-b', `other-branch-${runId}`, worktree, 'HEAD'], repoRoot);
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir);

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath })),
      (error) => error instanceof PreflightError && /but --branch says/.test(error.message),
    );
  });

  test('refuses an existing worktree with uncommitted changes from an earlier run', () => {
    const repoRoot = makeRepo();
    const runId = nextRunId();
    const branch = `agent/${runId}`;
    const worktree = path.join(os.tmpdir(), `tfa-wt-${runId}`);
    tempRoots.push(worktree);
    git(['worktree', 'add', '-b', branch, worktree, 'HEAD'], repoRoot);
    fs.writeFileSync(path.join(worktree, 'uncommitted.txt'), 'oops\n');
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);
    const briefPath = makeBrief(artifactsDir);

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch })),
      (error) => error instanceof PreflightError && /uncommitted changes/.test(error.message),
    );
  });
});

describe('runPreflight — plan after intake', () => {
  function setupIntakeRunId(): { repoRoot: string; runId: string; worktree: string; artifactsDir: string; baseCommit: string } {
    const repoRoot = makeRepo();
    const runId = nextRunId();
    const worktree = path.join(os.tmpdir(), `tfa-wt-${runId}`);
    tempRoots.push(worktree);
    const branch = `agent/${runId}`;
    git(['worktree', 'add', '-b', branch, worktree, 'HEAD'], repoRoot);
    const baseCommit = git(['rev-parse', 'HEAD'], worktree).trim();
    const artifactsDir = path.join(repoRoot, 'artifacts', runId);

    writeMetaFile(artifactsDir, fabricatedMeta({ runId, worktree, branch, baseCommit, repoRoot, createdBy: 'intake' }));
    return { repoRoot, runId, worktree, artifactsDir, baseCommit };
  }

  test('refuses a brief with no approval header', () => {
    const { repoRoot, runId, worktree, artifactsDir } = setupIntakeRunId();
    const briefPath = path.join(artifactsDir, 'brief-no-header.md');
    fs.writeFileSync(briefPath, 'Just a brief, no approval header.\n');

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch: `agent/${runId}` })),
      (error) => error instanceof PreflightError && /approval header/.test(error.message),
    );
  });

  test('refuses a brief that is byte-identical to the ticket-brief proposal', () => {
    const { repoRoot, runId, worktree, artifactsDir } = setupIntakeRunId();
    const { proposed } = filenamesFor('intake');
    const proposalText = 'This is the raw ticket brief proposal, unreviewed.\n';
    fs.writeFileSync(path.join(artifactsDir, proposed), proposalText, 'utf8');
    const briefPath = path.join(artifactsDir, 'copy-of-proposal.md');
    fs.writeFileSync(briefPath, proposalText, 'utf8');

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch: `agent/${runId}` })),
      (error) => error instanceof PreflightError && /byte-identical/.test(error.message),
    );
  });

  test('accepts a properly approved brief and carries the approval through', () => {
    const { repoRoot, runId, worktree, artifactsDir, baseCommit } = setupIntakeRunId();
    const briefPath = path.join(artifactsDir, 'brief-approved.md');
    fs.writeFileSync(briefPath, `${approvalHeaderExample(baseCommit)}\n\nApproved brief body.\n`, 'utf8');

    const ctx = run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch: `agent/${runId}` }));

    assert.notEqual(ctx.approval, null);
    assert.equal(ctx.approval?.approver, 'Your Name');
    assert.equal(ctx.meta.createdBy, 'intake');
  });

  test('refuses once the worktree has moved past the recorded base commit', () => {
    const { repoRoot, runId, worktree, artifactsDir, baseCommit } = setupIntakeRunId();

    // Simulate someone committing by hand directly in the worktree between intake and plan.
    fs.writeFileSync(path.join(worktree, 'extra.txt'), 'manual change\n');
    git(['add', '.'], worktree);
    git(['commit', '-m', 'manual change'], worktree);

    const briefPath = path.join(artifactsDir, 'brief-approved.md');
    fs.writeFileSync(briefPath, `${approvalHeaderExample(baseCommit)}\n\nApproved brief body.\n`, 'utf8');

    assert.throws(
      () => run(repoRoot, artifactsDir, planArgs({ worktree, runId, inputPath: briefPath, branch: `agent/${runId}` })),
      (error) => error instanceof PreflightError && /no longer at the commit/.test(error.message),
    );
  });
});
