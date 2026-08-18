import type { LabelResponse, Paged, TaskResponse, TaskSearchQuery } from '../types'
import { createIdFactory } from './ids'
import { createSeed, type SeedData, type SeedKind, type TaskLabelLink } from './seed'

/* Records are held already in wire shape — ISO strings, camelCase, nullable rather
   than optional — so there is no mapping layer that could drift from the real
   serialization. */

interface Sortable {
  id: string
  createdAtUtc: string
}

/**
 * Every list endpoint orders by (createdAtUtc, id) ascending — oldest first. The
 * secondary key matters: seeded rows can share a createdAtUtc, and without it the
 * order would be insertion-dependent and paging would be unstable.
 */
export function byCreatedThenId<T extends Sortable>(a: T, b: T): number {
  if (a.createdAtUtc !== b.createdAtUtc) {
    return a.createdAtUtc < b.createdAtUtc ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Applies the API's paging contract, including the two details a naive
 * implementation gets wrong:
 *   - totalPages is ceil(total / pageSize), so it is 0 when total is 0, not 1.
 *   - a page past the end returns empty items but echoes the requested page.
 */
export function paginate<T>(all: T[], page: number, pageSize: number): Paged<T> {
  const totalCount = all.length
  const skip = (page - 1) * pageSize
  return {
    items: skip >= totalCount ? [] : all.slice(skip, skip + pageSize),
    page,
    pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  }
}

/**
 * Mirrors TaskRepository.ApplyFilter. All predicates AND together.
 *
 * The date comparisons are on *instants*, not days — a task due 09:00Z is after
 * 00:00Z on the same date. Callers widen an upper bound to end-of-day themselves
 * (lib/datetime.ts); doing it here would hide the real API's behaviour.
 */
export function filterTasks(tasks: TaskResponse[], query: TaskSearchQuery): TaskResponse[] {
  const title = query.title?.trim().toLowerCase()

  return tasks.filter((task) => {
    if (query.projectId !== undefined && task.projectId !== query.projectId) {
      return false
    }
    if (query.status !== undefined && task.status !== query.status) {
      return false
    }
    // Case-insensitive SUBSTRING match — not prefix, not exact. A whitespace-only
    // value is ignored entirely rather than matching nothing.
    if (title && !task.title.toLowerCase().includes(title)) {
      return false
    }
    if (query.dueDateFrom !== undefined) {
      // A null dueDate is excluded by either bound: the SQL comparison on a null
      // column yields null, which is not true.
      if (task.dueDate === null || task.dueDate < query.dueDateFrom) {
        return false
      }
    }
    if (query.dueDateTo !== undefined) {
      if (task.dueDate === null || task.dueDate > query.dueDateTo) {
        return false
      }
    }
    return true
  })
}

/** Fresh per read, mirroring SearchTasksHandler's batched join lookup rather than a stored field. */
export function labelsForTask(store: MockStore, taskId: string): LabelResponse[] {
  const labelIds = new Set(
    store.data.taskLabels.filter((link) => link.taskId === taskId).map((link) => link.labelId),
  )
  return store.data.labels
    .filter((label) => labelIds.has(label.id))
    .sort(byCreatedThenId)
}

export function withLabels(store: MockStore, task: TaskResponse): TaskResponse {
  return { ...task, labels: labelsForTask(store, task.id) }
}

export class MockStore {
  data: SeedData
  readonly nextId = createIdFactory(0xf00d)

  constructor(
    private readonly seedKind: SeedKind,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = createSeed(seedKind, now())
  }

  /** Restores the seeded sample — what the dev panel's Reset button calls. */
  reset(): void {
    this.data = createSeed(this.seedKind, this.now())
  }

  timestamp(): string {
    return this.now().toISOString()
  }

  findProject(id: string) {
    return this.data.projects.find((project) => project.id === id)
  }

  findTask(id: string) {
    return this.data.tasks.find((task) => task.id === id)
  }

  findLabel(id: string) {
    return this.data.labels.find((label) => label.id === id)
  }

  findTaskLabel(taskId: string, labelId: string): TaskLabelLink | undefined {
    return this.data.taskLabels.find((link) => link.taskId === taskId && link.labelId === labelId)
  }
}
