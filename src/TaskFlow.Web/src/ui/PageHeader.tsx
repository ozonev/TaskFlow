import type { ReactNode } from 'react'

import styles from './PageHeader.module.css'

/** §4 — title, result count, primary action. */
export function PageHeader({
  title,
  resultCount,
  action,
}: {
  title: string
  resultCount?: string
  action?: ReactNode
}) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <h1 className="type-page-title">{title}</h1>
        {resultCount && <p className={`${styles.count} type-meta`}>{resultCount}</p>}
      </div>
      {action}
    </div>
  )
}
