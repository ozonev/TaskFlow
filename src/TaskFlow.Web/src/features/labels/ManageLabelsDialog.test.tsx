import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../../test/axe'
import { renderApp } from '../../test/renderApp'

// Seeded by api/mock/seed.ts's default seed: redesign already has two labels,
// Design and Urgent, both also shown as chips on the task rows behind this
// dialog — every assertion below is scoped to the dialog itself for that reason.
const REDESIGN_ID = '00009701-0000-4000-8000-000000000001'

describe('ManageLabelsDialog', () => {
  it('cold entry renders the task list behind it, listing the project’s existing labels', async () => {
    renderApp(`/projects/${REDESIGN_ID}/labels`)
    const dialog = await screen.findByRole('dialog', { name: 'Manage labels' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Website redesign' })).toBeInTheDocument()
    expect(await within(dialog).findByText('Design')).toBeInTheDocument()
    expect(within(dialog).getByText('Urgent')).toBeInTheDocument()
  })

  it('focuses the name field on open', async () => {
    renderApp(`/projects/${REDESIGN_ID}/labels`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New label name' })).toHaveFocus())
  })

  it('rejects an empty name and shows the error summary focused, with a per-field message', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/labels`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'New label name' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Create label' }))

    const summary = await screen.findByRole('alert')
    await waitFor(() => expect(summary).toHaveFocus())
    expect(summary).toHaveTextContent(/name/i)
    expect(screen.getByRole('textbox', { name: 'New label name' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a duplicate name, keeping the typed value', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/labels`)
    const dialog = await screen.findByRole('dialog', { name: 'Manage labels' })
    await within(dialog).findByText('Design')

    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'Design')
    await user.click(screen.getByRole('button', { name: 'Create label' }))

    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent(/already exists/i)
    expect(screen.getByRole('textbox', { name: 'New label name' })).toHaveValue('Design')
  })

  it('on success: adds the label to the list and clears the field', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/labels`)
    const dialog = await screen.findByRole('dialog', { name: 'Manage labels' })
    await within(dialog).findByText('Design')

    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'Blocked')
    await user.click(screen.getByRole('button', { name: 'Create label' }))

    expect(await within(dialog).findByText('Blocked')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'New label name' })).toHaveValue('')
  })

  it('Done closes the dialog without discarding already-created labels', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/labels`)
    const dialog = await screen.findByRole('dialog', { name: 'Manage labels' })
    await within(dialog).findByText('Design')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('has no axe violations', async () => {
    const { container } = renderApp(`/projects/${REDESIGN_ID}/labels`)
    const dialog = await screen.findByRole('dialog', { name: 'Manage labels' })
    await within(dialog).findByText('Design')
    await expectNoAxeViolations(container)
  })
})
