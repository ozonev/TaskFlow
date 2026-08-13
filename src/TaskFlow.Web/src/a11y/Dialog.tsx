import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { getTabbables } from './focusUtils'
import { useOverlayStack } from './OverlayStack'
import styles from './Dialog.module.css'

export type DialogInitialFocus = 'firstField' | 'close'

/**
 * The shared shell behind every dialog and the task drawer (§4 "FormDialog").
 *
 * Contract, per §8 line 155: role="dialog", aria-modal="true", a labelled title,
 * focus moved on open, Tab/Shift+Tab cycling contained within, focus returned to
 * the trigger on close.
 *
 * Where the initial focus target lands is a real conflict in the brief: §8 line
 * 155 says the close button, for "the drawer and every dialog"; §10's Dialog row
 * says "first field focused". Resolved as: the drawer (no field to focus) takes
 * the close button; a form dialog takes its first field, via `initialFocus` —
 * marked with the `data-autofocus` attribute so this component doesn't guess
 * position, which would break the moment a dialog's first DOM element isn't its
 * first meaningful field.
 *
 * Hand-rolled rather than native `<dialog>`: `showModal()`'s own Esc handling
 * would have to be fought to keep focus-return under our control, and jsdom's
 * `<dialog>` support is inconsistent enough to make the keyboard-journey test
 * this build stands or falls on unreliable.
 */
export type DialogVariant = 'dialog' | 'drawer'

export function Dialog({
  titleText,
  onClose,
  initialFocus,
  variant = 'dialog',
  children,
}: {
  titleText: string
  onClose: () => void
  initialFocus: DialogInitialFocus
  variant?: DialogVariant
  children: ReactNode
}) {
  const id = useId()
  const overlay = useOverlayStack()
  const containerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const hasAutoFocusedRef = useRef(false)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    overlay.push(id)
    return () => overlay.remove(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /* #overlay-host is a sibling rendered by RootLayout in the same render pass as
     this component's route — it does not exist in the real DOM yet during THIS
     render, only after commit. Resolving it in an effect (rather than at render
     time) is what makes the portal target reliably non-null. */
  useEffect(() => {
    setPortalHost(document.getElementById('overlay-host'))
  }, [])

  const isTopmost = overlay.topId === id

  /* Capture the trigger and restore focus to it ONLY on true unmount — not on
     merely losing topmost status, which happens when a second dialog opens over
     this one (e.g. a shortcuts dialog over the task drawer) and must not steal
     focus back prematurely.

     The restore itself is deferred a tick. overlay.remove(id) — called from the
     OTHER effect's cleanup on the same unmount — updates OverlayStackProvider's
     state, which is what tells RootLayout to lift `inert` off #app-shell; that
     update lands in a LATER commit than this cleanup, so calling .focus() here
     synchronously would target an element that is, for one more render, still
     inert. setTimeout lets that commit land first. */
  useEffect(() => {
    triggerRef.current = document.activeElement
    return () => {
      const trigger = triggerRef.current
      setTimeout(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected) {
          trigger.focus()
        } else {
          // The trigger can have unmounted between open and close — e.g. a row a
          // background refetch removed. Falling back to <main> (never body)
          // keeps focus inside the document rather than losing it to the root.
          document.getElementById('main')?.focus()
        }
      }, 0)
    }
  }, [])

  // Runs once, the first time this dialog is both mounted and topmost.
  useEffect(() => {
    if (!isTopmost || !portalHost || hasAutoFocusedRef.current) {
      return
    }
    hasAutoFocusedRef.current = true

    const target =
      initialFocus === 'close'
        ? closeButtonRef.current
        : (containerRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
          getTabbables(containerRef.current)[0])
    target?.focus()
  }, [isTopmost, portalHost, initialFocus])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isTopmost) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') {
      return
    }

    const tabbables = getTabbables(containerRef.current)
    if (tabbables.length === 0) {
      event.preventDefault()
      return
    }
    const first = tabbables[0]
    const last = tabbables[tabbables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  if (!portalHost) {
    return null
  }

  return createPortal(
    // Click-outside-to-dismiss on a non-interactive backdrop is not itself a
    // keyboard interaction — Escape (handled by the panel's own onKeyDown below)
    // is the keyboard path to the same outcome, so no tabbable role belongs here.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={`${styles.backdrop} ${variant === 'drawer' ? styles.drawerBackdrop : ''}`}
      // A lower dialog in a stack (e.g. the shortcuts dialog opening over the
      // task drawer) stays mounted but must not be reachable or announced while
      // it isn't the one in front — inert, same as the app shell.
      inert={isTopmost ? undefined : true}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      {/* This IS the focus trap (Tab cycling, Escape-to-close) that §8 line 155
          requires — role="dialog" makes the element interactive by definition,
          which the rule doesn't recognize as satisfying its own check. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`${styles.panel} ${variant === 'drawer' ? styles.drawerPanel : ''}`}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <h2 id={id} className={`${styles.title} type-section-title`}>
            {titleText}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={styles.close}
            aria-label="Close"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>,
    portalHost,
  )
}
