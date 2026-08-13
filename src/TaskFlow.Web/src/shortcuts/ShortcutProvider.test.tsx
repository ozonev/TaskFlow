import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { OverlayStackProvider, useOverlayStack } from '../a11y/OverlayStack'
import { ShortcutProvider } from './ShortcutProvider'
import { useShortcut } from './useShortcut'

function Probe({ onFire }: { onFire: (key: string) => void }) {
  useShortcut('n', () => onFire('n'))
  useShortcut('/', () => onFire('/'))
  return (
    <>
      <input aria-label="Search" type="text" />
      <textarea aria-label="Notes" />
      {/* tabIndex is explicit rather than relying on contenteditable's implicit
          focusability, which jsdom does not model the way real browsers do.
          contentEditable genuinely makes this interactive; the lint rule's
          allowlist just doesn't know that pattern. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div contentEditable tabIndex={0} aria-label="Rich text" />
    </>
  )
}

function OpenOverlayToggle() {
  const overlay = useOverlayStack()
  return (
    <button type="button" onClick={() => overlay.push('test-overlay')}>
      Open overlay
    </button>
  )
}

function renderWithProvider(onFire: (key: string) => void) {
  return render(
    <OverlayStackProvider>
      <ShortcutProvider>
        <Probe onFire={onFire} />
        <OpenOverlayToggle />
      </ShortcutProvider>
    </OverlayStackProvider>,
  )
}

describe('ShortcutProvider', () => {
  it('fires the handler for a registered key', async () => {
    const user = userEvent.setup()
    const onFire = vi.fn()
    renderWithProvider(onFire)

    await user.keyboard('n')
    expect(onFire).toHaveBeenCalledWith('n')
  })

  it.each([
    ['input', 'Search'],
    ['textarea', 'Notes'],
    ['contenteditable element', 'Rich text'],
  ])('suppresses single-letter shortcuts while a %s has focus (§6 line 137)', async (_label, name) => {
    const user = userEvent.setup()
    const onFire = vi.fn()
    renderWithProvider(onFire)

    screen.getByLabelText(name).focus()
    await user.keyboard('n')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('suppresses shortcuts while any dialog is open', async () => {
    const user = userEvent.setup()
    const onFire = vi.fn()
    renderWithProvider(onFire)

    await user.click(screen.getByRole('button', { name: 'Open overlay' }))
    await user.keyboard('n')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('ignores the key when a modifier is held, leaving it for a local combo handler', async () => {
    const user = userEvent.setup()
    const onFire = vi.fn()
    renderWithProvider(onFire)

    await user.keyboard('{Control>}n{/Control}')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('a later-registered handler for the same key wins', async () => {
    const user = userEvent.setup()
    const first = vi.fn()
    const second = vi.fn()

    function TwoHandlers() {
      useShortcut('n', first)
      useShortcut('n', second)
      return null
    }

    render(
      <OverlayStackProvider>
        <ShortcutProvider>
          <TwoHandlers />
        </ShortcutProvider>
      </OverlayStackProvider>,
    )

    await user.keyboard('n')
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('un-registers on unmount, so a dismissed component stops intercepting', async () => {
    const user = userEvent.setup()
    const onFire = vi.fn()

    function Toggle() {
      const [mounted, setMounted] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setMounted(false)}>
            Unmount
          </button>
          {mounted && <Probe onFire={onFire} />}
        </>
      )
    }

    render(
      <OverlayStackProvider>
        <ShortcutProvider>
          <Toggle />
        </ShortcutProvider>
      </OverlayStackProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Unmount' }))
    await user.keyboard('n')
    expect(onFire).not.toHaveBeenCalled()
  })
})
