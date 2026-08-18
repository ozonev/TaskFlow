import type {
  AuditLogResponse,
  CommentResponse,
  LabelResponse,
  ProjectResponse,
  TaskResponse,
} from '../types'
import { createIdFactory } from './ids'

/* The only fixture file in the build. Nothing outside api/mock/ may import it —
   enforced by an ESLint restricted-import zone and by fixtureIsolation.test.ts.

   Shaped so that every state in §7 is reachable by navigation alone, with no code
   edit and no special query param:
     - a project with zero tasks            → the first task-list empty state
     - a project whose tasks fill all five due windows, including null dueDate
     - tasks with no comments and no audit  → both drawer empty panels
     - an over-long title and description   → §5 line 111 truncation and clamp
     - `large` seed                          → pagination past page 1

   Due dates are computed from a `now` argument rather than hardcoded, so the
   groups stay meaningful as time passes and tests can pin the clock. */

export interface TaskLabelLink {
  taskId: string
  labelId: string
}

export interface SeedData {
  projects: ProjectResponse[]
  tasks: TaskResponse[]
  comments: CommentResponse[]
  auditLogs: AuditLogResponse[]
  labels: LabelResponse[]
  taskLabels: TaskLabelLink[]
}

export type SeedKind = 'default' | 'empty' | 'large'

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Days from local midnight today, rendered as a UTC instant. */
function dueIn(now: Date, days: number, hour = 12): string {
  const date = startOfDay(now)
  date.setDate(date.getDate() + days)
  date.setHours(hour)
  return date.toISOString()
}

function createdAgo(now: Date, minutesAgo: number): string {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString()
}

