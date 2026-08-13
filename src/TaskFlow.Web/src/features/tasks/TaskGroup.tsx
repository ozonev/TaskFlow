import type { TaskGroup as TaskGroupData } from './grouping'
import { TaskRow } from './TaskRow'
import styles from './TaskGroup.module.css'

/**
 * A `<tbody>` per due window rather than a table per group — one continuous
 * `<table>` across all groups is what lets §8 line 154's single caption and
 * `j`/`k`'s cross-group traversal (§6 line 130) both work without special-casing
 * a boundary between groups.
 */
export function TaskGroup({
  group,
  collapsed,
  onToggle,
  activeId,
}: {
  group: TaskGroupData
  collapsed: boolean
  onToggle: () => void
  activeId: string | null
}) {
  return (
    <tbody>
      <tr>
        <th colSpan={3} scope="colgroup" className={styles.headerCell}>
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className={`${styles.toggle} type-group-heading`}
          >
            <span aria-hidden="true" className={`${styles.chevron} ${collapsed ? styles.collapsed : ''}`}>
              ▾
            </span>
            {group.label}
            <span className={`${styles.count} type-meta`}>{group.tasks.length}</span>
          </button>
        </th>
      </tr>
      {!collapsed &&
        group.tasks.map((task) => <TaskRow key={task.id} task={task} isActive={activeId === task.id} />)}
    </tbody>
  )
}
