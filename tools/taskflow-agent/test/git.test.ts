import assert from 'node:assert/strict';
import path from 'node:path';
import test, { describe } from 'node:test';
import { parseDefaultBranch, parsePorcelain, parseWorktreeList } from '../src/git.js';
import { isInsideDir, normalizeForCompare, realpathNearest, samePath, toPosix } from '../src/paths.js';

describe('parseWorktreeList', () => {
  test('parses the real shape of git worktree list --porcelain', () => {
    const stdout = [
      'worktree C:/develop/TaskFlow',
      'HEAD 539b3f3e1a2b4c5d6e7f8091a2b3c4d5e6f70819',
      'branch refs/heads/Module13',
      '',
      'worktree C:/develop/taskflow-worktrees/run-123',
      'HEAD 539b3f3e1a2b4c5d6e7f8091a2b3c4d5e6f70819',
      'branch refs/heads/agent/run-123',
      '',
    ].join('\n');

    const entries = parseWorktreeList(stdout);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.path, 'C:/develop/TaskFlow');
    assert.equal(entries[0]!.branch, 'Module13', 'refs/heads/ prefix should be stripped');
    assert.equal(entries[1]!.branch, 'agent/run-123', 'a slashed branch name should survive');
    assert.equal(entries[1]!.detached, false);
  });

  test('handles a detached worktree', () => {
    const entries = parseWorktreeList(['worktree /tmp/wt', 'HEAD abc123', 'detached', ''].join('\n'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.detached, true);
    assert.equal(entries[0]!.branch, null);
  });

  test('handles a trailing stanza with no blank line after it', () => {
    const entries = parseWorktreeList(['worktree /tmp/wt', 'HEAD abc123', 'branch refs/heads/x'].join('\n'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.branch, 'x');
  });

  test('handles empty output', () => {
    assert.deepEqual(parseWorktreeList(''), []);
  });

  test('keeps spaces in a worktree path', () => {
    const entries = parseWorktreeList(['worktree C:/my repo/wt', 'HEAD abc123', ''].join('\n'));
    assert.equal(entries[0]!.path, 'C:/my repo/wt');
  });
});

describe('parseDefaultBranch', () => {
  test('extracts the branch from a symbolic ref', () => {
    assert.equal(parseDefaultBranch('refs/remotes/origin/Module12'), 'Module12');
    assert.equal(parseDefaultBranch('refs/remotes/origin/main\n'), 'main');
    assert.equal(parseDefaultBranch('refs/remotes/upstream/release/2.0'), 'release/2.0');
  });

  test('returns null for anything unexpected', () => {
    assert.equal(parseDefaultBranch(''), null);
    assert.equal(parseDefaultBranch('refs/heads/main'), null);
    assert.equal(parseDefaultBranch('Module12'), null);
  });
});

describe('parsePorcelain', () => {
  test('extracts paths across every status code', () => {
    const stdout = [
      ' M src/TaskFlow.Api/Program.cs',
      'A  tools/taskflow-agent/src/cli.ts',
      '?? artifacts/',
      'MM Directory.Packages.props',
      ' D removed.cs',
    ].join('\n');
    assert.deepEqual(parsePorcelain(stdout), [
      'src/TaskFlow.Api/Program.cs',
      'tools/taskflow-agent/src/cli.ts',
      'artifacts/',
      'Directory.Packages.props',
      'removed.cs',
    ]);
  });

  test('takes the destination of a rename', () => {
    assert.deepEqual(parsePorcelain('R  old/Name.cs -> new/Name.cs'), ['new/Name.cs']);
  });

  test('unquotes a path with spaces', () => {
    assert.deepEqual(parsePorcelain('?? "some dir/file name.cs"'), ['some dir/file name.cs']);
  });

  test('returns nothing for a clean tree', () => {
    assert.deepEqual(parsePorcelain(''), []);
  });
});

describe('path helpers', () => {
  const root = process.platform === 'win32' ? 'C:\\develop\\TaskFlow' : '/develop/TaskFlow';

  test('toPosix normalises separators', () => {
    assert.equal(toPosix('a\\b\\c'), 'a/b/c');
  });

  test('samePath ignores separator and, on Windows, case', () => {
    assert.ok(samePath(root, toPosix(root)));
    assert.ok(samePath(`${root}${path.sep}`, root), 'a trailing separator should not matter');
    if (process.platform === 'win32') {
      assert.ok(samePath(root, root.toUpperCase()));
    }
  });

  test('isInsideDir is true for children and false for the directory itself', () => {
    assert.ok(isInsideDir(path.join(root, 'src'), root));
    assert.ok(isInsideDir(path.join(root, 'a', 'b', 'c.cs'), root));
    assert.equal(isInsideDir(root, root), false);
  });

  test('isInsideDir is false for siblings and parents', () => {
    assert.equal(isInsideDir(path.dirname(root), root), false);
    assert.equal(isInsideDir(`${root}-other`, root), false, 'a name-prefix sibling is not inside');
  });

  test('normalizeForCompare resolves traversal', () => {
    assert.equal(normalizeForCompare(path.join(root, 'src', '..')), normalizeForCompare(root));
  });

  test('realpathNearest returns an absolute path for something that does not exist', () => {
    const missing = path.join(root, 'no', 'such', 'file.cs');
    assert.ok(path.isAbsolute(realpathNearest(missing)));
  });
});
