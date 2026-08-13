import { COUNTER_THRESHOLD } from '../lib/constants'
import styles from './Field.module.css'

export interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** Ignored for type="date", which has no length to cap or count. */
  maxLength?: number
  required?: boolean
  multiline?: boolean
  rows?: number
  errorMessages?: string[]
  /** Marks the field Dialog's focus-trap should focus on open (§10's "first field"). */
  autoFocusTarget?: boolean
  type?: 'text' | 'date'
}

/**
 * The one path a form control renders through, so a field cannot ship unlabelled
 * (§8 line 157): a persistent visible `<label>` — never a placeholder standing in
 * for one — with `aria-invalid` and `aria-describedby` wired to its message when
 * rejected, and a character counter that only announces once it matters.
 */
export function Field({
  id,
  label,
  value,
  onChange,
  maxLength,
  required = false,
  multiline = false,
  rows = 4,
  errorMessages = [],
  autoFocusTarget = false,
  type = 'text',
}: FieldProps) {
  const hasError = errorMessages.length > 0
  const errorId = `${id}-error`
  const counterId = `${id}-counter`
  const hasCounter = type !== 'date' && maxLength !== undefined
  const nearLimit = hasCounter && value.length >= maxLength * COUNTER_THRESHOLD

  const describedBy = [hasError ? errorId : null, hasCounter ? counterId : null]
    .filter(Boolean)
    .join(' ')

  const sharedProps = {
    id,
    value,
    required,
    'aria-invalid': hasError,
    'aria-describedby': describedBy || undefined,
    'data-autofocus': autoFocusTarget || undefined,
    className: `${styles.control} type-interface`,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={`${styles.label} type-label`}>
        {label}
        {required && (
          <span aria-hidden="true" className={styles.required}>
            {' '}
            *
          </span>
        )}
      </label>

      {multiline ? (
        <textarea {...sharedProps} maxLength={maxLength} rows={rows} />
      ) : (
        <input {...sharedProps} maxLength={type === 'date' ? undefined : maxLength} type={type} />
      )}

      {(hasError || hasCounter) && (
        <div className={styles.meta}>
          {hasError && (
            <p id={errorId} className={`${styles.error} type-meta`}>
              {errorMessages[0]}
            </p>
          )}
          {hasCounter && (
            // Always mounted so the polite region reliably announces the text
            // change rather than an element appearing fresh (§7 line 146).
            <p id={counterId} aria-live="polite" className={`${styles.counter} type-meta`}>
              {nearLimit ? `${value.length}/${maxLength}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
