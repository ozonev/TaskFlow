import { useTaskFlowClient } from '../../api/ClientProvider'
import type { TaskResponse } from '../../api/types'
import { useMutation, type Mutation } from '../../data/useMutation'

export function useAssignLabel(taskId: string): Mutation<string, TaskResponse> {
  const client = useTaskFlowClient()
  return useMutation({
    mutate: (labelId) => client.assignLabel(taskId, labelId),
    // The task's own drawer query, plus every task-list surface that renders label
    // chips or could be label-filtered — same set CreateTaskHandler-driven mutations
    // (useCreateTask) already invalidate, minus 'list' which the drawer never reads.
    invalidates: [['tasks', 'get', taskId], ['tasks', 'search']],
  })
}
