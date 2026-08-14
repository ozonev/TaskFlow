import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../../test/axe'
import { renderApp } from '../../test/renderApp'

const REDESIGN_ID = '00009701-0000-4000-8000-000000000001'
// "Fix colour contrast failures…" — has 2 comments and a TaskCreated audit row.
const TASK_WITH_COMMENTS = '00007a5c-0000-4000-8000-000000000002'
// "Investigate font loading strategy" — no comments, and seeded with
// audited:false, so it has no activity rows either.
const TASK_WITH_NEITHER = '00007a5c-0000-4000-8000-00000000000c'

describe('TaskDrawer', () => {
  it('cold entry renders the task list behind it', async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('has role=dialog, aria-modal, and focuses the close button on open (§8 line 155)', async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus())
  })

  it('marks #app-shell inert while open', async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`)
    await screen.findByRole('dialog')
    expect(document.getElementById('app-shell')).toHaveAttribute('inert')
  })

  it('shows the task title, status, and comments once loaded', async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`)
    const dialog = await screen.findByRole('dialog', { name: /Fix colour contrast/ })
    // The background list also shows "Todo" tags on its own rows — scope to the
    // drawer, or this is ambiguous.
    expect(within(dialog).getByText('Todo')).toBeInTheDocument()
    expect(await within(dialog).findByText('Priya Raman')).toBeInTheDocument()
  })

  it('shows "No comments yet" and "No activity recorded" for a task with neither', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_NEITHER}`)
    await screen.findByRole('dialog')

    expect(await screen.findByText('No comments yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Activity' }))
    expect(await screen.findByText('No activity recorded.')).toBeInTheDocument()
  })

  it('switches tabs, each loading independently (§7 line 147)', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`)
    await screen.findByRole('dialog')

    const commentsTab = screen.getByRole('tab', { name: 'Comments' })
    const activityTab = screen.getByRole('tab', { name: 'Activity' })
    expect(commentsTab).toHaveAttribute('aria-selected', 'true')
    expect(activityTab).toHaveAttribute('aria-selected', 'false')

    await user.click(activityTab)
    expect(activityTab).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Task created')).toBeInTheDocument()
  })

  it("a comments-panel failure degrades only that panel — activity is unaffected", async () => {
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`, {
      failures: [{ endpoint: 'listComments', mode: '500' }],
    })
    const dialog = await screen.findByRole('dialog')

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load comments/i)
    // The task header (a different data source) still rendered normally —
    // scoped to the drawer since the background list also shows "Todo" tags.
    expect(within(dialog).getByText('Todo')).toBeInTheDocument()
  })

  it('cold deep link falls back to task search (§3 line 78) and shows not-found for an unknown id', async () => {
    const unknownId = 'ffffffff-0000-4000-8000-000000000000'
    const { client } = renderApp(`/projects/${REDESIGN_ID}/tasks/${unknownId}`)

    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument()
    // The fallback (§3 line 78) goes through searchTasks — there is no getTask
    // method on TaskFlowClient at all, so this is the only call that could prove it.
    expect(client.calls).toContain('searchTasks')
  })

  it('Back to list returns to the project task list from a not-found task', async () => {
    const user = userEvent.setup()
    const unknownId = 'ffffffff-0000-4000-8000-000000000000'
    renderApp(`/projects/${REDESIGN_ID}/tasks/${unknownId}`)

    await screen.findByRole('heading', { name: 'Task not found' })
    await user.click(screen.getByRole('button', { name: 'Back to list' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('Esc closes the drawer and returns focus to the originating row', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    const row = document.querySelector<HTMLElement>(`[data-row-id="${TASK_WITH_COMMENTS}"]`)
    if (!row) throw new Error('expected the seeded row to be present')
    row.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(row).toHaveFocus())
  })

  it('has no axe violations', async () => {
    const { container } = renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_WITH_COMMENTS}`)
    await screen.findByRole('dialog')
    await screen.findByText('Priya Raman')
    await expectNoAxeViolations(container)
  })
})
