import { useRef, useState } from 'react'

import { isApiError } from '../../api/problem'
import { Button } from '../../ui/Button'
import { StateBlock } from '../../ui/StateBlock'
import { CommentForm } from './CommentForm'
import { CommentList } from './CommentList'
import type { PendingComment } from './PendingComment'
import { useAuthorName } from './useAuthorName'
import { useComments } from './useComments'
import { usePostComment } from './usePostComment'

/**
 * Owns the optimistic-append queue (§6 line 119): a comment appears immediately
 * at 60% opacity, settles on 201, or stays with an inline retry on failure —
 * the typed text is never lost. CommentForm only knows how to collect input;
 * this is what merges "what the server has" with "what's still in flight".
 */
export function CommentPanel({ taskId }: { taskId: string }) {
  const { data, error, showLoading, refetch } = useComments(taskId)
  const postComment = usePostComment(taskId)
  const { storedName, commit } = useAuthorName()
  const [pending, setPending] = useState<PendingComment[]>([])
  const nextIdRef = useRef(0)

  async function post(authorName: string, text: string) {
    nextIdRef.current += 1
    const clientId = `pending-${nextIdRef.current}`
    setPending((current) => [...current, { clientId, authorName, text, status: 'pending' }])
    await attempt(clientId, authorName, text)
  }

  async function attempt(clientId: string, authorName: string, text: string) {
    const result = await postComment.run({ authorName, text })
    if (result.ok) {
      commit(authorName)
      setPending((current) => current.filter((item) => item.clientId !== clientId))
    } else {
      setPending((current) =>
        current.map((item) => (item.clientId === clientId ? { ...item, status: 'failed' } : item)),
      )
    }
  }

  function retry(clientId: string) {
    const item = pending.find((candidate) => candidate.clientId === clientId)
    if (!item) {
      return
    }
    setPending((current) =>
      current.map((candidate) =>
        candidate.clientId === clientId ? { ...candidate, status: 'pending' } : candidate,
      ),
    )
    void attempt(clientId, item.authorName, item.text)
  }

  return (
    <div aria-busy={showLoading}>
      {error ? (
        <StateBlock
          tone="error"
          title="Couldn't load comments"
          action={<Button onClick={() => refetch()}>Retry</Button>}
          traceId={isApiError(error) ? error.problem.traceId : undefined}
        >
          This panel failed to load; the rest of the drawer is unaffected.
        </StateBlock>
      ) : (
        <>
          <CommentList comments={data ?? []} pending={pending} onRetry={retry} />
          <CommentForm initialAuthorName={storedName} onSubmit={post} />
        </>
      )}
    </div>
  )
}
