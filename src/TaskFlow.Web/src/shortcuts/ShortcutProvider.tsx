import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'

import { useOverlayStack } from '../a11y/OverlayStack'
import { isTypingTarget } from './isTypingTarget'

type Handler = (event: KeyboardEvent) => void

interface ShortcutContextValue {
  register: (key: string, handler: Handler) => () => void
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null)

/**
 * One document-level keydown listener (§6 lines 127-135), not one per component —
 * that's what keeps the three guards in exactly one place rather than duplicated
 * (and inevitably drifting) at every call site:
 *
 *   1. a modifier is held → only combo shortcuts are eligible, and those (only
 *      Ctrl/Cmd+Enter, §6 line 135) bind locally where they're used, not here;
 *   2. any dialog is open (§6 line 134 "Tab cycles within it only") → single-key
 *      shortcuts must not reach through an open overlay;
 *   3. focus is in a text input (§6 line 137) → same reason.
 *
 * Last-registered handler for a key wins, so a component mounted later (e.g. a
 * dialog that binds its own use of a key) naturally takes priority without needing
 * to know about what registered earlier.
 */
export function ShortcutProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef(new Map<string, Handler[]>())
  const overlay = useOverlayStack()

  const register = useCallback((key: string, handler: Handler) => {
    const existing = handlersRef.current.get(key) ?? []
    handlersRef.current.set(key, [...existing, handler])
    return () => {
      const current = handlersRef.current.get(key) ?? []
      handlersRef.current.set(
        key,
        current.filter((registered) => registered !== handler),
      )
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      if (overlay.count > 0 || isTypingTarget(event.target)) {
        return
      }
      const handlers = handlersRef.current.get(event.key)
      const handler = handlers?.at(-1)
      handler?.(event)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay.count])

  return <ShortcutContext.Provider value={{ register }}>{children}</ShortcutContext.Provider>
}

export function useShortcutContext(): ShortcutContextValue {
  const context = useContext(ShortcutContext)
  if (!context) {
    throw new Error('useShortcut must be used inside a ShortcutProvider')
  }
  return context
}
