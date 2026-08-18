import { Link, useNavigate } from 'react-router'

import type { TaskResponse } from '../../api/types'
import { useOverlayLinkProps } from '../../a11y/useOverlayLinkProps'
import { formatDate, formatDateTime } from '../../lib/datetime'
import { Tag } from '../../ui/Tag'
import styles from './TaskRow.module.css'

/**
 * §8 line 158 — "the row is not a link; the title is", with `Enter` on the
 * focused row (§6 line 131) layered on top via roving tabindex rather than
 * making the whole `<tr>` a link. `data-row-id` is what useRovingRows and the
 * drawer's focus-return fallback both key off — never a captured DOM node,
 * since a refetch can replace this row between a row losing and regaining focus.
 */
export function TaskRow({ task, isActive }: { task: TaskResponse; isActive: boolean }) {
  const navigate = useNavigate()
  const linkProps = useOverlayLinkProps(`/projects/${task.projectId}/tasks/${task.id}`)
  const isOverdue = task.dueDate !== null && new Date(task.dueDate) < new Date()

  return (
    <tr
      data-row-id={task.id}
      tabIndex={isActive ? 0 : -1}
      className={`${styles.row} focus-inset`}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          navigate(linkProps.to, { state: linkProps.state })
        }
      }}
    >
      <td>
        <Link to={linkProps.to} state={linkProps.state} className={`${styles.titleLink} truncate type-interface`} title={task.title}>
          {task.title}
        </Link>
      </td>
      <td>
        <Tag>{task.status}</Tag>
        {task.labels.map((label) => (
          <Tag key={label.id}>{label.name}</Tag>
        ))}
      </td>
      <td>
        {task.dueDate ? (
          <time
            dateTime={task.dueDate}
            title={formatDateTime(task.dueDate)}
            className={`type-meta ${isOverdue ? styles.overdue : ''}`}
          >
            {formatDate(task.dueDate)}
          </time>
        ) : (
          <span className="type-meta">—</span>
        )}
      </td>
    </tr>
  )
}
