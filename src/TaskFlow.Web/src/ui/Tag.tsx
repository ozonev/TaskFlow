import type { ReactNode } from 'react'

import styles from './Tag.module.css'

/**
 * §8 line 159 — "status is never carried by colour alone; the tag carries its
 * text". The overdue variant changes ink, never removes the text label.
 */
export function Tag({ tone = 'default', children }: { tone?: 'default' | 'overdue'; children: ReactNode }) {
  return (
    <span className={`${styles.tag} ${tone === 'overdue' ? styles.overdue : ''} type-meta`}>
      {children}
    </span>
  )
}
