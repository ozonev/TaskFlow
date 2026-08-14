import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../../test/axe'
import { renderApp } from '../../test/renderApp'

// Seed ids from api/mock/seed.ts's default seed: redesign (12 tasks across every
// due window), mobile (zero tasks — the first empty state), tooling (3 tasks).
const REDESIGN_ID = '00009701-0000-4000-8000-000000000001'
const MOBILE_ID = '00009701-0000-4000-8000-000000000002'

describe('TaskListPage', () => {
  it('shows the project name as the page title and the task table once loaded', async () => {
    renderApp(`/projects/${REDESIGN_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Website redesign' })).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  describe('grouping', () => {
    it('renders overdue, today, this week, later, and no-due-date groups with counts', async () => {
      renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')

      for (const label of ['Overdue', 'Today', 'This week', 'Later', 'No due date']) {
        expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
      }
    })

    it('collapsing a group hides its rows and updates aria-expanded', async () => {
      const user = userEvent.setup()
      renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')

      const overdueToggle = screen.getByRole('button', { name: /^Overdue/ })
      expect(overdueToggle).toHaveAttribute('aria-expanded', 'true')
      const rowsBefore = screen.getAllByRole('row').length

      await user.click(overdueToggle)
      expect(overdueToggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getAllByRole('row').length).toBeLessThan(rowsBefore)
    })
  })

  describe('the two distinct empty states (§7 line 145)', () => {
    it('shows "No tasks yet" with a create action for a project with zero tasks', async () => {
      renderApp(`/projects/${MOBILE_ID}`)
      expect(await screen.findByRole('heading', { name: 'No tasks yet' })).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: 'New task' }).length).toBeGreaterThan(0)
      // The shortcut list is printed here too (§6 line 137) — the header also
      // carries one, so two matches is the expected, correct count.
      expect(screen.getAllByText('Keyboard shortcuts')).toHaveLength(2)
      // The project-name fetch (independent of the task-list fetch this state
      // depends on) settles separately; wait for it too so its update lands in
      // this test rather than as an act() warning on the next one.
      await screen.findByRole('heading', { level: 1, name: 'Mobile app launch' })
    })

    it('shows "No tasks match" stating the unfiltered count, distinct from the first state', async () => {
      const user = userEvent.setup()
      renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')

      await user.type(screen.getByLabelText('Search'), 'zzz-no-match')
      screen.getByLabelText('Search').blur()

      expect(await screen.findByRole('heading', { name: 'No tasks match these filters' })).toBeInTheDocument()
      // The unfiltered count is a second, lazily-started request (§7 line 145) —
      // it can resolve after the empty-state heading itself, so it needs its own wait.
      expect(await screen.findByText(/12 tasks in this project/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    })

    it('clear filters returns to the loaded list', async () => {
      const user = userEvent.setup()
      renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')

      await user.type(screen.getByLabelText('Search'), 'zzz-no-match')
      screen.getByLabelText('Search').blur()
      await screen.findByRole('heading', { name: 'No tasks match these filters' })

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))
      await screen.findByRole('table')
      expect(screen.getByLabelText('Search')).toHaveValue('')
    })
  })

  describe('filters reach the URL', () => {
    it('a status change is reflected in the address and as a removable chip', async () => {
      const user = userEvent.setup()
      renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')

      await user.selectOptions(screen.getByLabelText('Status'), 'Todo')
      expect(screen.getByText('Status: Todo')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Status: Todo/ }))
      expect(screen.queryByText('Status: Todo')).not.toBeInTheDocument()
    })

    it('debounces search input and does not query on every keystroke', async () => {
      const user = userEvent.setup()
      const { client } = renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')
      const callsBefore = client.calls.filter((c) => c === 'searchTasks').length

      await user.type(screen.getByLabelText('Search'), 'a')
      // Immediately after typing, no new search has fired yet.
      expect(client.calls.filter((c) => c === 'searchTasks').length).toBe(callsBefore)

      screen.getByLabelText('Search').blur()
      await waitFor(() =>
        expect(client.calls.filter((c) => c === 'searchTasks').length).toBeGreaterThan(callsBefore),
      )
    })
  })

  describe('the planned label control (§3 line 80, §12 line 238)', () => {
    it('is aria-disabled, focusable, issues no request, and never enters the query string', async () => {
      const user = userEvent.setup()
      const { client, router } = renderApp(`/projects/${REDESIGN_ID}`)
      await screen.findByRole('table')

      const control = screen.getByRole('button', { name: /Any label/ })
      expect(control).toHaveAttribute('aria-disabled', 'true')

      control.focus()
      expect(control).toHaveFocus()

      const callsBefore = client.calls.length
      await user.click(control)
      await user.keyboard('{Enter}')

      expect(client.calls.length).toBe(callsBefore)
      expect(router.state.location.search).not.toContain('label')
    })
  })

  it('has no axe violations once loaded', async () => {
    const { container } = renderApp(`/projects/${REDESIGN_ID}`)
    await screen.findByRole('table')
    // The project-name fetch is independent of the task-list fetch and can
    // settle after it; wait for it too so the update lands here, not as an
    // act() warning on whichever test runs next.
    await screen.findByRole('heading', { level: 1, name: 'Website redesign' })
    await expectNoAxeViolations(container)
  })

  it('has no axe violations in the empty state', async () => {
    const { container } = renderApp(`/projects/${MOBILE_ID}`)
    await screen.findByRole('heading', { name: 'No tasks yet' })
    await expectNoAxeViolations(container)
  })
})
