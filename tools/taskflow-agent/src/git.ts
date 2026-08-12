import { spawnSync } from 'node:child_process';
import { PreflightError } from './exit.js';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export function gitTry(args: string[], cwd: string): GitResult {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error !== undefined) {
    throw new PreflightError(`could not run git: ${result.error.message}`);
  }
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    code: result.status ?? -1,
  };
}

export function git(args: string[], cwd: string): string {
  const result = gitTry(args, cwd);
  if (!result.ok) {
    throw new PreflightError(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export interface WorktreeEntry {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
}

/** Parses `git worktree list --porcelain`: blank-line separated stanzas of key/value lines. */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (current !== null) entries.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = trimmed.split(' ');
    const value = rest.join(' ');
    if (key === 'worktree') {
      if (current !== null) entries.push(current);
      current = { path: value, head: null, branch: null, detached: false };
    } else if (current === null) {
      continue;
    } else if (key === 'HEAD') {
      current.head = value;
    } else if (key === 'branch') {
      current.branch = value.replace(/^refs\/heads\//, '');
    } else if (key === 'detached') {
      current.detached = true;
    }
  }
  if (current !== null) entries.push(current);
  return entries;
}

/** `refs/remotes/origin/Module12` -> `Module12`. Returns null for anything unexpected. */
export function parseDefaultBranch(symbolicRef: string): string | null {
  const match = /^refs\/remotes\/[^/]+\/(.+)$/.exec(symbolicRef.trim());
  return match === null ? null : match[1]!;
}

export function resolveRepoRoot(cwd: string): string {
  const result = gitTry(['rev-parse', '--show-toplevel'], cwd);
  if (!result.ok) {
    throw new PreflightError(`${cwd} is not inside a git repository.`);
  }
  return result.stdout;
}

export function isWorkingTreeClean(cwd: string): boolean {
  return git(['status', '--porcelain'], cwd) === '';
}

/**
 * Repo-relative paths from `git status --porcelain`. Each line is `XY <path>`,
 * with renames written as `old -> new` and paths quoted when they contain
 * unusual characters.
 */
export function parsePorcelain(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const rest = line.slice(3);
      const arrow = rest.indexOf(' -> ');
      const raw = arrow === -1 ? rest : rest.slice(arrow + 4);
      return raw.replace(/^"(.*)"$/, '$1').trim();
    });
}

export function dirtyPaths(cwd: string): string[] {
  return parsePorcelain(git(['status', '--porcelain'], cwd));
}

export function headSha(cwd: string): string {
  return git(['rev-parse', 'HEAD'], cwd);
}

export function branchExists(branch: string, cwd: string): boolean {
  return gitTry(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd).ok;
}

export function listWorktrees(cwd: string): WorktreeEntry[] {
  return parseWorktreeList(git(['worktree', 'list', '--porcelain'], cwd));
}

export interface DefaultBranch {
  branch: string | null;
  detected: boolean;
}

export function detectDefaultBranch(cwd: string): DefaultBranch {
  const result = gitTry(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd);
  if (!result.ok) return { branch: null, detected: false };
  return { branch: parseDefaultBranch(result.stdout), detected: true };
}
