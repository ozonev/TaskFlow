import type { CommentResponse } from '../../api/types'
import { formatDateTime } from '../../lib/datetime'
import { Button } from '../../ui/Button'
import type { PendingComment } from './PendingComment'
import styles from './CommentList.module.css'

/**
 * §7 — "'No comments yet' above the form". Renders unconditionally (even when
 * empty) so that heading has somewhere to live; the form always follows it.
 *
 * §10 "Comment — pending: 60% opacity; failure: stays visible with inline
 * retry". A failed comment is never dropped from the list — the typed text
 * stays exactly where it was, with a retry action attached to it.
 */
export function CommentList({
  comments,
  pending,
  onRetry,
}: {
  comments: CommentResponse[]
  pending: PendingComment[]
  onRetry: (clientId: string) => void
}) {
  if (comments.length === 0 && pending.length === 0) {
    return <p className={`${styles.empty} type-body`}>No comments yet.</p>
  }

  return (
    <ul className={styles.list}>
      {comments.map((comment) => (
        <li key={comment.id} className={styles.item}>
          <p className={`${styles.author} type-interface`}>{comment.authorName}</p>
          <p className="type-body">{comment.text}</p>
          <time dateTime={comment.createdAtUtc} className={`${styles.timestamp} type-meta`}>
            {formatDateTime(comment.createdAtUtc)}
          </time>
        </li>
      ))}
      {pending.map((item) => (
        <li
          key={item.clientId}
          className={styles.item}
          data-state={item.status}
          aria-label={item.status === 'pending' ? 'Comment sending' : 'Comment failed to send'}
        >
          <p className={`${styles.author} type-interface`}>{item.authorName}</p>
          <p className="type-body">{item.text}</p>
          {item.status === 'failed' && (
            <p className={`${styles.failedNote} type-meta`}>
              Didn&apos;t send.{' '}
              <Button onClick={() => onRetry(item.clientId)}>Retry</Button>
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
