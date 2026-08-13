import styles from './PlannedLabelFilter.module.css'

/**
 * §3 line 80 — mocked until the capstone. Rendered dashed, with a "Planned" chip
 * and `aria-disabled="true"`; it never issues a request and never enters the
 * query string. `aria-disabled` rather than the native `disabled` attribute is
 * what keeps it reachable by Tab (§8 line 162 — "stay focusable, so their
 * 'Planned' status is announced rather than skipped silently"). There is no
 * onClick at all — not even a no-op — because there is nothing for this control
 * to do yet.
 */
export function PlannedLabelFilter() {
  return (
    <div className={styles.field}>
      <span className={`${styles.label} type-label`}>Label</span>
      <button type="button" aria-disabled="true" className={`${styles.control} type-interface`}>
        Any label
        <span className={`${styles.chip} type-label`}>Planned</span>
      </button>
    </div>
  )
}
