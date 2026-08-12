import fs from 'node:fs';
import path from 'node:path';
import type { Approval } from './approval.js';
import { APPROVED_FILENAME, PROPOSAL_FILENAME, verifyApproval } from './approval.js';
import type { Mode, ParsedArgs } from './args.js';
import { PreflightError } from './exit.js';
import {
  branchExists,
  detectDefaultBranch,
  dirtyPaths,
  git,
  gitTry,
  headSha,
  isWorkingTreeClean,
  listWorktrees,
} from './git.js';
import { sha256 } from './hash.js';
import type { Journal } from './journal.js';
import { isInsideDir, samePath } from './paths.js';

export interface RunMeta {
  runId: string;
  worktree: string;
  branch: string;
  baseCommit: string;
  repoRoot: string;
  createdAt: string;
  createdBy: Mode;
}

export interface RunContext {
  args: ParsedArgs;
  repoRoot: string;
  artifactsDir: string;
  meta: RunMeta;
  sourceHead: string;
  protectedBranch: string | null;
  protectedDetected: boolean;
  worktreeCreated: boolean;
  inputText: string;
  inputSha: string;
  approval: Approval | null;
}

// 'develop' and 'trunk' are the other two common default/integration-branch names alongside main/master; used only when origin/HEAD couldn't be read, so the fallback errs on the side of refusing a plausible default branch.
const FALLBACK_PROTECTED = ['main', 'master', 'develop', 'trunk'];

function readTextFile(file: string, label: string): string {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new PreflightError(`cannot read ${label} at ${file}`);
  }
  if (text.trim() === '') throw new PreflightError(`${label} at ${file} is empty`);
  return text;
}

