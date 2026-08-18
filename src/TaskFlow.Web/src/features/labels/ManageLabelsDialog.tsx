import { useState } from 'react'
import { useParams } from 'react-router'

import { Dialog } from '../../a11y/Dialog'
import { useDialogClose } from '../../a11y/useDialogClose'
import { fieldErrors, isApiError } from '../../api/problem'
import { LIMITS } from '../../api/types'
import { Button } from '../../ui/Button'
import { ErrorSummary, type SummaryField } from '../../ui/ErrorSummary'
import { Field } from '../../ui/Field'
import { StateBlock } from '../../ui/StateBlock'
import { Tag } from '../../ui/Tag'
import { useCreateLabel } from './useCreateLabel'
import { useLabels } from './useLabels'
import styles from './ManageLabelsDialog.module.css'

const FIELDS: SummaryField[] = [{ name: 'name', label: 'Name' }]

/**
 * §2-style modal route, `/projects/:projectId/labels` — lists a project's labels
 * and lets the user create new ones. Mirrors CreateProjectDialog's error-summary
 * plus per-field pattern; a duplicate name comes back as a 400 keyed "Name" (see
 * LabelsController), so it renders through the exact same path as any other
 * field validation failure — no separate "duplicate" UI state to build.
 */
export function ManageLabelsDialog() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) {
    throw new Error('ManageLabelsDialog rendered without a :projectId route param')
  }

  const close = useDialogClose(`/projects/${projectId}`)
  const labels = useLabels(projectId)
  const mutation = useCreateLabel(projectId)

  const [name, setName] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = await mutation.run({ name })
    if (result.ok) {
      setName('')
    }
  }

  return (
    <Dialog titleText="Manage labels" onClose={close} initialFocus="firstField">
      {labels.error ? (
        <StateBlock
          tone="error"
          title="Couldn't load labels"
          action={<Button onClick={() => labels.refetch()}>Retry</Button>}
          traceId={isApiError(labels.error) ? labels.error.problem.traceId : undefined}
        >
          Something went wrong while loading this project's labels.
        </StateBlock>
      ) : labels.showLoading ? (
        <p className="type-meta">Loading labels…</p>
      ) : labels.data && labels.data.length > 0 ? (
        <ul className={styles.list}>
          {labels.data.map((label) => (
            <li key={label.id}>
              <Tag>{label.name}</Tag>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${styles.empty} type-meta`}>No labels yet.</p>
      )}

      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <ErrorSummary error={mutation.error} fields={FIELDS} />

        <Field
          id="name"
          label="New label name"
          value={name}
          onChange={setName}
          maxLength={LIMITS.labelName}
          required
          autoFocusTarget
          errorMessages={fieldErrors(mutation.error, 'name')}
        />

        <div className={styles.actions}>
          <Button type="button" onClick={close}>
            Done
          </Button>
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create label'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
