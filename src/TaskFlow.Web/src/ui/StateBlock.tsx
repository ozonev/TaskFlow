import type { ReactNode } from 'react'

import styles from './StateBlock.module.css'

export type StateBlockTone = 'empty' | 'error'

/**
 * One component rendering empty, not-found and error states (§4's inventory).
 * "Not found" is StateBlock with tone="error" and no retry action — the same
 * shape as a server error, since §2 line 51 asks the two to share a presentation.
 *
 * `tone="error"` gets `role="alert"`, which is what makes it land in an assertive
 * live region (§8: "errors in an assertive [region]") without a separate global
 * channel — the element announces itself the moment it mounts.
 */
export function StateBlock({
  tone,
  title,
  children,
  action,
  traceId,
}: {
  tone: StateBlockTone
  title: string
  children?: ReactNode
  action?: ReactNode
  traceId?: string | undefined
}) {
  return (
    <div className={styles.block} role={tone === 'error' ? 'alert' : undefined}>
      <h2 className={`${styles.title} type-section-title`}>{title}</h2>
      {children && <div className={`${styles.body} type-body`}>{children}</div>}
      {traceId && (
        <p className={`${styles.trace} type-meta`}>
          Reference: <span className="type-identifier">{traceId}</span>
        </p>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
