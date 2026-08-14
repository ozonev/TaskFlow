import styles from './ShortcutHelp.module.css'

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '/', description: 'Focus the search field' },
  { keys: 'j / k', description: 'Move focus between task rows' },
  { keys: 'Enter', description: 'Open the focused task' },
  { keys: 'n', description: 'Create a new task' },
  { keys: 'Esc', description: 'Close a dialog or the task drawer' },
  { keys: 'Ctrl/Cmd + Enter', description: 'Post a comment' },
]

/**
 * §6 line 137 — "a shortcut list is reachable from the header and printed in the
 * empty state of the task list." One component, two call sites, rather than the
 * copy drifting between two hand-written lists.
 *
 * A description list, not a table: this renders on every page (via AppHeader),
 * and a `<table>` here would collide with the `table` role every screen's own
 * data grid already claims, making `getByRole('table')` ambiguous everywhere.
 */
export function ShortcutHelp({ variant = 'disclosure' }: { variant?: 'disclosure' | 'inline' }) {
  const list = (
    <dl className={styles.list}>
      {SHORTCUTS.map((shortcut) => (
        <div key={shortcut.keys} className={styles.row}>
          <dt className={styles.key}>
            <kbd>{shortcut.keys}</kbd>
          </dt>
          <dd className={styles.description}>{shortcut.description}</dd>
        </div>
      ))}
    </dl>
  )

  if (variant === 'inline') {
    return (
      <div className={styles.inline}>
        <p className={`${styles.heading} type-label`}>Keyboard shortcuts</p>
        {list}
      </div>
    )
  }

  return (
    <details className={styles.disclosure}>
      <summary className={`${styles.summary} type-label`}>Keyboard shortcuts</summary>
      {list}
    </details>
  )
}
