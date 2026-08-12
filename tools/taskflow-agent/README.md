# taskflow-agent

A bounded local runner that turns a Jira ticket, or an already-approved brief, into implemented code.
It drives the Claude Agent SDK inside an isolated git worktree, and the **host wrapper — not the
model — owns every limit**: which tools exist, which paths and commands are reachable, how many turns,
how much estimated cost, how long, and what gets recorded. The model cannot widen its own tool set,
leave its worktree, touch the source checkout, write its own audit log, run the final build, or take
any Jira write action.

## Install

```
cd tools/taskflow-agent
npm install
npm run build
npm link          # optional: puts `taskflow-agent` on PATH
```

Without `npm link`, invoke it as `node tools/taskflow-agent/dist/src/cli.js <subcommand> ...` from the
repo root. Requires Node 20+ (developed on 22.14) and `ANTHROPIC_API_KEY`; the SDK cannot reuse a
Claude Code subscription login.

```
npm test          # 212 tests, no network, no Docker, no API key needed
npm run typecheck
```

## The three phases

Intake, planning and execution are **separate invocations with a human review between each pair**.
Nothing in this tool asks a running agent to wait for approval — a prompt telling a non-interactive
agent to wait is not an approval boundary. Starting from a Jira ticket is optional: `plan --brief`
still accepts a hand-written brief exactly as before, with no intake step involved.

```
# 0. (optional) read-only agent run against Jira; writes a ticket brief and exits
taskflow-agent intake --ticket TASK-123 --worktree ../taskflow-worktrees/run-123
#    -> artifacts/run-123/ticket-brief.proposed.md

# 0a. you, outside any agent run:
cd artifacts/run-123
cp ticket-brief.proposed.md ticket-brief.approved.md
#    read it, edit it freely, then make the first line:
#    <!-- approved-by: Your Name 2026-08-11 base: 539b3f3e1a2b -->

# 1. read-only agent run; writes a plan proposal and exits
taskflow-agent plan --brief artifacts/run-123/ticket-brief.approved.md \
                     --worktree ../taskflow-worktrees/run-123
#    -> artifacts/run-123/plan.proposed.md
#    (a hand-written brief works exactly the same way if you skip step 0)

# 2. you, outside any agent run:
cd artifacts/run-123
cp plan.proposed.md plan.approved.md
#    read it, edit it freely, then make the first line:
#    <!-- approved-by: Your Name 2026-08-11 base: 539b3f3e1a2b -->

# 3. a new process, which refuses to start without step 2
taskflow-agent execute --approved-plan artifacts/run-123/plan.approved.md \
                       --worktree ../taskflow-worktrees/run-123
```

`plan` refuses (exit 2) to accept a `--brief` produced by `intake` for the same run-id without the
same kind of approval header that `execute` demands on `--approved-plan` — see Approval below. A
hand-written brief that never went through `intake` for its run-id is unaffected.

`execute` refuses (exit 2) if the header is missing or malformed, if `base:` does not match the
worktree's recorded base commit, if the file is byte-identical to `plan.proposed.md`, or if you point
it at `plan.proposed.md` by name. A read-only run (`intake` or `plan`) cannot forge the header — it has
no write access to anything, and the wrapper never emits that filename or that line. **No flag
bypasses this**; there is no `--yes`, `--auto-approve`, `--approve`, or `--force`, and a test asserts
the help text never grows one.

Nothing crosses the boundary except the approved text: each phase starts a fresh session with no
`resume` and no history from the phase before it. What you reviewed is what runs.

## Flags

Run `taskflow-agent --help`. Every flag it prints is accepted, and a test enforces that.

| | |
|---|---|
| `--ticket` | (intake) a Jira issue key, e.g. `TASK-123` — validated strictly, so raw ticket text can never reach the prompt through this flag |
| `--brief` / `--approved-plan` | mode input; resolved relative to the invocation directory |
| `--worktree` | isolated worktree; created if absent, validated if present |
| `--branch` | default `agent/<run-id>` |
| `--run-id` | default: basename of `--worktree`; names `artifacts/<run-id>/` |
| `--model` | default `claude-sonnet-5`; pinned so runs are reproducible |
| `--max-turns` | default intake 10, plan 15, execute 40 |
| `--max-cost-usd` | default intake $1, plan $2, execute $10 |
| `--timeout-minutes` | default 30; hard wall-clock abort |

## What actually enforces the bounds

