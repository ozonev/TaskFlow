import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookCallback, HookJSONOutput, Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { digest } from './hash.js';
import type { Journal } from './journal.js';
import { allowedToolsFor, ALLOWED_COMMAND_SUMMARY, commandFor, decide, disallowedToolsFor, targetPathsFor } from './policy.js';
import type { RunContext } from './preflight.js';

export interface ToolDenial {
  tool: string;
  reason: string;
}

const ABORT_SUBTYPE = { timeout: 'error_timeout', budget: 'error_max_budget_usd' } as const;

export interface RunOutcome {
  subtype: string;
  numTurns: number;
  totalCostUsd: number | null;
  sessionId: string | null;
  stopReason: string | null;
  finalText: string | null;
  errors: string[];
  gatePassed: number;
  gateDenied: number;
  denials: ToolDenial[];
  permissionDenials: number;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  aborted: 'timeout' | 'budget' | null;
  wallClockMs: number;
}

function planPreamble(worktree: string): string {
  return `You are running inside taskflow-agent, a bounded non-interactive runner, in PLAN mode.

- You have read-only access to one git worktree at ${worktree}. Read, Glob and Grep are your only
  tools. You cannot write files or run commands; the host denies both outright.
- Your final message IS the deliverable. The host writes it verbatim to plan.proposed.md. Nothing
  else you output is kept, so put the whole plan in that final message.
- Do not call ExitPlanMode; it is denied here. Ending your turn with the plan written out is how you
  finish, and there is no approval step for you to trigger.
- This run ends when you stop. A human reviews your proposal afterwards, in a separate step that
  you are not part of. Do not ask for approval, do not wait for it, and do not assume it was given.
- Write an implementation plan: which files change, what the change to each is, and how to verify
  the result. Be concrete enough that someone else can execute it without rediscovering the code.`;
}

function executePreamble(worktree: string): string {
  return `You are running inside taskflow-agent, a bounded non-interactive runner, in EXECUTE mode.

- The plan below was already reviewed and approved by a human. Implement it as written. If it turns
  out to be wrong or infeasible, stop and explain in your final message rather than substituting a
  plan of your own.
- You are confined to the git worktree at ${worktree}. Reads and writes outside it are denied.
- Shell access is limited to: ${ALLOWED_COMMAND_SUMMARY}. Command chaining, redirection and
  substitution are denied, so run one command per call.
- Do not commit, stage, push, or create branches. The host reports your work as an uncommitted diff
  for a human to review; that is the intended end state, not an oversight.
- After you stop, the host independently runs a build and the test suite. Leave the tree compiling
  and the tests passing.`;
}

function buildPrompt(ctx: RunContext): string {
  const label = ctx.args.mode === 'plan' ? 'APPROVED BRIEF' : 'APPROVED PLAN';
  const task =
    ctx.args.mode === 'plan'
      ? 'Produce the implementation plan for the brief below.'
      : 'Implement the approved plan below.';
  return `${task}\n\n--- ${label} (${ctx.args.inputPath}) ---\n${ctx.inputText.trim()}\n--- END ${label} ---\n`;
}

function readUsage(message: unknown): { input: number; output: number; cacheRead: number; cacheCreation: number } | null {
  if (message === null || typeof message !== 'object') return null;
  const inner = (message as { message?: { usage?: Record<string, unknown> } }).message;
  const usage = inner?.usage;
  if (usage === undefined) return null;
  const num = (key: string): number => {
    const value = usage[key];
    return typeof value === 'number' ? value : 0;
  };
  return {
    input: num('input_tokens'),
    output: num('output_tokens'),
    cacheRead: num('cache_read_input_tokens'),
    cacheCreation: num('cache_creation_input_tokens'),
  };
}

function textBlocksOf(message: unknown): string[] {
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is { type: 'text'; text: string } => {
      if (block === null || typeof block !== 'object') return false;
      const candidate = block as { type?: unknown; text?: unknown };
      return candidate.type === 'text' && typeof candidate.text === 'string';
    })
    .map((block) => block.text);
}

function toolUsesOf(message: unknown): string[] {
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((block): block is { type: 'tool_use'; name: string } => {
      if (block === null || typeof block !== 'object') return false;
      const candidate = block as { type?: unknown; name?: unknown };
      return candidate.type === 'tool_use' && typeof candidate.name === 'string';
    })
    .map((block) => block.name);
}

/**
 * The SDK only reports total_cost_usd on result messages, and assistant messages
 * carry token counts with no price attached. Rather than bundle a price table
 * that would silently go stale, this reads a cost field wherever one happens to
 * appear and otherwise leaves enforcement to maxBudgetUsd, which the SDK applies
 * itself. So this is a backstop, not the primary limit.
 */
