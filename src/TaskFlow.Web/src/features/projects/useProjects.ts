import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { useTaskFlowClient } from '../../api/ClientProvider'
import { DEFAULT_PAGE_SIZE } from '../../lib/constants'
import { useQuery, type QueryResult } from '../../data/useQuery'
import type { Paged, ProjectResponse } from '../../api/types'

/**
 * §2 line 45 — `?page=` reflects pagination and is the source of truth: reading
 * the current page from the URL rather than component state is what makes the
 * back button undo a page change for free.
 */
export function useProjectsPage(): {
  page: number
  setPage: (page: number) => void
  query: QueryResult<Paged<ProjectResponse>>
} {
  const [searchParams, setSearchParams] = useSearchParams()
  const client = useTaskFlowClient()

  const rawPage = Number(searchParams.get('page'))
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1

  const setPage = useCallback(
    (nextPage: number) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (nextPage <= 1) {
            next.delete('page')
          } else {
            next.set('page', String(nextPage))
          }
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const query = useQuery({
    key: ['projects', 'list', { page, pageSize: DEFAULT_PAGE_SIZE }],
    fetch: ({ signal }) =>
      client.listProjects({ page, pageSize: DEFAULT_PAGE_SIZE }, { signal }),
  })

  return { page, setPage, query }
}