`cwd` is **not** a sandbox — it only sets a starting directory. The real boundary is a `PreToolUse`
hook, which the SDK evaluates *before* permission rules, so it denies regardless of `allowedTools`,
`permissionMode`, or any settings file. For every tool call it: journals the intent, rejects tools
outside the mode's set, resolves every path argument through `realpath` on the nearest existing
ancestor (defeating `..` and symlinked parents) and requires it inside the worktree, and for shell
calls rejects metacharacters **before** consulting the allow-list — allow-listing a prefix is
worthless if `&&` can append a second command.

| | `intake` | `plan` | `execute` |
|---|---|---|---|
| tools | `Read`, `Glob`, `Grep`, `TodoWrite`, plus the named Jira read tools (see below) | `Read`, `Glob`, `Grep`, `TodoWrite` | plus `Edit`, `Write`, `Bash` |
| shell | none | none | `dotnet build`, `dotnet test`, `dotnet format`, `git diff`, `git status` |
| permission mode | `plan` | `plan` | `default` |

Shell arguments are rejected for any `..` path segment (anywhere, not just at the start of a token),
any `~`, and any absolute path — so `dotnet build src/../../../evil.csproj` is denied even though its
`..` sits mid-path. `ExitPlanMode` stays denied: the `claude_code` preset's plan-mode footer tells the
model to call it, but approving it could transition the session out of plan mode, so instead the denial
reason tells the model to put the plan in its final message, and the preamble says so up front.

Plan and intake modes are read-only three independent ways: `disallowedTools` strips the write tools
from the model's context, `permissionMode: 'plan'` never auto-approves an edit, and the gate denies
them. They are read-only by construction, not by instruction.

Reads are jailed too, and `.git/**`, **all of `.claude/**`**, `.env*`, `appsettings.Production.json`,
`*.pfx`/`*.pubxml`/`*.publishsettings` and `PublishScripts/**` are refused for *read* as well as write
— the repo's own deny rules cover only Edit/Write, and `appsettings.Development.json` aside, those
files carry secrets.

The whole `.claude` tree is denied, not just its settings files, and that is load-bearing rather than
tidiness: `settingSources: ['project']` loads the worktree's tracked `.claude/settings.json`, whose
`PostToolUse` hook runs `.claude/hooks/format-edited-file.ps1` on any edit. A writable hook script
would therefore let the agent execute arbitrary code straight past the command allow-list. Hooks,
skills, agents and rules are all control-plane, so the directory is off limits wholesale.

`settingSources: ['project']` deliberately excludes `'local'` and `'user'`, so neither
`settings.local.json` nor your personal `~/.claude` config can widen a run.

When the gate permits a call it returns *no* decision rather than an explicit allow: an explicit allow
would auto-approve and skip the permission layer, discarding the worktree's own deny rules. Passing
the gate means "not refused here", not "approved".

## Jira access (intake only)

`intake` reads a Jira ticket through Atlassian's official Rovo MCP Server
(`https://mcp.atlassian.com/v1/mcp`), using a personal API token — **not** the OAuth connection the
`atlassian@claude-plugins-official` plugin already provides for interactive Claude Code sessions in
this repo. The runner deliberately configures its own, narrow, explicit MCP connection instead of
relying on that ambient one, and sets `strictMcpConfig: true` in every mode (not just `intake`) so no
project, user, or plugin config can ever widen what an SDK run can reach.

Read-only, twice over: the SDK connection itself only ever registers the specific read tools named in
`JIRA_READ_TOOL_NAMES` (`policy.ts`), each with `permission_policy: 'always_allow'`, and the host gate
independently denies any `mcp__` tool that isn't one of those exact names — in every mode, regardless
of what the SDK-side tool policy says. No tool that changes a ticket's status, assignee, labels, or
comments is ever registered or reachable, and neither is any Confluence or Compass tool.

Credentials: `JIRA_EMAIL` and `JIRA_API_TOKEN` environment variables, checked before any network call
and never logged or journalled. Create a token at
<https://id.atlassian.com/manage-profile/security/api-tokens>. There is no flag for either — same
"credentials are never a flag" rule `ANTHROPIC_API_KEY` already follows, and a test asserts the help
text never grows a token-shaped flag.

Ticket content is data, not instructions: the intake preamble states this explicitly, and `--ticket`
only ever accepts a strict Jira issue key (`TASK-123`), so raw ticket text can never reach the
constructed prompt through the CLI itself — only through the model's own tool call, which is exactly
where the "untrusted data" framing applies.

## Refusals, in order

1. **Args** — unknown flags are errors, not ignored; numeric bounds must be positive.
2. **Approval** (`execute`, and `plan` when its `--brief` came from `intake`) — before any credential
   check or network call, so an unapproved plan or brief costs nothing.