function readCost(message: unknown): number | null {
  if (message === null || typeof message !== 'object') return null;
  const record = message as Record<string, unknown>;
  for (const key of ['total_cost_usd', 'turn_cost_usd']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Stands in for a run that threw before reporting a result, so the caller can
 * still verify and report on whatever the agent managed to change first.
 */
export function crashedOutcome(message: string, wallClockMs: number): RunOutcome {
  return {
    subtype: 'error_during_execution',
    numTurns: 0,
    totalCostUsd: null,
    sessionId: null,
    stopReason: null,
    finalText: null,
    errors: [message],
    gatePassed: 0,
    gateDenied: 0,
    denials: [],
    permissionDenials: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    aborted: null,
    wallClockMs,
  };
}

export async function runAgent(ctx: RunContext, journal: Journal): Promise<RunOutcome> {
  const { mode, worktree, model, maxTurns, maxCostUsd, timeoutMinutes } = ctx.args;

  const tokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  const denials: ToolDenial[] = [];
  let gatePassed = 0;
  let gateDenied = 0;
  let turn = 0;
  let observedCost: number | null = null;
  let aborted: 'timeout' | 'budget' | null = null;

  const controller = new AbortController();

  const gate: HookCallback = async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const tool = input.tool_name;
    const decision = decide({ mode, worktree }, tool, input.tool_input);

    journal.append('tool.decision', {
      tool,
      gate: decision.allow ? 'pass' : 'deny',
      reason: decision.reason,
      inputDigest: digest(input.tool_input),
      command: commandFor(input.tool_input),
      paths: targetPathsFor(tool, input.tool_input),
    });

    if (decision.allow) {
      gatePassed += 1;
      // Deliberately no explicit 'allow': returning one would auto-approve and
      // skip the permission layer, discarding the worktree's own deny rules.
      // Passing the gate means "not refused here", not "approved".
      return {};
    }

    gateDenied += 1;
    denials.push({ tool, reason: decision.reason });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision.reason,
      },
    };
  };

  const recorder: HookCallback = async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name === 'PostToolUse') {
      journal.append('tool.result', { tool: input.tool_name });
    }
    return {};
  };

  const options: Options = {
    cwd: worktree,
    model,
    maxTurns,
    maxBudgetUsd: maxCostUsd,
    permissionMode: mode === 'plan' ? 'plan' : 'default',
    allowedTools: allowedToolsFor(mode),
    disallowedTools: disallowedToolsFor(mode),
    // 'local' is a separate source from 'project', so .claude/settings.local.json
    // is excluded here, and 'user' is left out so the operator's own ~/.claude
    // settings cannot widen a run.
    settingSources: ['project'],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: mode === 'plan' ? planPreamble(worktree) : executePreamble(worktree),
    },
    hooks: {
      PreToolUse: [{ hooks: [gate] }],
      PostToolUse: [{ hooks: [recorder] }],
    },
    abortController: controller,
  };

  const timer = setTimeout(
    () => {
      aborted = 'timeout';
      journal.append('sdk.interrupt', { reason: 'timeout', timeoutMinutes });
      controller.abort();
    },
    Math.round(timeoutMinutes * 60_000),
  );
  timer.unref();

  const startedAt = Date.now();
  const outcome: RunOutcome = {
    subtype: 'no_result',
    numTurns: 0,
    totalCostUsd: null,
    sessionId: null,
    stopReason: null,
    finalText: null,
    errors: [],
    gatePassed: 0,
    gateDenied: 0,
    denials,
    permissionDenials: 0,
    tokens,
    aborted: null,
    wallClockMs: 0,
  };

  try {
    for await (const message of query({ prompt: buildPrompt(ctx), options }) as AsyncIterable<SDKMessage>) {
      // Probed on every message, not just assistant ones: the SDK reports cost on
      // result messages today, and this way the backstop starts working for free
      // if a mid-stream cost field ever appears.
      const cost = readCost(message);
      if (cost !== null) observedCost = cost;

      if (message.type === 'system' && message.subtype === 'init') {
        journal.append('sdk.init', { sessionId: message.session_id, model: message.model, tools: message.tools.length });
        outcome.sessionId = message.session_id;
        continue;
      }

      if (message.type === 'assistant') {
        turn += 1;
        const usage = readUsage(message);
        if (usage !== null) {
          tokens.input += usage.input;
          tokens.output += usage.output;
          tokens.cacheRead += usage.cacheRead;
          tokens.cacheCreation += usage.cacheCreation;
        }
        journal.append('assistant.turn', {
          turn,
          text: textBlocksOf(message),
          toolUses: toolUsesOf(message),
          usage,
          observedCostUsd: observedCost,
        });

        if (observedCost !== null && observedCost > maxCostUsd) {
          aborted = 'budget';
          journal.append('sdk.interrupt', { reason: 'budget', observedCostUsd: observedCost, maxCostUsd });
          controller.abort();
          break;
        }
        continue;
      }

      if (message.type === 'result') {
        outcome.subtype = message.subtype;
        outcome.numTurns = message.num_turns;
        outcome.totalCostUsd = message.total_cost_usd;
        outcome.sessionId = message.session_id;
        outcome.stopReason = message.stop_reason;
        outcome.permissionDenials = message.permission_denials.length;
        if (message.subtype === 'success') {
          outcome.finalText = message.result;
        } else {
          outcome.errors = message.errors;
        }
        journal.append('sdk.result', {
          subtype: message.subtype,
          numTurns: message.num_turns,
          totalCostUsd: message.total_cost_usd,
          stopReason: message.stop_reason,
          sessionId: message.session_id,
          permissionDenials: message.permission_denials,
          usage: message.usage,
          modelUsage: message.modelUsage,
        });
        if (outcome.finalText !== null) {
          journal.append('assistant.final', { text: outcome.finalText });
        }
      }
    }
  } catch (error) {
    if (aborted === null) throw error;
    // An abort we asked for surfaces here as a rejection; the reason is already
    // journaled, so swallow it and report through the outcome instead.
  } finally {
    clearTimeout(timer);
  }

  outcome.gatePassed = gatePassed;
  outcome.gateDenied = gateDenied;
  outcome.aborted = aborted;
  outcome.wallClockMs = Date.now() - startedAt;
  if (aborted !== null && outcome.subtype === 'no_result') {
    outcome.subtype = ABORT_SUBTYPE[aborted];
  }
  return outcome;
}