function readMeta(artifactsDir: string, runId: string): RunMeta {
  const file = path.join(artifactsDir, 'meta.json');
  if (!fs.existsSync(file)) {
    throw new PreflightError(
      `no run metadata at ${file}, so there is nothing approved to execute.\n` +
        `  Run 'taskflow-agent plan' for run id '${runId}' first.`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RunMeta;
  } catch (error) {
    throw new PreflightError(`${file} is not readable JSON: ${error instanceof Error ? error.message : error}`);
  }
}

function writeMeta(artifactsDir: string, meta: RunMeta): void {
  fs.writeFileSync(path.join(artifactsDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function checkApiKey(): void {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (key === undefined || key.trim() === '') {
    throw new PreflightError(
      'ANTHROPIC_API_KEY is not set. The Agent SDK cannot reuse a Claude Code subscription login,\n' +
        '  so an API key is required: $env:ANTHROPIC_API_KEY = "sk-..."',
    );
  }
}

function checkProtectedBranch(branch: string, repoRoot: string): { branch: string | null; detected: boolean } {
  const detected = detectDefaultBranch(repoRoot);

  if (detected.detected && detected.branch !== null) {
    if (detected.branch === branch) {
      throw new PreflightError(
        `--branch '${branch}' is this repository's default branch and cannot be an execution target.\n` +
          `  Use a fresh branch, e.g. --branch agent/<run-id>.`,
      );
    }
    return { branch: detected.branch, detected: true };
  }

  if (FALLBACK_PROTECTED.includes(branch)) {
    throw new PreflightError(
      `--branch '${branch}' is a conventionally protected branch and cannot be an execution target.\n` +
        `  (origin/HEAD is not set, so the default branch could not be detected; refusing ` +
        `${FALLBACK_PROTECTED.join('/')} instead.)`,
    );
  }
  return { branch: null, detected: false };
}

// A worktree nested inside the source checkout would put the parent repo inside the jail, defeating the isolation the jail exists to provide. Checked for reused worktrees as well as new ones -- a nested worktree left behind by an earlier run is no safer for having existed already.
function requireOutsideSourceCheckout(args: ParsedArgs, repoRoot: string): void {
  if (samePath(args.worktree, repoRoot) || isInsideDir(args.worktree, repoRoot)) {
    throw new PreflightError(
      `--worktree ${args.worktree} is inside the source checkout at ${repoRoot}.\n` +
        `  Use a sibling path, e.g. ../taskflow-worktrees/${args.runId}.`,
    );
  }
}

function createWorktree(args: ParsedArgs, repoRoot: string): void {
  const addArgs = branchExists(args.branch, repoRoot)
    ? ['worktree', 'add', args.worktree, args.branch]
    : ['worktree', 'add', '-b', args.branch, args.worktree, 'HEAD'];

  const result = gitTry(addArgs, repoRoot);
  if (!result.ok) {
    const detail = result.stderr || result.stdout;
    if (/already checked out|already used by worktree/i.test(detail)) {
      throw new PreflightError(
        `branch '${args.branch}' is already checked out somewhere else, so it cannot be used here.\n` +
          `  Pick a different --branch, or remove the other worktree with 'git worktree remove'.`,
      );
    }
    throw new PreflightError(`could not create the worktree: ${detail}`);
  }
}

function validateExistingWorktree(args: ParsedArgs, repoRoot: string): void {
  const entry = listWorktrees(repoRoot).find((candidate) => samePath(candidate.path, args.worktree));

  if (entry === undefined) {
    throw new PreflightError(
      `${args.worktree} exists but is not a git worktree of ${repoRoot}.\n` +
        `  Remove it, or point --worktree somewhere else.`,
    );
  }
  if (entry.branch !== args.branch) {
    throw new PreflightError(
      `${args.worktree} is on branch '${entry.branch ?? '(detached)'}' but --branch says '${args.branch}'.`,
    );
  }
  if (!isWorkingTreeClean(args.worktree)) {
    throw new PreflightError(
      `${args.worktree} has uncommitted changes from an earlier run.\n` +
        `  Review them first:  git -C "${args.worktree}" diff\n` +
        `  Then discard them:  git -C "${args.worktree}" reset --hard`,
    );
  }
}

export interface PreflightInputs {
  args: ParsedArgs;
  repoRoot: string;
  artifactsDir: string;
  journal: Journal;
}

// Every refusal path throws PreflightError, so the caller maps them all to exit 2 uniformly. Order matters: the approval check for `execute` runs before the API key check so an unapproved plan is rejected without needing credentials.
export function runPreflight(inputs: PreflightInputs): RunContext {
  const { args, repoRoot, artifactsDir, journal } = inputs;

  const inputText = readTextFile(args.inputPath, args.inputFlag === '--brief' ? 'the brief' : 'the approved plan');
  const inputSha = sha256(inputText);

  let approval: Approval | null = null;
  let approvedMeta: RunMeta | null = null;
  let worktreeCreated = false;

  if (args.mode === 'execute') {
    approvedMeta = readMeta(artifactsDir, args.runId);
    const proposalPath = path.join(artifactsDir, PROPOSAL_FILENAME);
    approval = verifyApproval({
      approvedPath: args.inputPath,
      approvedText: inputText,
      proposedText: fs.existsSync(proposalPath) ? fs.readFileSync(proposalPath, 'utf8') : null,
      baseCommit: approvedMeta.baseCommit,
    });
    journal.append('approval.accepted', {
      approver: approval.approver,
      date: approval.date,
      base: approval.base,
      approvedPlan: args.inputPath,
      approvedPlanSha256: inputSha,
    });
  }

  checkApiKey();

  // The runner's own artifacts live in the repo, so they are excluded here -- otherwise writing the journal would make the tool fail its own clean check in any repo that does not happen to gitignore artifacts/.
  const artifactsRoot = path.join(repoRoot, 'artifacts');
  const dirty = dirtyPaths(repoRoot).filter((rel) => {
    const absolute = path.resolve(repoRoot, rel);
    return !samePath(absolute, artifactsRoot) && !isInsideDir(absolute, artifactsRoot);
  });

  if (dirty.length > 0) {
    const shown = dirty.slice(0, 8).map((rel) => `    ${rel}`);
    if (dirty.length > shown.length) shown.push(`    ... and ${dirty.length - shown.length} more`);
    throw new PreflightError(
      `the source checkout at ${repoRoot} has ${dirty.length} uncommitted change(s):\n` +
        `${shown.join('\n')}\n` +
        `  The worktree's base commit would not describe what you reviewed. Commit or stash first.`,
    );
  }

  const sourceHead = headSha(repoRoot);
  const protection = checkProtectedBranch(args.branch, repoRoot);

  requireOutsideSourceCheckout(args, repoRoot);

  if (fs.existsSync(args.worktree)) {
    validateExistingWorktree(args, repoRoot);
    worktreeCreated = false;
  } else {
    createWorktree(args, repoRoot);
    worktreeCreated = true;
  }

  // Read after the worktree exists, and journalled from this value rather than the source HEAD: `git worktree add <path> <existing-branch>` checks out that branch's tip, which need not be the source checkout's HEAD.
  const worktreeHead = headSha(args.worktree);
  journal.append(worktreeCreated ? 'worktree.created' : 'worktree.reused', {
    worktree: args.worktree,
    branch: args.branch,
    base: worktreeHead,
    sourceHead,
  });

  let meta: RunMeta;
  if (approvedMeta === null) {
    meta = {
      runId: args.runId,
      worktree: args.worktree,
      branch: args.branch,
      baseCommit: worktreeHead,
      repoRoot,
      createdAt: new Date().toISOString(),
      createdBy: 'plan',
    };
    writeMeta(artifactsDir, meta);
  } else {
    // Nothing in this tool commits, so a worktree HEAD that has moved off the recorded base means someone committed by hand -- the approval no longer describes the tree it would be applied to.
    if (worktreeHead !== approvedMeta.baseCommit) {
      throw new PreflightError(
        `${args.worktree} is no longer at the commit the plan was approved against.\n` +
          `  approved base: ${approvedMeta.baseCommit.slice(0, 12)}\n` +
          `  worktree HEAD: ${worktreeHead.slice(0, 12)}`,
      );
    }
    meta = approvedMeta;
  }

  return {
    args,
    repoRoot,
    artifactsDir,
    meta,
    sourceHead,
    protectedBranch: protection.branch,
    protectedDetected: protection.detected,
    worktreeCreated,
    inputText,
    inputSha,
    approval,
  };
}

export function worktreeDiffStat(worktree: string): string {
  const result = gitTry(['diff', '--stat'], worktree);
  const staged = gitTry(['diff', '--cached', '--stat'], worktree);
  const untracked = gitTry(['ls-files', '--others', '--exclude-standard'], worktree);
  const parts: string[] = [];
  if (result.ok && result.stdout !== '') parts.push(result.stdout);
  if (staged.ok && staged.stdout !== '') parts.push(`staged:\n${staged.stdout}`);
  if (untracked.ok && untracked.stdout !== '') parts.push(`untracked:\n${untracked.stdout}`);
  return parts.length > 0 ? parts.join('\n') : '(no changes)';
}

export function commitsOnBranch(worktree: string, baseCommit: string): number {
  const result = gitTry(['rev-list', '--count', `${baseCommit}..HEAD`], worktree);
  return result.ok ? Number(result.stdout) || 0 : 0;
}
