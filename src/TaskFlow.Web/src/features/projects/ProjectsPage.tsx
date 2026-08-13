import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router'

import { useOverlayLinkProps } from '../../a11y/useOverlayLinkProps'
import { SKELETON_ROWS } from '../../lib/constants'
import { isApiError } from '../../api/problem'
import { Button, LinkButton } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { Pagination } from '../../ui/Pagination'
import { StateBlock } from '../../ui/StateBlock'
import { ProjectTable } from './ProjectTable'
import { useProjectsPage } from './useProjects'

/**
 * The project list — landing route (§2). Renders `<Outlet/>` for the create and
 * edit dialogs that mount as children of this route: the dialog covers the list,
 * and a cold deep link to /projects/new renders this component structurally
 * underneath it, with no separate "render the background" prop to forget.
 */
export function ProjectsPage() {
  const { page, setPage, query } = useProjectsPage()
  const { data, error, showLoading, refetch } = query

  /* §7 line 143 — "paging keeps skeletons at the last known page size". useQuery
     clears `data` the instant a new page starts loading, so by the time
     showLoading is true there is nothing left to read a row count from — this ref
     is what remembers it. Seeded at SKELETON_ROWS so the very first load (no
     prior page to remember) gets the five rows §7 line 143 specifies. */
  const lastRowCountRef = useRef(SKELETON_ROWS)
  useEffect(() => {
    if (data) {
      lastRowCountRef.current = data.items.length || data.pageSize
    }
  }, [data])

  const overlayLinkProps = useOverlayLinkProps('/projects/new')
  const newProjectAction = (
    <LinkButton {...overlayLinkProps} variant="primary">
      New project
    </LinkButton>
  )

  return (
    <div className="content-column">
      <PageHeader title="Projects" action={newProjectAction} />

      {error ? (
        <StateBlock
          tone="error"
          title="Couldn't load projects"
          action={
            <Button onClick={() => refetch()}>Retry</Button>
          }
          traceId={isApiError(error) ? error.problem.traceId : undefined}
        >
          Something went wrong while loading your projects.
        </StateBlock>
      ) : data && data.totalCount === 0 && !showLoading ? (
        <StateBlock tone="empty" title="No projects yet" action={newProjectAction}>
          Create your first project to start tracking work.
        </StateBlock>
      ) : (
        <>
          <ProjectTable
            projects={data?.items ?? []}
            page={data?.page ?? page}
            totalCount={data?.totalCount ?? 0}
            totalPages={data?.totalPages ?? 0}
            showLoading={showLoading}
            skeletonRows={lastRowCountRef.current}
          />
          {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
        </>
      )}

      <Outlet />
    </div>
  )
}
