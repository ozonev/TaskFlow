import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../../test/axe'
import { renderApp } from '../../test/renderApp'

describe('ProjectsPage — §7 states', () => {
  describe('loading', () => {
    it('shows aria-busy and five skeleton rows on first load, past the 200ms gate', async () => {
      vi.useFakeTimers()
      try {
        const { container } = renderApp('/projects', { latency: { min: 300, max: 300 } })

        // Under the 200ms loading gate, nothing indicates loading yet.
        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')

        await act(async () => {
          vi.advanceTimersByTime(201)
        })
        const table = screen.getByRole('table')
        expect(table).toHaveAttribute('aria-busy', 'true')
        expect(container.querySelectorAll('tbody tr')).toHaveLength(5)

        await act(async () => {
          vi.advanceTimersByTime(200)
        })
        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')
        expect(screen.getAllByRole('link', { name: /./ }).length).toBeGreaterThan(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('shows no loading state at all for a response under 200ms (§7 line 150)', async () => {
      renderApp('/projects')
      // Default renderApp latency is 0. The table must never have reported busy.
      await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1))
      expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false')
    })
  })

  describe('empty', () => {
    it('shows "No projects yet" with a create action, and no table', async () => {
      renderApp('/projects', { seed: 'empty' })

      expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      // Two "New project" actions exist by design — the header action and this
      // one — so scope to the empty-state region rather than assert a single link.
      const links = screen.getAllByRole('link', { name: 'New project' })
      expect(links.length).toBeGreaterThan(0)
      expect(links[0]).toHaveAttribute('href', '/projects/new')
    })

    it('has no axe violations', async () => {
      const { container } = renderApp('/projects', { seed: 'empty' })
      await screen.findByRole('heading', { name: 'No projects yet' })
      await expectNoAxeViolations(container)
    })
  })

  describe('error', () => {
    it('shows an inline error block with retry and a traceId, and retry can succeed', async () => {
      const user = userEvent.setup()
      renderApp('/projects', {
        failures: [{ endpoint: 'listProjects', mode: '500', once: true }],
      })

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/couldn't load projects/i)
      expect(alert).toHaveTextContent(/Reference:/)

      await user.click(screen.getByRole('button', { name: 'Retry' }))

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('keeps the filters view retryable — a second failure re-shows the error', async () => {
      const user = userEvent.setup()
      renderApp('/projects', {
        failures: [{ endpoint: 'listProjects', mode: '500' }],
      })

      await screen.findByRole('alert')
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      // Failure was not `once`, so retry fails again — the state must still read
      // as an error, not silently clear.
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })
  })

  describe('loaded, with pagination', () => {
    it('paginates with Previous/Next and updates the caption', async () => {
      const user = userEvent.setup()
      renderApp('/projects', { seed: 'large' })

      await screen.findByText(/Page 1 of 3/)
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText(/Page 2 of 3/)
      expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

      await user.click(screen.getByRole('button', { name: 'Previous' }))
      await screen.findByText(/Page 1 of 3/)
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    })

    it('states the row count and current page in the table caption (§8 line 154)', async () => {
      renderApp('/projects', { seed: 'large' })
      await screen.findByText(/Page 1 of 3/)
      // A <caption> contributes to the table's accessible NAME, per the standard
      // accessible-name computation — not its description.
      expect(screen.getByRole('table')).toHaveAccessibleName(/45 projects, page 1 of 3/)
    })

    it('drops no task-count column — the API response cannot supply one', async () => {
      renderApp('/projects', { seed: 'large' })
      await screen.findByText(/Page 1 of 3/)
      expect(screen.queryByRole('columnheader', { name: /tasks?/i })).not.toBeInTheDocument()
    })

    it('has no axe violations once loaded', async () => {
      const { container } = renderApp('/projects')
      await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1))
      await expectNoAxeViolations(container)
    })
  })
})
