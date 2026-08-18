import { useState } from 'react'
import { useLocation, useParams } from 'react-router'

import { Dialog } from '../../a11y/Dialog'
import { useDialogClose } from '../../a11y/useDialogClose'
import { isApiError } from '../../api/problem'
import type { LabelResponse } from '../../api/types'
import { ActivityPanel } from '../activity/ActivityPanel'
import { CommentPanel } from '../comments/CommentPanel'
import { useAssignLabel } from '../labels/useAssignLabel'
import { useLabels } from '../labels/useLabels'
import { formatDate, formatDateTime } from '../../lib/datetime'
import { Button } from '../../ui/Button'
import { Select } from '../../ui/Select'
import { SkeletonBlocks } from '../../ui/SkeletonBlocks'
import { StateBlock } from '../../ui/StateBlock'
import { Tag } from '../../ui/Tag'
import { useTaskById } from './useTaskById'
import styles from './TaskDrawer.module.css'

type Tab = 'comments' | 'activity'

/**
 * §4 "TaskDrawer" — header, description, Comments/Activity tabs. §7's row for
 * this screen: header skeleton first, comments and activity load independently
 * (each panel owns its own useQuery, so a failure in one never touches the
 * other), and a 404 on the task replaces the drawer body with not-found.
 */
export function TaskDrawer() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>()
  if (!projectId || !taskId) {
    throw new Error('TaskDrawer rendered without :projectId/:taskId route params')
  }

  const location = useLocation()
  const close = useDialogClose(`/projects/${projectId}${location.search}`)
  const task = useTaskById(taskId)
  const [activeTab, setActiveTab] = useState<Tab>('comments')

  const notFound = isApiError(task.error) && task.error.status === 404

  return (
    <Dialog
      titleText={task.data?.title ?? 'Task'}
      onClose={close}
      initialFocus="close"
      variant="drawer"
    >
      {notFound ? (
        <StateBlock tone="error" title="Task not found" action={<Button onClick={close}>Back to list</Button>}>
          This task may have been removed.
        </StateBlock>
      ) : task.error ? (
        <StateBlock
          tone="error"
          title="Couldn't load this task"
          action={<Button onClick={() => task.refetch()}>Retry</Button>}
          traceId={isApiError(task.error) ? task.error.problem.traceId : undefined}
        >
          Something went wrong while loading this task.
        </StateBlock>
      ) : task.showLoading || !task.data ? (
        <div className={styles.headerSkeleton} aria-busy="true">
          <SkeletonBlocks count={3} />
        </div>
      ) : (
        <>
          <div className={styles.meta}>
            <Tag>{task.data.status}</Tag>
            {task.data.dueDate && (
              <time dateTime={task.data.dueDate} title={formatDateTime(task.data.dueDate)} className="type-meta">
                Due {formatDate(task.data.dueDate)}
              </time>
            )}
          </div>
          {task.data.description && <p className={`${styles.description} type-body`}>{task.data.description}</p>}

          <TaskLabelsSection projectId={task.data.projectId} taskId={taskId} labels={task.data.labels} />

          <div role="tablist" aria-label="Task detail" className={styles.tablist}>
            <button
              type="button"
              role="tab"
              id="tab-comments"
              aria-selected={activeTab === 'comments'}
              aria-controls="tabpanel-comments"
              className={`${styles.tab} type-interface`}
              onClick={() => setActiveTab('comments')}
            >
              Comments
            </button>
            <button
              type="button"
              role="tab"
              id="tab-activity"
              aria-selected={activeTab === 'activity'}
              aria-controls="tabpanel-activity"
              className={`${styles.tab} type-interface`}
              onClick={() => setActiveTab('activity')}
            >
              Activity
            </button>
          </div>

          <div
            role="tabpanel"
            id="tabpanel-comments"
            aria-labelledby="tab-comments"
            hidden={activeTab !== 'comments'}
          >
            <CommentPanel taskId={taskId} />
          </div>
          <div
            role="tabpanel"
            id="tabpanel-activity"
            aria-labelledby="tab-activity"
            hidden={activeTab !== 'activity'}
          >
            <ActivityPanel taskId={taskId} />
          </div>
        </>
      )}
    </Dialog>
  )
}

/**
 * Current labels as Tags, plus a Select of the project's not-yet-assigned labels
 * that assigns on selection — no separate "Add" button, since the Select itself
 * is the whole interaction. Resets to the placeholder after each assignment so
 * the same control can add another label right away.
 */
function TaskLabelsSection({
  projectId,
  taskId,
  labels,
}: {
  projectId: string
  taskId: string
  labels: LabelResponse[]
}) {
  const projectLabels = useLabels(projectId)
  const assignLabel = useAssignLabel(taskId)

  const assignedIds = new Set(labels.map((label) => label.id))
  const availableLabels = (projectLabels.data ?? []).filter((label) => !assignedIds.has(label.id))

  return (
    <div className={styles.meta}>
      {labels.map((label) => (
        <Tag key={label.id}>{label.name}</Tag>
      ))}
      {availableLabels.length > 0 && (
        <Select
          id="task-add-label"
          label="Add a label"
          value=""
          onChange={(value) => {
            if (value) {
              void assignLabel.run(value)
            }
          }}
          options={[
            { value: '', label: 'Add a label…' },
            ...availableLabels.map((label) => ({ value: label.id, label: label.name })),
          ]}
        />
      )}
      {assignLabel.error !== undefined && (
        <p role="alert" className="type-meta">
          Couldn't add that label.
          {isApiError(assignLabel.error) && assignLabel.error.problem.traceId && (
            <> Reference: <span className="type-identifier">{assignLabel.error.problem.traceId}</span></>
          )}
        </p>
      )}
    </div>
  )
}
