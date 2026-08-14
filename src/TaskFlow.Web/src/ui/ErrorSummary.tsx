import { useEffect, useRef } from 'react'

import { fieldErrors, isApiError, isValidationError, unclaimedErrors } from '../api/problem'
import styles from './ErrorSummary.module.css'

export interface SummaryField {
  name: string
  label: string
}

/**
 * §10 "Dialog — error: error summary at top, focus moved to it".
 *
 * Handles two distinct shapes, because a form submission can fail two distinct
 * ways: a 400 carries `ValidationProblemDetails.errors`, rendered per field plus
 * anything `fields` doesn't account for (unclaimedErrors) — a server-side rule
 * the UI doesn't model must still surface somewhere rather than vanish because no
 * field claimed its key. Any OTHER rejection (500, a network failure) is a plain
 * `ApiError` with no `errors` map at all — fieldErrors/unclaimedErrors both
 * correctly return nothing for it, which would otherwise leave the failure
 * completely silent. That case gets one generic message plus the traceId when
 * there is one, matching the inline-error pattern StateBlock uses elsewhere.
 *
 * Focus moves here on each new rejection: the effect depends on `error` by
 * identity, and useMutation sets a fresh error object per failed submit, so a
 * second consecutive failure re-focuses the summary rather than leaving focus
 * wherever the user last was.
 */
export function ErrorSummary({ error, fields }: { error: unknown; fields: SummaryField[] }) {
  const ref = useRef<HTMLDivElement>(null)

  const messagesByField = fields
    .map((field) => ({ field, messages: fieldErrors(error, field.name) }))
    .filter(({ messages }) => messages.length > 0)
  const otherMessages = unclaimedErrors(
    error,
    fields.map((field) => field.name),
  )
  const isValidation = isValidationError(error)
  const isGenericFailure = !isValidation && error !== undefined
  const hasContent = messagesByField.length > 0 || otherMessages.length > 0 || isGenericFailure

  useEffect(() => {
    if (hasContent) {
      ref.current?.focus()
    }
    // Re-run on every distinct error instance, not just when hasContent flips —
    // a second failure with the same field wrong is still a new thing to announce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  if (!hasContent) {
    return null
  }

  return (
    <div ref={ref} tabIndex={-1} role="alert" className={`${styles.summary} type-body`}>
      {isGenericFailure ? (
        <>
          <p className={styles.heading}>Something went wrong</p>
          <p>The request could not be completed. Your entries are unchanged — try again.</p>
          {isApiError(error) && error.problem.traceId && (
            <p className={`${styles.trace} type-meta`}>
              Reference: <span className="type-identifier">{error.problem.traceId}</span>
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.heading}>Please fix the following:</p>
          <ul className={styles.list}>
            {messagesByField.map(({ field, messages }) =>
              messages.map((message, index) => (
                <li key={`${field.name}-${index}`}>
                  <a href={`#${field.name}`}>{field.label}</a>: {message}
                </li>
              )),
            )}
            {otherMessages.map((message, index) => (
              <li key={`other-${index}`}>{message}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
