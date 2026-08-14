import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { expectNoAxeViolations } from '../test/axe'
import { renderApp } from '../test/renderApp'

describe('app shell', () => {
  it('redirects the index route to /projects', async () => {
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    // ProjectsPage's own fetch resolves after this test's assertions; wait for it
    // so the update lands inside the test rather than as an act() warning on the
    // next one.
    await screen.findByRole('table')
  })

  it('renders the not-found page for an unknown route', () => {
    renderApp('/nope')
    expect(screen.getByRole('heading', { level: 1, name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeInTheDocument()
  })

  it('states that data is in-memory without claiming anything is saved', async () => {
    renderApp('/projects')
    const badge = screen.getByText(/Prototype/)
    expect(badge).toHaveTextContent(/Reloading the page restores the sample data/)
    await screen.findByRole('table')
  })

  describe('skip link (§8 line 161)', () => {
    it('is the first thing the keyboard reaches and moves focus into main', async () => {
      const user = userEvent.setup()
      renderApp('/projects')

      await user.tab()
      const skipLink = screen.getByRole('link', { name: 'Skip to main content' })
      expect(skipLink).toHaveFocus()

      // jsdom does not implement fragment navigation, so activating the link
      // cannot move focus on its own. Assert the contract that makes it work in a
      // browser: the target exists, is the main landmark, and is focusable.
      expect(skipLink).toHaveAttribute('href', '#main')
      const main = screen.getByRole('main')
      expect(main).toHaveAttribute('id', 'main')
      expect(main).toHaveAttribute('tabindex', '-1')
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderApp('/projects')
    // Let the project list finish loading first — scanning mid-fetch, before any
    // row exists, would just prove the empty tbody is accessible.
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1))
    await expectNoAxeViolations(container)
  })
})
