import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../../test/axe'
import { renderApp } from '../../test/renderApp'

const REDESIGN_ID = '00009701-0000-4000-8000-000000000001'

describe('CreateTaskDialog', () => {
  it('cold entry renders the task list behind it', async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/new`)
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('focuses the Title field on open', async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/new`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus())
  })

  it('preserves the current filters when opening and closing (§2 line 49)', async () => {
    const user = userEvent.setup()
    const { router } = renderApp(`/projects/${REDESIGN_ID}?status=Todo`)
    await screen.findByRole('table')

    await user.click(screen.getByRole('link', { name: 'New task' }))
    expect(router.state.location.search).toContain('status=Todo')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.search).toContain('status=Todo')
  })

  it('rejects an empty title', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/tasks/new`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const summary = await screen.findByRole('alert')
    await waitFor(() => expect(summary).toHaveFocus())
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('a 400 keeps the dialog open with per-field messages', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/tasks/new`, {
      failures: [{ endpoint: 'createTask', mode: '400' }],
    })

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Anything')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Anything')
  })

  it('on success: closes, refetches the list, shows the new row, and toasts with a link to the task', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/tasks/new`)

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Newly created task')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('link', { name: 'Newly created task' })).toBeInTheDocument()
    expect(screen.getByText('"Newly created task" created')).toBeInTheDocument()

    const toastLink = screen.getByRole('link', { name: 'View task' })
    await user.click(toastLink)
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Newly created task')
  })

  it('a due date is sent as UTC midnight for that date', async () => {
    const user = userEvent.setup()
    const { client } = renderApp(`/projects/${REDESIGN_ID}/tasks/new`)

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Dated task')
    await user.type(screen.getByLabelText('Due date'), '2026-12-01')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const created = client.store.data.tasks.find((task) => task.title === 'Dated task')
    expect(created?.dueDate).toBe('2026-12-01T00:00:00.000Z')
  })

  it('Cancel closes without creating anything', async () => {
    const user = userEvent.setup()
    const { client } = renderApp(`/projects/${REDESIGN_ID}/tasks/new`)

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Abandoned task')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(client.calls).not.toContain('createTask')
  })

  it('has no axe violations', async () => {
    const { container } = renderApp(`/projects/${REDESIGN_ID}/tasks/new`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus())
    await screen.findByRole('table')
    await expectNoAxeViolations(container)
  })
})
