import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../../test/axe'
import { renderApp } from '../../test/renderApp'

describe('CreateProjectDialog', () => {
  it('cold entry to /projects/new renders the list behind it (§2 line 46)', async () => {
    renderApp('/projects/new')
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    await screen.findByRole('table')
  })

  it('focuses the Name field on open', async () => {
    renderApp('/projects/new')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus())
  })

  it('rejects an empty name and shows the error summary focused, with per-field messages', async () => {
    const user = userEvent.setup()
    renderApp('/projects/new')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Create project' }))

    const summary = await screen.findByRole('alert')
    await waitFor(() => expect(summary).toHaveFocus())
    expect(summary).toHaveTextContent(/name/i)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a name over 100 characters', async () => {
    const user = userEvent.setup()
    renderApp('/projects/new')

    // The field's own maxLength=100 physically stops userEvent.type at 100
    // characters — exactly the client-side behaviour that's supposed to happen.
    // To exercise the server-side length check behind it too (defence in depth,
    // matching the real API's own [MaxLength] validation), set the over-limit
    // value directly via fireEvent, bypassing the input's own constraint.
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'x'.repeat(101) },
    })
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('disables submit and shows "Creating…" while pending', async () => {
    const user = userEvent.setup()
    // A fixed delay, checked with a synchronous getByRole rather than
    // findByRole's polling: mutation.run sets isPending=true synchronously before
    // its own first await, so act() (which user.click waits on) has already
    // flushed that render by the time this line runs. No poll means no window in
    // which a fast real timer could resolve before the assertion — the earlier
    // findByRole version raced the mock's delay under load and was flaky. 200ms
    // is ample margin over click handling (sub-millisecond) without leaving a
    // long-lived dangling timer, since this test never awaits the request settling.
    renderApp('/projects/new', { latency: { min: 200, max: 200 } })

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'A new project')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    const pendingButton = screen.getByRole('button', { name: 'Creating…' })
    expect(pendingButton).toBeDisabled()
  })

  it('a 500 keeps the form filled and the dialog open', async () => {
    const user = userEvent.setup()
    renderApp('/projects/new', { failures: [{ endpoint: 'createProject', mode: '500' }] })

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Kept on failure')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Kept on failure')
  })

  it('on success: closes, refetches the list, shows the new row, and toasts', async () => {
    const user = userEvent.setup()
    renderApp('/projects/new', { seed: 'empty' })

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Fresh project')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('link', { name: 'Fresh project' })).toBeInTheDocument()
    expect(screen.getByText('"Fresh project" created')).toBeInTheDocument()
  })

  it('Cancel closes without creating anything', async () => {
    const user = userEvent.setup()
    const { client } = renderApp('/projects/new')

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Abandoned')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(client.calls).not.toContain('createProject')
  })

  it('Esc returns focus to the New project button that opened it', async () => {
    const user = userEvent.setup()
    renderApp('/projects')

    const trigger = screen.getAllByRole('link', { name: 'New project' })[0]
    if (!trigger) throw new Error('expected a New project link')
    await user.click(trigger)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('the character counter goes live past 90% of the description limit (§7 line 146)', async () => {
    renderApp('/projects/new')

    const description = screen.getByLabelText('Description')
    expect(screen.queryByText(/\/500/)).not.toBeInTheDocument()

    // fireEvent rather than userEvent.type: simulating 451 individual keystrokes
    // is not what this test is about — it's asserting the counter's reaction to
    // the VALUE, not the typing interaction itself, and 451 real keystrokes is
    // slow enough to flirt with the test timeout for no benefit.
    fireEvent.change(description, { target: { value: 'x'.repeat(451) } })
    expect(screen.getByText('451/500')).toBeInTheDocument()

    // ProjectsPage's own background fetch (the list behind this dialog) settles
    // after this test's assertions; wait for it so the update lands here rather
    // than as an act() warning on the next test.
    await screen.findByRole('table')
  })

  it('has no axe violations', async () => {
    const { container } = renderApp('/projects/new')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus())
    await screen.findByRole('table')
    await expectNoAxeViolations(container)
  })
})
