import type { TaskResponse } from '../../api/types'
import { endOfThisWeek, startOfToday, startOfTomorrow } from '../../lib/datetime'

/**
 * The brief asks for grouping "by due window" (§1 line 20, §4 line 93) but never
 * enumerates the windows. Five groups, computed in the viewer's local zone from
 * the UTC dueDate, consistent with §3 line 67's rendering rule.
 *
 * "No due date" must exist as its own group: §3's dueDateFrom/dueDateTo filters
 * exclude tasks with a null dueDate entirely, so without a group for them they'd
 * read as a bug rather than a deliberate bucket.
 */
export type DueWindow = 'overdue' | 'today' | 'thisWeek' | 'later' | 'noDueDate'

export interface TaskGroup {
  id: DueWindow
  label: string
  tasks: TaskResponse[]
}

const WINDOW_ORDER: DueWindow[] = ['overdue', 'today', 'thisWeek', 'later', 'noDueDate']

const WINDOW_LABELS: Record<DueWindow, string> = {
  overdue: 'Overdue',
  today: 'Today',
  thisWeek: 'This week',
  later: 'Later',
  noDueDate: 'No due date',
}

/** Pure — no rendering, no hooks — so it's testable without mounting a component. */
export function groupTasksByDueWindow(tasks: TaskResponse[], now: Date = new Date()): TaskGroup[] {
  const todayStart = startOfToday(now)
  const tomorrowStart = startOfTomorrow(now)
  const weekEnd = endOfThisWeek(now)

  const buckets: Record<DueWindow, TaskResponse[]> = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
    noDueDate: [],
  }

  for (const task of tasks) {
    if (task.dueDate === null) {
      buckets.noDueDate.push(task)
      continue
    }
    const due = new Date(task.dueDate)
    if (due < todayStart) {
      buckets.overdue.push(task)
    } else if (due < tomorrowStart) {
      buckets.today.push(task)
    } else if (due < weekEnd) {
      buckets.thisWeek.push(task)
    } else {
      buckets.later.push(task)
    }
  }

  // Empty groups are omitted entirely (§7) rather than rendered with a "0" count.
  return WINDOW_ORDER.filter((id) => buckets[id].length > 0).map((id) => ({
    id,
    label: WINDOW_LABELS[id],
    tasks: buckets[id],
  }))
}

/**
 * The flat, ordered id list `j`/`k` walks (§6 line 130: "crossing group
 * boundaries"). Collapsing a group removes its rows from this list entirely,
 * which is what makes roving focus skip collapsed groups for free rather than as
 * a special case.
 */
export function flattenVisibleTaskIds(groups: TaskGroup[], collapsedIds: ReadonlySet<string>): string[] {
  return groups.filter((group) => !collapsedIds.has(group.id)).flatMap((group) => group.tasks.map((t) => t.id))
}
