import { useTaskFlowClient } from '../../api/ClientProvider'
import type { CreateTaskBody, TaskResponse } from '../../api/types'
import { useMutation, type Mutation } from '../../data/useMutation'

export function useCreateTask(projectId: string): Mutation<CreateTaskBody, TaskResponse> {
  const client = useTaskFlowClient()
  return useMutation({
    mutate: (body) => client.createTask(projectId, body),
    // Prefix ['tasks','search'] matches every search-query cache entry (all
    // filter combinations, across projects) plus useTaskById's fallback query —
    // but NOT a task's ['tasks', taskId, 'comments'|'audit'] entries, which sit
    // under a different second segment. Refetching every open drawer's comments
    // just because a new task was created elsewhere would be pure waste.
    invalidates: [['tasks', 'search']],
  })
}
