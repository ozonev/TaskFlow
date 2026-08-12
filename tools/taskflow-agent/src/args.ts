import path from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError } from './exit.js';

export type Mode = 'plan' | 'execute';

export interface ParsedArgs {
  mode: Mode;
  inputFlag: '--brief' | '--approved-plan';
  inputPath: string;
  worktree: string;
  branch: string;
  runId: string;
  model: string;
  maxTurns: number;
  maxCostUsd: number;
  timeoutMinutes: number;
}

export type ParseResult = { kind: 'help'; text: string } | { kind: 'args'; args: ParsedArgs };

export const DEFAULT_MODEL = 'claude-sonnet-5';
export const DEFAULT_TIMEOUT_MINUTES = 30;
export const MODE_DEFAULTS = {
  plan: { maxTurns: 15, maxCostUsd: 2 },
  execute: { maxTurns: 40, maxCostUsd: 10 },
} as const;

const OPTION_SPEC = {
  brief: { type: 'string' },
  'approved-plan': { type: 'string' },
  worktree: { type: 'string' },
  branch: { type: 'string' },
  'run-id': { type: 'string' },
  model: { type: 'string' },
  'max-turns': { type: 'string' },
  'max-cost-usd': { type: 'string' },
  'timeout-minutes': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

/** Every flag the CLI accepts. The help text is tested against this list. */
export const OPTION_NAMES: string[] = Object.keys(OPTION_SPEC);

export const HELP_TEXT = `taskflow-agent - bounded local implementation runner

USAGE
  taskflow-agent plan    --brief <path>         --worktree <path> [options]
  taskflow-agent execute --approved-plan <path> --worktree <path> [options]
  taskflow-agent --help

  plan     Read-only agent run against an already approved brief. Writes
           artifacts/<run-id>/plan.proposed.md and exits, changing nothing.
  execute  Implements an approved plan inside the worktree, then runs a build
           and test the agent has no control over. Never commits.

OPTIONS
  --brief <path>          (plan) the approved brief to plan from
  --approved-plan <path>  (execute) a plan carrying a human approval header
  --worktree <path>       isolated git worktree to run in; created if absent
  --branch <name>         branch for the worktree        [default: agent/<run-id>]
  --run-id <id>           names artifacts/<run-id>/   [default: basename of --worktree]
  --model <id>            model to pin the run to       [default: ${DEFAULT_MODEL}]
  --max-turns <n>         agentic turn ceiling      [default: plan 15, execute 40]
  --max-cost-usd <n>      estimated cost ceiling     [default: plan 2, execute 10]
  --timeout-minutes <n>   hard wall-clock abort   [default: ${DEFAULT_TIMEOUT_MINUTES}]
  -h, --help              this text

APPROVAL
  execute refuses to start unless --approved-plan begins with a line like

    <!-- approved-by: Your Name 2026-08-11 base: <base-commit-sha> -->

  A plan run cannot write that line: it has no write access to anything. Review
  plan.proposed.md, copy it to plan.approved.md, edit it as you see fit, then add
  the header. No flag bypasses this, and the base commit must match the worktree.

EXIT CODES
  0  success                    4  cost ceiling reached
  1  usage error                5  sdk or unexpected error
  2  refused to start           6  build or tests failed
  3  turn ceiling reached

ENVIRONMENT
  ANTHROPIC_API_KEY  required; the SDK cannot reuse a Claude Code login
`;

function requireValue(value: string | undefined, flag: string): string {
  if (value === undefined) throw new UsageError(`${flag} is required.`);
  if (value.trim() === '') throw new UsageError(`${flag} needs a value.`);
  return value.trim();
}

function rejectValue(value: string | undefined, flag: string, mode: Mode): void {
  if (value !== undefined) throw new UsageError(`${flag} is not valid for '${mode}'.`);
}

function positiveNumber(raw: string | undefined, flag: string, fallback: number, integer: boolean): number {
  if (raw === undefined) return fallback;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new UsageError(`${flag} must be a positive number, got '${raw}'.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new UsageError(`${flag} must be a whole number, got '${raw}'.`);
  }
  return value;
}

function validRunId(runId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId) || runId.includes('..')) {
    throw new UsageError(
      `--run-id '${runId}' is not usable as a directory name; use letters, digits, dot, dash or underscore.`,
    );
  }
  return runId;
}

function validBranch(branch: string): string {
  const invalid = /[\s~^:?*[\\]|^[-/.]|[/.]$|\.\.|@\{|\.lock$/;
  if (invalid.test(branch)) throw new UsageError(`--branch '${branch}' is not a valid git branch name.`);
  return branch;
}

export function parseCliArgs(argv: string[], cwd: string): ParseResult {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];

  try {
    const parsed = parseArgs({ args: argv, options: OPTION_SPEC, allowPositionals: true, strict: true });
    values = parsed.values as Record<string, string | boolean | undefined>;
    positionals = parsed.positionals;
  } catch (error) {
    // parseArgs already names the offending flag; surfacing an unknown flag as an
    // error rather than ignoring it is the point of strict mode here.
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const subcommand = positionals[0];

  if (values['help'] === true || subcommand === undefined) {
    return { kind: 'help', text: HELP_TEXT };
  }
  if (positionals.length > 1) {
    throw new UsageError(`unexpected extra argument '${positionals[1]}'.`);
  }
  if (subcommand !== 'plan' && subcommand !== 'execute') {
    throw new UsageError(`unknown subcommand '${subcommand}'; expected 'plan' or 'execute'.`);
  }

  const mode: Mode = subcommand;
  const brief = values['brief'] as string | undefined;
  const approvedPlan = values['approved-plan'] as string | undefined;

  let inputFlag: ParsedArgs['inputFlag'];
  let inputRaw: string;
  if (mode === 'plan') {
    rejectValue(approvedPlan, '--approved-plan', mode);
    inputFlag = '--brief';
    inputRaw = requireValue(brief, '--brief');
  } else {
    rejectValue(brief, '--brief', mode);
    inputFlag = '--approved-plan';
    inputRaw = requireValue(approvedPlan, '--approved-plan');
  }

  const worktreeRaw = requireValue(values['worktree'] as string | undefined, '--worktree');
  const worktree = path.resolve(cwd, worktreeRaw);
  const runId = validRunId((values['run-id'] as string | undefined)?.trim() || path.basename(worktree));
  const branch = validBranch((values['branch'] as string | undefined)?.trim() || `agent/${runId}`);
  const defaults = MODE_DEFAULTS[mode];

  return {
    kind: 'args',
    args: {
      mode,
      inputFlag,
      inputPath: path.resolve(cwd, inputRaw),
      worktree,
      branch,
      runId,
      model: (values['model'] as string | undefined)?.trim() || DEFAULT_MODEL,
      maxTurns: positiveNumber(values['max-turns'] as string | undefined, '--max-turns', defaults.maxTurns, true),
      maxCostUsd: positiveNumber(values['max-cost-usd'] as string | undefined, '--max-cost-usd', defaults.maxCostUsd, false),
      timeoutMinutes: positiveNumber(
        values['timeout-minutes'] as string | undefined,
        '--timeout-minutes',
        DEFAULT_TIMEOUT_MINUTES,
        false,
      ),
    },
  };
}
