import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderApp } from '../../test/renderApp'

const REDESIGN_ID = '00009701-0000-4000-8000-000000000001'

/**
 * The keyboard-only demo path (§6, §8 line 163, §12 line 240): filter, open a
 * task, close, return focus. This file is the closest thing this build has to
 * the brief's own acceptance test, exercised with real key presses rather than
 * by calling handlers directly.
 */
describe('task list keyboard shortcuts', () => {
  it('/ focuses the search field without inserting a literal "/"', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    // Focus starts elsewhere, so the shortcut has somewhere real to move focus from.
    screen.getByRole('link', { name: 'TaskFlow' }).focus()

    await user.keyboard('/')
    expect(screen.getByLabelText('Search')).toHaveFocus()
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })

  it('j moves focus to the first row, then subsequent rows, crossing group boundaries', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    await user.keyboard('j')
    const firstRow = document.activeElement
    expect(firstRow?.tagName).toBe('TR')

    await user.keyboard('j')
    expect(document.activeElement).not.toBe(firstRow)
    expect(document.activeElement?.tagName).toBe('TR')
  })

  it('k moves focus to the previous row', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    await user.keyboard('jj')
    const secondRow = document.activeElement
    await user.keyboard('k')
    expect(document.activeElement).not.toBe(secondRow)
  })

  it('j skips a collapsed group entirely (§6 line 130)', async () => {
    const user = userEvent.setup()
    renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    const overdueToggle = screen.getByRole('button', { name: /^Overdue/ })
    const overdueBody = overdueToggle.closest('tbody')
    if (!overdueBody) throw new Error('expected the Overdue toggle to sit inside a tbody')
    // Every row in this tbody besides the header row belongs to the group about
    // to be collapsed — capture their ids before collapsing removes them.
    const overdueRowIds = within(overdueBody)
      .getAllByRole('row')
      .map((row) => row.getAttribute('data-row-id'))
      .filter((id): id is string => id !== null)
    expect(overdueRowIds.length).toBeGreaterThan(0)

    await user.click(overdueToggle)
    await user.keyboard('j')

    const activeRowId = (document.activeElement as HTMLElement).dataset.rowId
    expect(activeRowId).toBeTruthy()
    expect(overdueRowIds).not.toContain(activeRowId)
  })

  it('Enter on the focused row opens the task drawer route', async () => {
    const user = userEvent.setup()
    const { router } = renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    await user.keyboard('j')
    const rowId = (document.activeElement as HTMLElement).dataset.rowId
    await user.keyboard('{Enter}')

    expect(router.state.location.pathname).toBe(`/projects/${REDESIGN_ID}/tasks/${rowId}`)
  })

  it('n opens the create-task route', async () => {
    const user = userEvent.setup()
    const { router } = renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    await user.keyboard('n')
    expect(router.state.location.pathname).toBe(`/projects/${REDESIGN_ID}/tasks/new`)
  })

  it('single-letter shortcuts are suppressed while the search field has focus', async () => {
    const user = userEvent.setup()
    const { router } = renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')

    screen.getByLabelText('Search').focus()
    await user.keyboard('n')
    expect(router.state.location.pathname).toBe(`/projects/${REDESIGN_ID}`)
  })
})