export function createSeed(kind: SeedKind, now: Date = new Date()): SeedData {
  if (kind === 'empty') {
    return { projects: [], tasks: [], comments: [], auditLogs: [], labels: [], taskLabels: [] }
  }

  const nextProjectId = createIdFactory(0x9701)
  const nextTaskId = createIdFactory(0x7a5c)
  const nextCommentId = createIdFactory(0xc077)
  const nextAuditId = createIdFactory(0xa0d1)
  const nextLabelId = createIdFactory(0x1abe1)

  const projects: ProjectResponse[] = []
  const tasks: TaskResponse[] = []
  const comments: CommentResponse[] = []
  const auditLogs: AuditLogResponse[] = []
  const labels: LabelResponse[] = []
  const taskLabels: TaskLabelLink[] = []

  function addProject(name: string, description: string | null, minutesAgo: number): string {
    const id = nextProjectId()
    projects.push({ id, name, description, createdAtUtc: createdAgo(now, minutesAgo) })
    auditLogs.push({
      id: nextAuditId(),
      projectId: id,
      taskId: null,
      eventType: 'ProjectCreated',
      description: `Project '${name}' created.`,
      createdAtUtc: createdAgo(now, minutesAgo),
    })
    return id
  }

  function addTask(
    projectId: string,
    title: string,
    description: string | null,
    dueDate: string | null,
    minutesAgo: number,
    options: { audited?: boolean } = {},
  ): string {
    const id = nextTaskId()
    tasks.push({
      id,
      projectId,
      title,
      description,
      status: 'Todo',
      dueDate,
      createdAtUtc: createdAgo(now, minutesAgo),
      // Always recomputed from taskLabels at read time (see store.ts's withLabels) — this
      // placeholder only needs to satisfy the type.
      labels: [],
    })
    /* Most tasks carry a TaskCreated row, matching what the API writes today.
       A couple deliberately do not — standing in for rows created before audit
       logging existed, which is literally true of this codebase. That is what
       makes the drawer's "No activity recorded" state reachable at all. */
    if (options.audited !== false) {
      auditLogs.push({
        id: nextAuditId(),
        projectId,
        taskId: id,
        eventType: 'TaskCreated',
        description: `Task '${title}' created.`,
        createdAtUtc: createdAgo(now, minutesAgo),
      })
    }
    return id
  }

  function addComment(taskId: string, authorName: string, text: string, minutesAgo: number): void {
    comments.push({
      id: nextCommentId(),
      taskId,
      authorName,
      text,
      createdAtUtc: createdAgo(now, minutesAgo),
    })
    /* TaskCommentAdded rows are written with projectId = null by
       CreateCommentHandler, so they appear in a task's audit feed but never in a
       project's. Mirrored here so the two feeds disagree in the same way. */
    auditLogs.push({
      id: nextAuditId(),
      projectId: null,
      taskId,
      eventType: 'TaskCommentAdded',
      description: `Comment added by ${authorName}.`,
      createdAtUtc: createdAgo(now, minutesAgo),
    })
  }

  function addLabel(projectId: string, name: string, minutesAgo: number): string {
    const id = nextLabelId()
    labels.push({ id, projectId, name, createdAtUtc: createdAgo(now, minutesAgo) })
    return id
  }

  function assignLabel(taskId: string, labelId: string): void {
    taskLabels.push({ taskId, labelId })
  }

  if (kind === 'large') {
    // 45 projects → 3 pages at the default page size of 20.
    for (let i = 1; i <= 45; i += 1) {
      addProject(
        `Workstream ${String(i).padStart(2, '0')}`,
        i % 3 === 0 ? null : `Placeholder description for workstream ${i}.`,
        (46 - i) * 60,
      )
    }
    return { projects, tasks, comments, auditLogs, labels, taskLabels }
  }

  const redesign = addProject(
    'Website redesign',
    'Marketing site refresh: new information architecture, updated brand, and a rebuilt component library.',
    60 * 24 * 30,
  )
  const mobile = addProject(
    'Mobile app launch',
    'iOS and Android release. Not started — no tasks captured yet.',
    60 * 24 * 21,
  )
  const tooling = addProject('Internal tooling', null, 60 * 24 * 14)

  // Overdue (§9 assigns --color-accent-2 to overdue dates).
  addTask(redesign, 'Audit existing page templates', null, dueIn(now, -6), 60 * 24 * 20)
  const contrastTask = addTask(
    redesign,
    'Fix colour contrast failures in the type scale',
    'Body copy at 13px currently sits at 3.8:1 against the page ground. Needs to clear 4.5:1 without introducing a new hue.',
    dueIn(now, -2),
    60 * 24 * 18,
  )

  // Today.
  addTask(redesign, 'Review navigation prototype', null, dueIn(now, 0, 9), 60 * 24 * 12)
  const copyTask = addTask(
    redesign,
    'Rewrite the homepage hero copy',
    'Current draft is three sentences too long and buries the primary action below the fold.',
    dueIn(now, 0, 16),
    60 * 24 * 11,
  )

  // This week / later, spread so at least one group beyond today is always filled.
  addTask(redesign, 'Componentise the article layout', null, dueIn(now, 1), 60 * 24 * 9)
  addTask(redesign, 'Draft the migration runbook', null, dueIn(now, 2), 60 * 24 * 8)
  addTask(redesign, 'Set up visual regression snapshots', null, dueIn(now, 3), 60 * 24 * 7)
  addTask(
    redesign,
    'Consolidate the icon set onto a single stroke width so that mixed provenance stops being visible at small sizes',
    'Deliberately long, to exercise the §5 line 111 truncation-with-tooltip behaviour on the title column.',
    dueIn(now, 12),
    60 * 24 * 6,
  )
  addTask(redesign, 'Retire the legacy stylesheet', null, dueIn(now, 24), 60 * 24 * 5)
  addTask(redesign, 'Plan the phased cutover', null, dueIn(now, 47), 60 * 24 * 4)

  /* No due date — §3's date-range filters exclude these entirely, which is why
     they need a group of their own rather than being folded into "Later". */
  addTask(redesign, 'Collect stakeholder sign-off', null, null, 60 * 24 * 3)
  addTask(
    redesign,
    'Investigate font loading strategy',
    'Source Serif 4 currently arrives from a third party on first paint. Self-hosting the two weights would remove the dependency.',
    null,
    60 * 24 * 2,
    { audited: false },
  )

  // A project of entirely undated work.
  addTask(tooling, 'Replace the deploy script', null, null, 60 * 24 * 10)
  addTask(tooling, 'Document the release checklist', null, null, 60 * 24 * 9, { audited: false })
  addTask(tooling, 'Add a health dashboard', null, null, 60 * 24 * 8)

  // Comments on two tasks only; everything else shows "No comments yet".
  addComment(
    contrastTask,
    'Priya Raman',
    'Checked the ramp — stepping down to the 700 weight clears 4.5:1 without adding a colour. Worth confirming against the dark surface too.',
    60 * 20,
  )
  addComment(
    contrastTask,
    'Tom Weyland',
    'Agreed. I will pair the change with the focus-ring offset fix so we only reflow the type once.',
    60 * 6,
  )
  addComment(copyTask, 'Priya Raman', 'Second paragraph can go entirely.', 60 * 2)

  // A couple of labels on one project, with one task carrying both — reachable
  // without any code edit or special query param, per this file's own convention.
  const designLabel = addLabel(redesign, 'Design', 60 * 24 * 25)
  const urgentLabel = addLabel(redesign, 'Urgent', 60 * 24 * 24)
  assignLabel(contrastTask, designLabel)
  assignLabel(contrastTask, urgentLabel)
  assignLabel(copyTask, designLabel)

  void mobile // intentionally has no tasks

  return { projects, tasks, comments, auditLogs, labels, taskLabels }
}
