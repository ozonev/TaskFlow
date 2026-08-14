import { useTaskFlowClient } from '../../api/ClientProvider'
import type { TaskResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'

export function useTaskById(taskId: string): QueryResult<TaskResponse> {
  const client = useTaskFlowClient()

  return useQuery({
    key: ['tasks', 'get', taskId],
    fetch: ({ signal }) => client.getTask(taskId, { signal }),
  })
}
