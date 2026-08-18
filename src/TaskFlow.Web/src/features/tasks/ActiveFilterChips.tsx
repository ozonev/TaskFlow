import { formatDate } from '../../lib/datetime'
import { useLabels } from '../labels/useLabels'
import type { TaskFiltersApi } from './useTaskFilters'
import styles from './ActiveFilterChips.module.css'

interface Chip {
  key: string
  label: string
  onRemove: () => void
}

/** §4 — removable summary of applied filters, plus clear-all. */
export function ActiveFilterChips({
  projectId,
  filters,
}: {
  projectId: string
  filters: TaskFiltersApi
}) {
  // Shares the LabelFilter's cache entry (same query key) — resolving the
  // selected label's name here costs no extra request on the happy path.
  const labels = useLabels(projectId)

  if (!filters.hasActiveFilters) {
    return null
  }

  const chips: Chip[] = []
  if (filters.q) {
    chips.push({ key: 'q', label: `Search: "${filters.q}"`, onRemove: () => filters.onSearchChange('') })
  }
  if (filters.status) {
    chips.push({ key: 'status', label: `Status: ${filters.status}`, onRemove: () => filters.setStatus('') })
  }
  if (filters.dueFrom) {
    chips.push({
      key: 'dueFrom',
      label: `Due from ${formatDate(`${filters.dueFrom}T00:00:00.000Z`)}`,
      onRemove: () => filters.setDueFrom(''),
    })
  }
  if (filters.dueTo) {
    chips.push({
      key: 'dueTo',
      label: `Due to ${formatDate(`${filters.dueTo}T00:00:00.000Z`)}`,
      onRemove: () => filters.setDueTo(''),
    })
  }
  if (filters.labelId) {
    const labelName = labels.data?.find((label) => label.id === filters.labelId)?.name ?? filters.labelId
    chips.push({
      key: 'label',
      label: `Label: ${labelName}`,
      onRemove: () => filters.setLabelId(''),
    })
  }

  return (
    <ul className={styles.list}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <button type="button" className={`${styles.chip} type-meta`} onClick={chip.onRemove}>
            {chip.label}
            <span aria-hidden="true" className={styles.remove}>
              ×
            </span>
            <span className="visually-hidden">Remove filter</span>
          </button>
        </li>
      ))}
      <li>
        <button type="button" className={`${styles.clearAll} type-meta`} onClick={filters.clearAll}>
          Clear all
        </button>
      </li>
    </ul>
  )
}
