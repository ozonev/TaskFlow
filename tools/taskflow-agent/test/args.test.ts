import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { DEFAULT_MODEL, HELP_TEXT, OPTION_NAMES, parseCliArgs } from '../src/args.js';
import type { ParsedArgs } from '../src/args.js';
import { UsageError } from '../src/exit.js';

const CWD = process.platform === 'win32' ? 'C:\\repo' : '/repo';

function parse(argv: string[]): ParsedArgs {
  const result = parseCliArgs(argv, CWD);
  assert.equal(result.kind, 'args', 'expected args, got help');
  return (result as { kind: 'args'; args: ParsedArgs }).args;
}

function planArgs(extra: string[] = []): string[] {
  return ['plan', '--brief', 'brief.md', '--worktree', '../wt/run-1', ...extra];
}

function intakeArgs(extra: string[] = []): string[] {
  return ['intake', '--ticket', 'TASK-123', '--worktree', '../wt/run-1', ...extra];
}

describe('subcommands', () => {
  test('no arguments prints help rather than failing', () => {
    assert.equal(parseCliArgs([], CWD).kind, 'help');
  });

  test('--help prints help', () => {
    assert.equal(parseCliArgs(['--help'], CWD).kind, 'help');
    assert.equal(parseCliArgs(['plan', '-h'], CWD).kind, 'help');
  });

  test('an unknown subcommand is rejected', () => {
    assert.throws(() => parseCliArgs(['apply', '--worktree', 'x'], CWD), UsageError);
  });

  test('a stray positional is rejected rather than ignored', () => {
    assert.throws(() => parseCliArgs([...planArgs(), 'extra'], CWD), UsageError);
  });

  test('an unknown flag is rejected rather than ignored', () => {
    assert.throws(() => parseCliArgs([...planArgs(), '--bypass'], CWD), UsageError);
    assert.throws(() => parseCliArgs([...planArgs(), '--yes'], CWD), UsageError);
    assert.throws(() => parseCliArgs([...planArgs(), '--force'], CWD), UsageError);
  });
});

