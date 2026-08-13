import { useTaskFlowClient } from '../../api/ClientProvider'
import type { CommentResponse } from '../../api/types'
import { useMutation, type Mutation } from '../../data/useMutation'

export function usePostComment(taskId: string): Mutation<{ authorName: string; text: string }, CommentResponse> {
  const client = useTaskFlowClient()
  return useMutation({
    mutate: (body) => client.createComment(taskId, body),
    invalidates: [
      ['tasks', taskId, 'comments'],
      ['tasks', taskId, 'audit'],
    ],
  })
}
