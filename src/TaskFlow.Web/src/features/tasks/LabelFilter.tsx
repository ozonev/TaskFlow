import { useLabels } from '../labels/useLabels'
import { Select } from '../../ui/Select'
import type { TaskFiltersApi } from './useTaskFilters'

/**
 * §3 line 80's real label filter — single-select, replacing the disabled
 * PlannedLabelFilter mock. Options come from the project's own labels, so the
 * control can never offer a label from another project (the cross-project
 * assignment guard is enforced server-side too — see AssignTaskLabelHandler —
 * this just keeps the happy path from ever reaching it).
 */
export function LabelFilter({ projectId, filters }: { projectId: string; filters: TaskFiltersApi }) {
  const labels = useLabels(projectId)

  const options = [
    { value: '', label: 'Any label' },
    ...(labels.data ?? []).map((label) => ({ value: label.id, label: label.name })),
  ]

  return (
    <Select
      id="task-label"
      label="Label"
      value={filters.labelId}
      onChange={filters.setLabelId}
      options={options}
    />
  )
}
