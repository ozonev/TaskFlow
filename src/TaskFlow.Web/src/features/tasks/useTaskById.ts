import { useTaskFlowClient } from '../../api/ClientProvider'
import type { TaskResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'

/**
 * TEMPORARY. `GET /api/tasks/{id}` does not exist on the backend — this is the
 * §3 line 78 fallback: fetch the project's tasks and select the id client-side.
 * Not found among them shows not-found, matching what a real 404 would produce.
 *
 * This is the ONLY place that fallback lives. When the real endpoint ships,
 * deleting this file's body and replacing it with a direct `client.getTask(id)`
 * call is the entire migration — no other file references the fallback shape.
 */
export function useTaskById(projectId: string, taskId: string): QueryResult<TaskResponse | undefined> {
  const client = useTaskFlowClient()

  const query = useQuery({
    key: ['tasks', 'search', { projectId, viaFallbackFor: taskId }],
    fetch: ({ signal }) => client.searchTasks({ projectId, pageSize: 100 }, { signal }),
  })

  return {
    ...query,
    data: query.data?.items.find((task) => task.id === taskId),
  }
}