describe('required flags', () => {
  test('plan needs --brief and --worktree', () => {
    assert.throws(() => parseCliArgs(['plan', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['plan', '--brief', 'b.md'], CWD), UsageError);
  });

  test('execute needs --approved-plan', () => {
    assert.throws(() => parseCliArgs(['execute', '--worktree', 'x'], CWD), UsageError);
  });

  test('intake needs --ticket and --worktree', () => {
    assert.throws(() => parseCliArgs(['intake', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['intake', '--ticket', 'TASK-123'], CWD), UsageError);
  });

  test('each mode rejects the other modes\' input flags', () => {
    assert.throws(() => parseCliArgs(['plan', '--approved-plan', 'p.md', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['plan', '--ticket', 'TASK-1', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['execute', '--brief', 'b.md', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['execute', '--ticket', 'TASK-1', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['intake', '--brief', 'b.md', '--worktree', 'x'], CWD), UsageError);
    assert.throws(() => parseCliArgs(['intake', '--approved-plan', 'p.md', '--worktree', 'x'], CWD), UsageError);
  });

  test('an empty flag value is rejected', () => {
    assert.throws(() => parseCliArgs(['plan', '--brief', '  ', '--worktree', 'x'], CWD), UsageError);
  });
});

describe('--ticket validation', () => {
  for (const good of ['TASK-123', 'AB1-45', 'X2-7', 'PROJ-1']) {
    test(`'${good}' is accepted`, () => {
      const args = parse(intakeArgs(['--ticket', good]));
      assert.equal(args.ticketKey, good);
    });
  }

  for (const bad of [
    'task-123',
    'TASK123',
    'TASK-0x1',
    '-123',
    'TASK--123',
    'TASK-123 extra',
    'TASK-123\nrm -rf /',
    '',
    '   ',
  ]) {
    test(`'${bad}' is rejected`, () => {
      assert.throws(() => parseCliArgs(intakeArgs(['--ticket', bad]), CWD), UsageError);
    });
  }
});

describe('defaults', () => {
  test('plan defaults to 15 turns and $2', () => {
    const args = parse(planArgs());
    assert.equal(args.maxTurns, 15);
    assert.equal(args.maxCostUsd, 2);
    assert.equal(args.timeoutMinutes, 30);
    assert.equal(args.model, DEFAULT_MODEL);
  });

  test('execute defaults to 40 turns and $10', () => {
    const args = parse(['execute', '--approved-plan', 'p.md', '--worktree', '../wt/run-1']);
    assert.equal(args.maxTurns, 40);
    assert.equal(args.maxCostUsd, 10);
  });

  test('intake defaults to 10 turns and $1', () => {
    const args = parse(intakeArgs());
    assert.equal(args.maxTurns, 10);
    assert.equal(args.maxCostUsd, 1);
    assert.equal(args.ticketKey, 'TASK-123');
  });

  test('run id defaults to the worktree basename, branch to agent/<run-id>', () => {
    const args = parse(planArgs());
    assert.equal(args.runId, 'run-1');
    assert.equal(args.branch, 'agent/run-1');
  });

  test('explicit run id and branch win', () => {
    const args = parse(planArgs(['--run-id', 'r7', '--branch', 'feature/x']));
    assert.equal(args.runId, 'r7');
    assert.equal(args.branch, 'feature/x');
  });

  test('paths are absolutised against the invocation directory', () => {
    const args = parse(planArgs());
    assert.ok(args.inputPath.endsWith('brief.md'));
    assert.ok(args.inputPath.includes('repo'), `${args.inputPath} should be under ${CWD}`);
    assert.ok(!args.worktree.includes('..'), 'worktree should be normalised');
  });
});

describe('numeric bounds', () => {
  for (const bad of ['0', '-1', 'abc', '', 'Infinity', 'NaN']) {
    test(`--max-turns '${bad}' is rejected`, () => {
      assert.throws(() => parseCliArgs(planArgs(['--max-turns', bad]), CWD), UsageError);
    });
  }

  test('--max-turns must be a whole number', () => {
    assert.throws(() => parseCliArgs(planArgs(['--max-turns', '2.5']), CWD), UsageError);
  });

  test('--max-cost-usd accepts a fraction', () => {
    assert.equal(parse(planArgs(['--max-cost-usd', '0.25'])).maxCostUsd, 0.25);
  });

  test('--max-cost-usd rejects zero and negatives', () => {
    assert.throws(() => parseCliArgs(planArgs(['--max-cost-usd', '0']), CWD), UsageError);
    assert.throws(() => parseCliArgs(planArgs(['--max-cost-usd', '-3']), CWD), UsageError);
  });
});

describe('identifier validation', () => {
  for (const bad of ['../escape', 'a/b', 'a\\b', '.hidden', '..']) {
    test(`--run-id '${bad}' is rejected`, () => {
      assert.throws(() => parseCliArgs(planArgs(['--run-id', bad]), CWD), UsageError);
    });
  }

  for (const bad of ['-lead', 'has space', 'a..b', 'trailing/', 'ref~1', 'a:b', 'x.lock']) {
    test(`--branch '${bad}' is rejected`, () => {
      assert.throws(() => parseCliArgs(planArgs(['--branch', bad]), CWD), UsageError);
    });
  }
});

describe('help text honesty', () => {
  test('every flag the help text advertises is actually accepted', () => {
    const advertised = new Set(
      [...HELP_TEXT.matchAll(/--([a-z][a-z-]*)/g)].map((match) => match[1]!),
    );
    for (const flag of advertised) {
      assert.ok(OPTION_NAMES.includes(flag), `help advertises --${flag} but the parser does not accept it`);
    }
  });

  test('no approval-bypassing flag is advertised', () => {
    for (const pattern of [/--yes\b/, /--auto-approve\b/, /--approve\b/, /--force\b/, /--skip\b/]) {
      assert.doesNotMatch(HELP_TEXT, pattern);
    }
  });

  test('no credential can be passed as a flag', () => {
    assert.ok(
      !OPTION_NAMES.some((name) => /token/i.test(name)),
      'a --*token* flag would let a credential be passed on the command line instead of via environment',
    );
  });
});
