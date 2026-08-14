import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AUTHOR_NAME_STORAGE_KEY } from '../../lib/constants'
import { renderApp } from '../../test/renderApp'

const REDESIGN_ID = '00009701-0000-4000-8000-000000000001'
// "Investigate font loading strategy" — no comments seeded, cleanest slate.
const TASK_ID = '00007a5c-0000-4000-8000-00000000000c'

async function openDrawer() {
  renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_ID}`)
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByText('No comments yet.')
  return dialog
}

describe('CommentForm / CommentPanel', () => {
  it('disables submit until both fields have content, so an empty submission is not even possible', async () => {
    const user = userEvent.setup()
    const { client } = renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_ID}`)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('No comments yet.')

    const submit = within(dialog).getByRole('button', { name: 'Post comment' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Ada')
    expect(submit).toBeDisabled() // comment text still empty

    const callsBefore = client.calls.length
    await user.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'Hi')
    expect(submit).toBeEnabled()
    expect(client.calls.length).toBe(callsBefore)
  })

  it('appends optimistically at pending state, then settles once the post resolves', async () => {
    const user = userEvent.setup()
    // A real (short, fixed) latency, not the default zero: the pending window
    // needs to be wide enough to observe synchronously right after the click,
    // the same pattern used for the pending-button assertion in
    // CreateProjectDialog.test.tsx — mutation.run sets pending state
    // synchronously before its own first await, so act() has already flushed
    // that render by the time control returns from user.click.
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_ID}`, { latency: { min: 200, max: 200 } })
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('No comments yet.')

    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Ada Lovelace')
    await user.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'Looks good to me.')
    await user.click(within(dialog).getByRole('button', { name: 'Post comment' }))

    // The textarea's own displayed value is also "Looks good to me." at this
    // point (it only clears once the submit promise resolves) — a textarea's
    // value is a text-node child in the DOM, so getByText matches it too.
    // Filter to the match that's actually inside the comment list.
    function findListItem(): HTMLElement {
      const match = within(dialog)
        .getAllByText('Looks good to me.')
        .map((el) => el.closest('li'))
        .find((li): li is HTMLLIElement => li !== null)
      if (!match) {
        throw new Error('expected the comment to render inside a list item')
      }
      return match
    }

    expect(findListItem()).toHaveAttribute('data-state', 'pending')

    // On settling, the pending entry is replaced by the real fetched comment —
    // a different DOM node, not the same node losing its attribute — so the
    // element must be re-queried each check rather than reusing the old one.
    await waitFor(() => {
      expect(findListItem()).not.toHaveAttribute('data-state')
    })
    expect(within(dialog).getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('a failed post keeps the typed text visible with an inline retry, which can then succeed', async () => {
    const user = userEvent.setup()
    // `once` so the retry succeeds the second time.
    renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_ID}`, {
      failures: [{ endpoint: 'createComment', mode: '500', once: true }],
    })
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('No comments yet.')

    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Grace Hopper')
    await user.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'Retry me.')
    await user.click(within(dialog).getByRole('button', { name: 'Post comment' }))

    const failedNote = await within(dialog).findByText("Didn't send.", { exact: false })
    expect(within(dialog).getByText('Retry me.')).toBeInTheDocument()

    const item = failedNote.closest('li')
    if (!item) throw new Error('expected the failed comment to render inside a list item')
    await user.click(within(item).getByRole('button', { name: 'Retry' }))

    await waitFor(() =>
      expect(within(dialog).queryByText("Didn't send.", { exact: false })).not.toBeInTheDocument(),
    )
    expect(within(dialog).getByText('Retry me.')).toBeInTheDocument()
  })

  it('Ctrl+Enter in the comment field posts the comment', async () => {
    const user = userEvent.setup()
    const dialog = await openDrawer()

    await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Ada Lovelace')
    const commentField = within(dialog).getByRole('textbox', { name: 'Comment' })
    await user.type(commentField, 'Posted via keyboard')
    await user.type(commentField, '{Control>}{Enter}{/Control}')

    expect(await within(dialog).findByText('Posted via keyboard')).toBeInTheDocument()
  })

  it('the character counter goes live past 90% of the 2000-character limit (§7 line 146)', async () => {
    const dialog = await openDrawer()
    const commentField = within(dialog).getByRole('textbox', { name: 'Comment' })

    expect(within(dialog).queryByText(/\/2000/)).not.toBeInTheDocument()
    // fireEvent-equivalent via direct change would bypass React's controlled
    // update path less faithfully than typing; length matters more than speed
    // isn't at stake here since this is a single change, not 1800 keystrokes.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(commentField, { target: { value: 'x'.repeat(1801) } })
    expect(within(dialog).getByText('1801/2000')).toBeInTheDocument()
  })

  describe('author name persistence (§6 line 119)', () => {
    it('is written to localStorage only after a successful post, not before', async () => {
      const user = userEvent.setup()
      const dialog = await openDrawer()
      expect(localStorage.getItem(AUTHOR_NAME_STORAGE_KEY)).toBeNull()

      await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Ada Lovelace')
      await user.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'Hello')
      // Not committed yet — only typed.
      expect(localStorage.getItem(AUTHOR_NAME_STORAGE_KEY)).toBeNull()

      await user.click(within(dialog).getByRole('button', { name: 'Post comment' }))
      await waitFor(() => expect(localStorage.getItem(AUTHOR_NAME_STORAGE_KEY)).toBe('Ada Lovelace'))
    })

    it('a failed post does not commit the author name', async () => {
      const user = userEvent.setup()
      renderApp(`/projects/${REDESIGN_ID}/tasks/${TASK_ID}`, {
        failures: [{ endpoint: 'createComment', mode: '500' }],
      })
      const dialog = await screen.findByRole('dialog')
      await within(dialog).findByText('No comments yet.')

      await user.type(within(dialog).getByRole('textbox', { name: 'Your name' }), 'Someone New')
      await user.type(within(dialog).getByRole('textbox', { name: 'Comment' }), 'This will fail')
      await user.click(within(dialog).getByRole('button', { name: 'Post comment' }))

      await within(dialog).findByText("Didn't send.", { exact: false })
      expect(localStorage.getItem(AUTHOR_NAME_STORAGE_KEY)).toBeNull()
    })

    it('pre-fills the author field from a previously stored name', async () => {
      localStorage.setItem(AUTHOR_NAME_STORAGE_KEY, 'Remembered Name')
      const dialog = await openDrawer()
      expect(within(dialog).getByRole('textbox', { name: 'Your name' })).toHaveValue('Remembered Name')
    })
  })
})
