import { useState } from 'react'

import { useTaskFlowClient } from '../../api/ClientProvider'
import { fieldErrors } from '../../api/problem'
import { LIMITS } from '../../api/types'
import { Dialog } from '../../a11y/Dialog'
import { useDialogClose } from '../../a11y/useDialogClose'
import { useMutation } from '../../data/useMutation'
import { Button } from '../../ui/Button'
import { ErrorSummary, type SummaryField } from '../../ui/ErrorSummary'
import { Field } from '../../ui/Field'
import { useToast } from '../../ui/ToastProvider'
import styles from './CreateProjectDialog.module.css'

const FIELDS: SummaryField[] = [
  { name: 'name', label: 'Name' },
  { name: 'description', label: 'Description' },
]

/**
 * §2 `/projects/new` — modal route over the project list. §7's Create-project
 * row: submit disabled with "Creating…" while pending, a 400 keeps the dialog
 * open with an error summary and per-field messages, a 409/500 keeps the form
 * filled (nothing here clears the typed values on failure — only a successful
 * close does), and a 201 closes the dialog, refetches the list, and toasts.
 */
export function CreateProjectDialog() {
  const client = useTaskFlowClient()
  const close = useDialogClose('/projects')
  const toast = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const mutation = useMutation({
    mutate: () => client.createProject({ name, description: description || null }),
    invalidates: [['projects']],
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = await mutation.run(undefined)
    if (result.ok) {
      toast.push({ message: `"${result.value.name}" created` })
      close()
    }
  }

  return (
    <Dialog titleText="New project" onClose={close} initialFocus="firstField">
      <form onSubmit={handleSubmit} noValidate>
        <ErrorSummary error={mutation.error} fields={FIELDS} />

        <Field
          id="name"
          label="Name"
          value={name}
          onChange={setName}
          maxLength={LIMITS.projectName}
          required
          autoFocusTarget
          errorMessages={fieldErrors(mutation.error, 'name')}
        />
        <Field
          id="description"
          label="Description"
          value={description}
          onChange={setDescription}
          maxLength={LIMITS.projectDescription}
          multiline
          errorMessages={fieldErrors(mutation.error, 'description')}
        />

        <div className={styles.actions}>
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
