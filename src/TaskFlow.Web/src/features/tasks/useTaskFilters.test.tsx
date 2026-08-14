import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { SEARCH_DEBOUNCE_MS } from '../../lib/constants'
import { useTaskFilters } from './useTaskFilters'

function Harness() {
  const filters = useTaskFilters()
  return (
    <div>
      <input
        aria-label="search"
        value={filters.searchDraft}
        onChange={(event) => filters.onSearchChange(event.target.value)}
      />
      <button type="button" onClick={() => filters.setStatus('Todo')}>
        Set status
      </button>
      <button type="button" onClick={() => filters.setDueFrom('2026-01-01')}>
        Set dueFrom
      </button>
      <button type="button" onClick={() => filters.setDueTo('2026-01-31')}>
        Set dueTo
      </button>
      <button type="button" onClick={() => filters.setPage(3)}>
        Set page 3
      </button>
      <button type="button" onClick={() => filters.clearAll()}>
        Clear
      </button>
      <dl>
        <dt>q</dt>
        <dd data-testid="q">{filters.q}</dd>
        <dt>page</dt>
        <dd data-testid="page">{filters.page}</dd>
        <dt>hasActiveFilters</dt>
        <dd data-testid="active">{String(filters.hasActiveFilters)}</dd>
      </dl>
    </div>
  )
}

function renderHarness() {
  const router = createMemoryRouter([{ path: '/test', element: <Harness /> }], {
    initialEntries: ['/test'],
  })
  render(<RouterProvider router={router} />)
  return { router }
}

describe('useTaskFilters', () => {
  it('debounces the search input and replaces rather than pushes (§6 line 116)', async () => {
    // Real timers throughout: userEvent combined with fake timers has a known
    // tendency to deadlock (seen earlier in CreateProjectDialog.test.tsx too),
    // and because that deadlock happens inside an awaited call, a try/finally
    // can't even restore real timers afterward — it poisons every later test in
    // the file. A short, fixed, real wait for a known constant carries none of
    // the polling-race risk that made real timers flaky elsewhere in this build
    // (there's nothing else in flight to race against).
    const user = userEvent.setup()
    const { router } = renderHarness()
    const entryKeyBefore = router.state.location.key

    await user.type(screen.getByLabelText('search'), 'abc')
    // Not yet committed — still mid-debounce.
    expect(screen.getByTestId('q')).toHaveTextContent('')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100))
    })
    expect(screen.getByTestId('q')).toHaveTextContent('abc')
    // A replace still changes the current entry's key...
    expect(router.state.location.key).not.toBe(entryKeyBefore)

    // ...but proves it was a REPLACE, not a push, by there being nothing to
    // pop back through: going back leaves the memory history with nowhere
    // else to go, so the location is unchanged rather than landing on an
    // intermediate keystroke.
    const searchBeforeBack = router.state.location.search
    await act(async () => router.navigate(-1))
    expect(router.state.location.search).toBe(searchBeforeBack)
  })

  it('a status change pushes immediately, so back removes it (§6 line 117)', async () => {
    const user = userEvent.setup()
    const { router } = renderHarness()

    await user.click(screen.getByRole('button', { name: 'Set status' }))
    expect(router.state.location.search).toContain('status=Todo')

    await act(async () => router.navigate(-1))
    expect(router.state.location.search).not.toContain('status')
  })

  it('resets page to 1 when a filter changes', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.click(screen.getByRole('button', { name: 'Set page 3' }))
    expect(screen.getByTestId('page')).toHaveTextContent('3')

    await user.click(screen.getByRole('button', { name: 'Set status' }))
    expect(screen.getByTestId('page')).toHaveTextContent('1')
  })

  it('back/forward resyncs the search input without treating it as our own write', async () => {
    const user = userEvent.setup()
    const { router } = renderHarness()

    await user.click(screen.getByRole('button', { name: 'Set dueFrom' }))
    await act(async () => router.navigate(-1))

    expect(screen.getByTestId('q')).toHaveTextContent('')
    expect(screen.getByLabelText('search')).toHaveValue('')
  })

  it('hasActiveFilters is true only when a filter is actually set', async () => {
    const user = userEvent.setup()
    renderHarness()

    expect(screen.getByTestId('active')).toHaveTextContent('false')
    await user.click(screen.getByRole('button', { name: 'Set status' }))
    expect(screen.getByTestId('active')).toHaveTextContent('true')
  })

  it('clearAll removes every filter and resets the visible search draft', async () => {
    const user = userEvent.setup()
    renderHarness()

    await user.type(screen.getByLabelText('search'), 'zzz')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100))
    })
    await user.click(screen.getByRole('button', { name: 'Set status' }))

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByTestId('active')).toHaveTextContent('false')
    expect(screen.getByLabelText('search')).toHaveValue('')
  })

  it('two filters changed in the same tick do not clobber each other', async () => {
    const user = userEvent.setup()
    const { router } = renderHarness()

    await Promise.all([
      user.click(screen.getByRole('button', { name: 'Set dueFrom' })),
      user.click(screen.getByRole('button', { name: 'Set dueTo' })),
    ])

    expect(router.state.location.search).toContain('dueFrom=2026-01-01')
    expect(router.state.location.search).toContain('dueTo=2026-01-31')
  })
})
