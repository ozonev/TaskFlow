import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { OverlayStackProvider, useOverlayStack } from './OverlayStack'
import { Dialog } from './Dialog'

/* Exercised in isolation, deliberately before the drawer (increment 6) lands —
   the hardest a11y work is reviewed here, on the simplest possible surface,
   rather than for the first time on the more complex overlay. */

/**
 * Mirrors RootLayout's own inert-toggle — reading overlay.count and applying
 * `inert` to the shell — WITHOUT pulling in RootLayout itself (AppHeader,
 * DevPanel) which would make this an integration test rather than a unit test of
 * Dialog. The full wiring is covered end-to-end by
 * features/projects/CreateProjectDialog.test.tsx against the real RootLayout.
 */
function FixtureAppShell({ children }: { children: React.ReactNode }) {
  const overlay = useOverlayStack()
  return (
    <div id="app-shell" inert={overlay.count > 0 ? true : undefined}>
      {children}
    </div>
  )
}

function Fixture({
  initialFocus = 'firstField' as const,
  onClose,
}: {
  initialFocus?: 'firstField' | 'close'
  onClose: () => void
}) {
  return (
    <OverlayStackProvider>
      <FixtureAppShell>
        <button type="button">Open dialog</button>
      </FixtureAppShell>
      <div id="overlay-host" />
      <Dialog titleText="Test dialog" onClose={onClose} initialFocus={initialFocus}>
        <input type="text" data-autofocus aria-label="First field" />
        <input type="text" aria-label="Second field" />
        <button type="button">Submit</button>
      </Dialog>
    </OverlayStackProvider>
  )
}

async function renderOpenDialog(initialFocus: 'firstField' | 'close' = 'firstField') {
  const onClose = vi.fn()
  render(<Fixture initialFocus={initialFocus} onClose={onClose} />)
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  return { onClose }
}

describe('Dialog', () => {
  it('has role=dialog, aria-modal, and a labelled title', async () => {
    await renderOpenDialog()
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('focuses the marked field on open when initialFocus is firstField', async () => {
    await renderOpenDialog('firstField')
    await waitFor(() => expect(screen.getByLabelText('First field')).toHaveFocus())
  })

  it('focuses the close button on open when initialFocus is close', async () => {
    await renderOpenDialog('close')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus())
  })

  it('traps Tab within the dialog, wrapping at both ends', async () => {
    const user = userEvent.setup()
    await renderOpenDialog('firstField')

    await waitFor(() => expect(screen.getByLabelText('First field')).toHaveFocus())
    await user.tab()
    expect(screen.getByLabelText('Second field')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus()
    await user.tab()
    // Wraps back to the close button — the first tabbable in the panel.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus()
  })

  it('never lets Tab reach an element outside the dialog', async () => {
    const user = userEvent.setup()
    await renderOpenDialog('close')

    for (let i = 0; i < 8; i += 1) {
      await user.tab()
    }
    expect(screen.getByText('Open dialog').closest('#app-shell')).not.toContainElement(
      document.activeElement as HTMLElement,
    )
  })

  it('calls onClose on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderOpenDialog()
    await waitFor(() => expect(screen.getByLabelText('First field')).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked, not when the panel is', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderOpenDialog()

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    // The backdrop is the dialog's parent — click it directly, not a descendant.
    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('marks #app-shell inert while open (§8 line 155)', async () => {
    await renderOpenDialog()
    expect(document.getElementById('app-shell')).toHaveAttribute('inert')
  })

  it('returns focus to the trigger on unmount, after inert is lifted', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <OverlayStackProvider>
          <FixtureAppShell>
            <button type="button" onClick={() => setOpen(true)}>
              Open
            </button>
          </FixtureAppShell>
          <div id="overlay-host" />
          {open && (
            <Dialog titleText="Harness dialog" onClose={() => setOpen(false)} initialFocus="close">
              <button type="button">Inside</button>
            </Dialog>
          )}
        </OverlayStackProvider>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    await user.click(trigger)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await waitFor(() => expect(document.getElementById('app-shell')).toHaveAttribute('inert'))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(document.getElementById('app-shell')).not.toHaveAttribute('inert')
  })

  it('falls back to #main if the trigger unmounted while the dialog was open', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      const [triggerGone, setTriggerGone] = useState(false)
      return (
        <OverlayStackProvider>
          <div id="app-shell">
            <main id="main" tabIndex={-1}>
              {!triggerGone && (
                <button type="button" onClick={() => setOpen(true)}>
                  Open
                </button>
              )}
            </main>
          </div>
          <div id="overlay-host" />
          {open && (
            <Dialog
              titleText="Harness dialog"
              onClose={() => setOpen(false)}
              initialFocus="close"
            >
              <button type="button" onClick={() => setTriggerGone(true)}>
                Remove trigger
              </button>
            </Dialog>
          )}
        </OverlayStackProvider>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Remove trigger' }))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })
})
