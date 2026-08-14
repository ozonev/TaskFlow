import { useState } from 'react'

import { LIMITS } from '../../api/types'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import styles from './CommentForm.module.css'

/**
 * §6 line 135 — `Ctrl/Cmd+Enter` posts from the textarea. Bound locally here
 * rather than through the global shortcut registry: it's the one combo
 * shortcut in the brief, and it belongs wherever the textarea is, not in a
 * document-level handler that would need to know about this field specially.
 */
export function CommentForm({
  initialAuthorName,
  onSubmit,
}: {
  initialAuthorName: string
  onSubmit: (authorName: string, text: string) => Promise<void>
}) {
  const [authorName, setAuthorName] = useState(initialAuthorName)
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = authorName.trim().length > 0 && text.trim().length > 0 && !isSubmitting

  async function submit() {
    if (!canSubmit) {
      return
    }
    setIsSubmitting(true)
    await onSubmit(authorName.trim(), text.trim())
    // Author name is intentionally kept for the next comment; only the message
    // clears, matching a chat-style form rather than resetting the whole thing.
    setText('')
    setIsSubmitting(false)
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Field
        id="comment-author"
        label="Your name"
        value={authorName}
        onChange={setAuthorName}
        maxLength={LIMITS.commentAuthorName}
        required
      />
      {/* Not adding interactivity of its own — just catching the Ctrl/Cmd+Enter
          combo (§6 line 135) as it bubbles up from the textarea inside, which
          Field doesn't expose an onKeyDown passthrough for. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <Field
          id="comment-text"
          label="Comment"
          value={text}
          onChange={setText}
          maxLength={LIMITS.commentText}
          multiline
          required
        />
      </div>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={!canSubmit}>
          {isSubmitting ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  )
}
