import { useTaskFlowClient } from '../../api/ClientProvider'
import type { CreateTaskBody, TaskResponse } from '../../api/types'
import { useMutation, type Mutation } from '../../data/useMutation'

export function useCreateTask(projectId: string): Mutation<CreateTaskBody, TaskResponse> {
  const client = useTaskFlowClient()
  return useMutation({
    mutate: (body) => client.createTask(projectId, body),
    // ['tasks','search'] matches every search-query cache entry (all filter
    // combinations, across projects); ['tasks','list'] matches the plain
    // project-task listing and the unfiltered-count query built on it. Neither
    // matches a task's ['tasks','get'|'comments'|'audit', taskId] entries, which
    // sit under a different second segment — refetching every open drawer's
    // comments just because a new task was created elsewhere would be pure waste.
    invalidates: [['tasks', 'search'], ['tasks', 'list']],
  })
}
