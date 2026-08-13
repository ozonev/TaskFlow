import { useTaskFlowClient } from '../../api/ClientProvider'
import type { AuditLogResponse } from '../../api/types'
import { useQuery, type QueryResult } from '../../data/useQuery'

export function useTaskAudit(taskId: string): QueryResult<AuditLogResponse[]> {
  const client = useTaskFlowClient()
  return useQuery({
    key: ['tasks', taskId, 'audit'],
    fetch: ({ signal }) => client.listTaskAudit(taskId, { signal }),
  })
}
