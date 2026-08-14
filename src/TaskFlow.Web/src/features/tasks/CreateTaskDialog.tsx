import { useState } from 'react'
import { useLocation, useParams } from 'react-router'

import { fieldErrors } from '../../api/problem'
import { LIMITS } from '../../api/types'
import { Dialog } from '../../a11y/Dialog'
import { useDialogClose } from '../../a11y/useDialogClose'
import { Button } from '../../ui/Button'
import { ErrorSummary, type SummaryField } from '../../ui/ErrorSummary'
import { Field } from '../../ui/Field'
import { useToast } from '../../ui/ToastProvider'
import { useCreateTask } from './useCreateTask'
import styles from './CreateTaskDialog.module.css'

const FIELDS: SummaryField[] = [
  { name: 'title', label: 'Title' },
  { name: 'description', label: 'Description' },
  { name: 'dueDate', label: 'Due date' },
]

/**
 * §2 `/projects/:projectId/tasks/new` — modal route over the task list, filters
 * preserved (§2 line 49) since the fallback close path below carries the
 * current query string along, not just the bare project path.
 */
export function CreateTaskDialog() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) {
    throw new Error('CreateTaskDialog rendered without a :projectId route param')
  }

  const location = useLocation()
  const close = useDialogClose(`/projects/${projectId}${location.search}`)
  const toast = useToast()
  const mutation = useCreateTask(projectId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = await mutation.run({
      title,
      description: description || null,
      dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null,
    })
    if (result.ok) {
      toast.push({
        message: `"${result.value.title}" created`,
        linkTo: `/projects/${projectId}/tasks/${result.value.id}`,
        linkLabel: 'View task',
      })
      close()
    }
  }

  return (
    <Dialog titleText="New task" onClose={close} initialFocus="firstField">
      <form onSubmit={handleSubmit} noValidate>
        <ErrorSummary error={mutation.error} fields={FIELDS} />

        <Field
          id="title"
          label="Title"
          value={title}
          onChange={setTitle}
          maxLength={LIMITS.taskTitle}
          required
          autoFocusTarget
          errorMessages={fieldErrors(mutation.error, 'title')}
        />
        <Field
          id="description"
          label="Description"
          value={description}
          onChange={setDescription}
          maxLength={LIMITS.taskDescription}
          multiline
          errorMessages={fieldErrors(mutation.error, 'description')}
        />
        <Field
          id="dueDate"
          label="Due date"
          type="date"
          value={dueDate}
          onChange={setDueDate}
          errorMessages={fieldErrors(mutation.error, 'dueDate')}
        />

        <div className={styles.actions}>
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create task'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
