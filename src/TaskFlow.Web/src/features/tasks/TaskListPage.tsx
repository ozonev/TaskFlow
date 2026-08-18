import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router'

import { useOverlayLinkProps } from '../../a11y/useOverlayLinkProps'
import { isApiError } from '../../api/problem'
import { useProject } from '../projects/useProject'
import { SKELETON_ROWS } from '../../lib/constants'
import { useShortcut } from '../../shortcuts/useShortcut'
import { Button, LinkButton } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { Pagination } from '../../ui/Pagination'
import { ShortcutHelp } from '../../ui/ShortcutHelp'
import { SkeletonRows } from '../../ui/SkeletonRows'
import { StateBlock } from '../../ui/StateBlock'
import { ActiveFilterChips } from './ActiveFilterChips'
import { FilterBar } from './FilterBar'
import { flattenVisibleTaskIds, groupTasksByDueWindow } from './grouping'
import { TaskGroup } from './TaskGroup'
import { useRovingRows } from './useRovingRows'
import { useTaskFilters } from './useTaskFilters'
import { useTaskSearch, useUnfilteredTaskCount } from './useTaskSearch'
import styles from './TaskListPage.module.css'

const COLUMN_COUNT = 3

/**
 * The grouped task list — Direction B from §1: one scrollable list grouped by
 * due window, filters above it, a task opening in a drawer over the list
 * (drawer lands in the next increment; this one gets the list itself right).
 */
export function TaskListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) {
    throw new Error('TaskListPage rendered without a :projectId route param')
  }

  const navigate = useNavigate()
  const project = useProject(projectId)
  const filters = useTaskFilters()
  const search = useTaskSearch(projectId, filters)
  const { data, error, showLoading, refetch } = search

  const groups = useMemo(() => (data ? groupTasksByDueWindow(data.items) : []), [data])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const visibleIds = useMemo(
    () => flattenVisibleTaskIds(groups, collapsedIds),
    [groups, collapsedIds],
  )
  const roving = useRovingRows(visibleIds)

  function toggleGroup(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /* §7 line 143's "last known page size" skeleton sizing, same pattern as
     ProjectsPage — see the comment there for why a ref is needed at all. */
  const lastRowCountRef = useRef(SKELETON_ROWS)
  useEffect(() => {
    if (data) {
      lastRowCountRef.current = data.items.length || data.pageSize
    }
  }, [data])

  const isEmpty = data !== undefined && data.totalCount === 0 && !showLoading
  const isFilteredEmpty = isEmpty && filters.hasActiveFilters
  /* §7 line 145 — the filtered-empty state states the unfiltered count. Fetched
     lazily: only once the filtered result is confirmed empty AND a filter is
     active, so the happy path never pays for a second request. */
  const unfilteredCount = useUnfilteredTaskCount(projectId, isFilteredEmpty)

  const newTaskLink = useOverlayLinkProps(`/projects/${projectId}/tasks/new`)
  const manageLabelsLink = useOverlayLinkProps(`/projects/${projectId}/labels`)

  useShortcut('n', (event) => {
    event.preventDefault()
    navigate(newTaskLink.to, { state: newTaskLink.state })
  })
  useShortcut('j', (event) => {
    event.preventDefault()
    roving.moveNext()
  })
  useShortcut('k', (event) => {
    event.preventDefault()
    roving.movePrevious()
  })

  const newTaskAction = (
    <LinkButton {...newTaskLink} variant="primary">
      New task
    </LinkButton>
  )

  const headerActions = (
    <>
      <LinkButton {...manageLabelsLink}>Manage labels</LinkButton>
      {newTaskAction}
    </>
  )

  if (project.error) {
    return (
      <div className="content-column">
        <StateBlock
          tone="error"
          title="Couldn't load this project"
          action={<Button onClick={() => project.refetch()}>Retry</Button>}
          traceId={isApiError(project.error) ? project.error.problem.traceId : undefined}
        >
          Something went wrong while loading this project.
        </StateBlock>
      </div>
    )
  }

  return (
    <div className="content-column">
      <PageHeader title={project.data?.name ?? 'Project'} action={headerActions} />

      <FilterBar projectId={projectId} filters={filters} />
      <ActiveFilterChips projectId={projectId} filters={filters} />

      {/* §7 — result count in a polite live region. Always mounted so the
          region reliably announces a change in its text rather than appearing
          fresh each time. */}
      <p aria-live="polite" className="visually-hidden">
        {data && !showLoading
          ? `${data.totalCount} ${data.totalCount === 1 ? 'task' : 'tasks'} found`
          : ''}
      </p>

      {error ? (
        <StateBlock
          tone="error"
          title="Couldn't load tasks"
          action={<Button onClick={() => refetch()}>Retry</Button>}
          traceId={isApiError(error) ? error.problem.traceId : undefined}
        >
          Something went wrong while loading tasks. Your filters are unchanged, so retrying reproduces
          this view.
        </StateBlock>
      ) : isEmpty && !filters.hasActiveFilters ? (
        <StateBlock tone="empty" title="No tasks yet" action={newTaskAction}>
          <p>Create the first task to start tracking work in this project.</p>
          <ShortcutHelp variant="inline" />
        </StateBlock>
      ) : isFilteredEmpty ? (
        <StateBlock
          tone="empty"
          title="No tasks match these filters"
          action={<Button onClick={filters.clearAll}>Clear filters</Button>}
        >
          {unfilteredCount.data !== undefined &&
            `${unfilteredCount.data} ${unfilteredCount.data === 1 ? 'task' : 'tasks'} in this project, none match the current filters.`}
        </StateBlock>
      ) : (
        <>
          <table className={styles.table} aria-busy={showLoading}>
            <caption className={`${styles.caption} type-meta`}>
              {data?.totalCount ?? 0} {(data?.totalCount ?? 0) === 1 ? 'task' : 'tasks'}
              {data && data.totalPages > 1 && `, page ${data.page} of ${data.totalPages}`}
            </caption>
            <thead>
              <tr>
                <th className="type-label" scope="col">
                  Title
                </th>
                <th className="type-label" scope="col">
                  Status
                </th>
                <th className="type-label" scope="col">
                  Due date
                </th>
              </tr>
            </thead>
            {showLoading ? (
              <tbody>
                <SkeletonRows rows={lastRowCountRef.current} columns={COLUMN_COUNT} />
              </tbody>
            ) : (
              groups.map((group) => (
                <TaskGroup
                  key={group.id}
                  group={group}
                  collapsed={collapsedIds.has(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                  activeId={roving.activeId}
                />
              ))
            )}
          </table>
          {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={filters.setPage} />}
        </>
      )}

      <Outlet />
    </div>
  )
}
