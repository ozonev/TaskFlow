import { useTaskFlowClient } from '../../api/ClientProvider'
import type { CreateLabelBody, LabelResponse } from '../../api/types'
import { useMutation, type Mutation } from '../../data/useMutation'

export function useCreateLabel(projectId: string): Mutation<CreateLabelBody, LabelResponse> {
  const client = useTaskFlowClient()
  return useMutation({
    mutate: (body) => client.createLabel(projectId, body),
    invalidates: [['labels', 'list', projectId]],
  })
}
