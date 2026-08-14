import { useTaskFlowClient } from '../../api/ClientProvider'
import type { ProjectResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'

export function useProject(projectId: string): QueryResult<ProjectResponse> {
  const client = useTaskFlowClient()
  return useQuery({
    key: ['projects', 'get', projectId],
    fetch: ({ signal }) => client.getProject(projectId, { signal }),
  })
}
