import { useRef } from 'react'

import { useShortcut } from '../../shortcuts/useShortcut'
import { Select } from '../../ui/Select'
import { LabelFilter } from './LabelFilter'
import type { TaskFiltersApi } from './useTaskFilters'
import styles from './FilterBar.module.css'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  // TaskItemStatus has exactly one member today — the filter reflects that
  // honestly rather than implying a workflow that doesn't exist yet.
  { value: 'Todo', label: 'Todo' },
]

/** §4 — search, status select, due-date range, label select. */
export function FilterBar({ projectId, filters }: { projectId: string; filters: TaskFiltersApi }) {
  const searchRef = useRef<HTMLInputElement>(null)

  // §6 line 129 — `/` focuses the search field. Registered here, not in
  // TaskListPage, because this component is the one that owns the input.
  useShortcut('/', (event) => {
    event.preventDefault()
    searchRef.current?.focus()
  })

  return (
    <div className={styles.bar}>
      <div className={styles.field}>
        <label htmlFor="task-search" className={`${styles.label} type-label`}>
          Search
        </label>
        <input
          ref={searchRef}
          id="task-search"
          type="search"
          value={filters.searchDraft}
          onChange={(event) => filters.onSearchChange(event.target.value)}
          onBlur={filters.flushSearch}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              filters.flushSearch()
            }
          }}
          placeholder="Search by title"
          className={`${styles.control} type-interface`}
        />
      </div>

      <Select
        id="task-status"
        label="Status"
        value={filters.status}
        onChange={(value) => filters.setStatus(value as 'Todo' | '')}
        options={STATUS_OPTIONS}
      />

      <div className={styles.field}>
        <label htmlFor="task-due-from" className={`${styles.label} type-label`}>
          Due from
        </label>
        <input
          id="task-due-from"
          type="date"
          value={filters.dueFrom}
          onChange={(event) => filters.setDueFrom(event.target.value)}
          className={`${styles.control} type-interface`}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="task-due-to" className={`${styles.label} type-label`}>
          Due to
        </label>
        <input
          id="task-due-to"
          type="date"
          value={filters.dueTo}
          onChange={(event) => filters.setDueTo(event.target.value)}
          className={`${styles.control} type-interface`}
        />
      </div>

      <LabelFilter projectId={projectId} filters={filters} />
    </div>
  )
}
