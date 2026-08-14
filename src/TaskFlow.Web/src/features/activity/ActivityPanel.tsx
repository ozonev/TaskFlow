import { isApiError } from '../../api/problem'
import { formatDateTime } from '../../lib/datetime'
import { Button } from '../../ui/Button'
import { SkeletonBlocks } from '../../ui/SkeletonBlocks'
import { StateBlock } from '../../ui/StateBlock'
import { useTaskAudit } from './useTaskAudit'
import styles from './ActivityPanel.module.css'

const EVENT_LABELS: Record<string, string> = {
  ProjectCreated: 'Project created',
  TaskCreated: 'Task created',
  TaskCommentAdded: 'Comment added',
}

/**
 * §7 — "comments and activity load independently"; a failure here degrades only
 * this panel (its own retry), never the whole drawer. Read-only, as the brief's
 * component inventory describes it.
 */
export function ActivityPanel({ taskId }: { taskId: string }) {
  const { data, error, showLoading, refetch } = useTaskAudit(taskId)

  return (
    <div aria-busy={showLoading} className={styles.panel}>
      {error ? (
        <StateBlock
          tone="error"
          title="Couldn't load activity"
          action={<Button onClick={() => refetch()}>Retry</Button>}
          traceId={isApiError(error) ? error.problem.traceId : undefined}
        >
          This panel failed to load; the rest of the drawer is unaffected.
        </StateBlock>
      ) : showLoading ? (
        <ul className={styles.list}>
          <SkeletonBlocks count={3} />
        </ul>
      ) : data && data.length === 0 ? (
        <p className={`${styles.empty} type-body`}>No activity recorded.</p>
      ) : (
        <ul className={styles.list}>
          {data?.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <p className="type-body">{EVENT_LABELS[entry.eventType] ?? entry.eventType}</p>
              <p className={`${styles.description} type-meta`}>{entry.description}</p>
              <time dateTime={entry.createdAtUtc} className={`${styles.timestamp} type-meta`}>
                {formatDateTime(entry.createdAtUtc)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
