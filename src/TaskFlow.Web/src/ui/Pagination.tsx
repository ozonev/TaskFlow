import { Button } from './Button'
import styles from './Pagination.module.css'

/** §4 — previous/next plus position text, in a nav landmark. */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <nav aria-label="Pagination" className={styles.nav}>
      <Button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <p className={`${styles.position} type-meta`}>
        Page {page} of {totalPages}
      </p>
      <Button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