3. **`ANTHROPIC_API_KEY`** present, and (`intake` only) `JIRA_EMAIL`/`JIRA_API_TOKEN` present.
4. **Clean source checkout** — a dirty tree means the worktree's base commit does not describe what
   you reviewed. The runner's own `artifacts/` output is excluded from this check.
5. **Protected branch** — the default branch from `origin/HEAD` (currently `Module12`) cannot be a
   target; if `origin/HEAD` is unset it refuses `main`/`master` and says detection failed.
6. **Worktree** — refuses a path inside the source checkout (that would put the parent repo in the
   jail), whether the worktree is being created or reused; then creates it, or validates that an
   existing one belongs to this repo, is on the expected branch, and is clean. For `execute`, its HEAD
   must still equal the approved base commit.

Resolving the repo root happens before all of this, because the journal lives in the repo. It is a
local read-only git call.

## Output

Everything lands in `artifacts/<run-id>/` **in the source repo**, never in the worktree, so the model
cannot reach its own audit trail:

- `journal.jsonl` — append-synchronous, one event per line, each timestamped. A `Ctrl-C` still leaves
  a complete record. Covers inputs and their SHA-256 (or the ticket key, for `intake`), every tool
  decision with its reason, the model's text verbatim per turn, the SDK result, verification steps,
  and the exit status.
- `ticket-brief.proposed.md` — intake mode, written from the model's final message, only on a
  successful run.
- `plan.proposed.md` — plan mode, written from the model's final message, only on a successful run.
- `report.md` — written by the wrapper, never the model: bounds vs. actual, allow/deny tallies, the
  SDK subtype, verification exit codes, `git diff --stat`, and (execute only) the model's final
  message under "Acceptance criteria", mapping tests and changed behavior back to the approved plan's
  stated acceptance criteria.
- `meta.json` — run identity, which mode first created this run-id, and the base commit the approval
  header must match.

## Verification, and what it does not cover

After the agent stops — including when it errored **or crashed mid-stream**, since a partial change
still needs measuring — the host runs `dotnet restore`, `dotnet tool restore`, `dotnet build`, and
`dotnet test --filter-not-trait "Category=Postgres"` in the worktree. The agent cannot skip these or
influence their result. `--nologo` is absent from `dotnet test` deliberately: this repo's runner is
Microsoft.Testing.Platform, which rejects it. `intake` and `plan` run no build — neither changes anything.

Each step has its own 15-minute cap, and a step killed by it is reported as `timed out`, distinctly
from a `dotnet` that could not be launched. Note that `--timeout-minutes` bounds the **agent run only**;
the verification steps run after it and are capped separately, so total wall clock can exceed it.

**Nothing is staged and nothing is committed.** The report ends with the worktree path, the branch at
zero commits past its base, and the `git -C … diff` command to review it.

## Exit codes

```
0 success   1 usage   2 refused to start   3 max turns
4 max cost  5 sdk or unexpected error      6 build or tests failed
```

## Limits worth knowing

- **Not an OS sandbox.** The jail is SDK-hook-level, so a permitted `dotnet build` still runs
  arbitrary MSBuild targets from the worktree — including any `.csproj` or `Directory.Build.props` the
  agent just wrote. The isolated worktree, the clean-source-repo check, and never committing are what
  bound that — not the hook.
- **`Grep` and `Glob` are gated on their `path` argument, not on what they traverse.** A content search
  rooted at the worktree passes the gate and then descends into everything under it, so the read
  deny-list does not stop a determined `Grep` from surfacing bytes of a denied *tracked* file. Gitignored
  files (`.env`) are skipped by ripgrep's defaults, which narrows this but does not close it. Treat the
  read deny-list as defence against accidental reads, not as a confidentiality boundary.
- **Cost is enforced by the SDK's `maxBudgetUsd`**, and `total_cost_usd` is a client-side estimate,
  not billing truth. The wrapper reads a cost field mid-stream where one appears and aborts, but it
  does **not** bundle a price table that would silently go stale, so treat its own check as a backstop
  and the report's cost as an estimate.
- **The Jira read-tool catalog (`JIRA_READ_TOOL_NAMES` in `policy.ts`) was observed via an interactive
  Claude Code session's plugin, not a versioned Atlassian contract.** If Atlassian changes what the
  Rovo MCP Server exposes — a renamed tool, or a new one needed for comments that turns out not to be
  covered by `getJiraIssue` alone — reverify against the live server and update that one list; both
  the SDK-side tool policy and the host gate read from it.
- No GitHub/PR integration, no session resume, no concurrent runs on one run ID.
