import { useTaskFlowClient } from '../../api/ClientProvider'
import type { CommentResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'

export function useComments(taskId: string): QueryResult<CommentResponse[]> {
  const client = useTaskFlowClient()
  return useQuery({
    key: ['tasks', taskId, 'comments'],
    fetch: ({ signal }) => client.listComments(taskId, { signal }),
  })
}
