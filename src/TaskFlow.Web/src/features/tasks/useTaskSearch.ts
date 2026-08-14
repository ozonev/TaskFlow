import { useTaskFlowClient } from '../../api/ClientProvider'
import type { Paged, TaskResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'
import { DEFAULT_PAGE_SIZE } from '../../lib/constants'
import { toDueDateFromInstant, toDueDateToInstant } from '../../lib/datetime'
import type { TaskFiltersState } from './useTaskFilters'

/**
 * Builds the real TaskSearchQuery from the UI's filter state and runs it.
 *
 * The date conversion here is the fix for the sharpest correctness bug in this
 * build: TaskRepository compares dueDateFrom/dueDateTo as INSTANTS, and a
 * date-only value normalises to midnight UTC — so a naive dueTo of the bare date
 * silently excludes every task due later that same day. toDueDateToInstant widens
 * it to 23:59:59.999Z; toDueDateFromInstant floors dueFrom to 00:00:00.000Z. Both
 * live in lib/datetime.ts precisely so this conversion has one place to be right.
 */
export function useTaskSearch(
  projectId: string,
  filters: Pick<TaskFiltersState, 'q' | 'status' | 'dueFrom' | 'dueTo' | 'page'>,
): QueryResult<Paged<TaskResponse>> {
  const client = useTaskFlowClient()

  const query = {
    projectId,
    page: filters.page,
    pageSize: DEFAULT_PAGE_SIZE,
    ...(filters.q ? { title: filters.q } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dueFrom ? { dueDateFrom: toDueDateFromInstant(filters.dueFrom) } : {}),
    ...(filters.dueTo ? { dueDateTo: toDueDateToInstant(filters.dueTo) } : {}),
  }

  return useQuery({
    key: ['tasks', 'search', query],
    fetch: ({ signal }) => client.searchTasks(query, { signal }),
  })
}

/**
 * The unfiltered count backing §7 line 145's second empty state ("no match for
 * filters ... stating the unfiltered count"). Fetched lazily — only when the
 * filtered result is empty AND a filter is active — via `enabled`, so the happy
 * path never pays for a second request. pageSize=1 keeps the payload minimal;
 * only `.totalCount` is read.
 *
 * Uses the plain project task listing, not searchTasks with an empty filter —
 * this wants "how many tasks exist in this project", not a search result.
 */
export function useUnfilteredTaskCount(projectId: string, enabled: boolean): QueryResult<number> {
  const client = useTaskFlowClient()

  const query = useQuery({
    key: ['tasks', 'list', { projectId, unfiltered: true }],
    fetch: ({ signal }) => client.listProjectTasks(projectId, { pageSize: 1 }, { signal }),
    enabled,
  })

  return { ...query, data: query.data?.totalCount }
}
