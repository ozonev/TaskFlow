import { useTaskFlowClient } from '../../api/ClientProvider'
import type { LabelResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'

export function useLabels(projectId: string): QueryResult<LabelResponse[]> {
  const client = useTaskFlowClient()

  return useQuery({
    key: ['labels', 'list', projectId],
    fetch: ({ signal }) => client.listLabels(projectId, { signal }),
  })
}
