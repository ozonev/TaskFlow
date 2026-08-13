import { useEffect, useRef } from 'react'

import { useShortcutContext } from './ShortcutProvider'

/**
 * Registers `handler` for `event.key === key` while the calling component is
 * mounted (and `enabled` is true). The handler is read through a ref so callers
 * can pass a fresh closure every render without re-registering on every keystroke.
 */
export function useShortcut(key: string, handler: (event: KeyboardEvent) => void, enabled = true): void {
  const { register } = useShortcutContext()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) {
      return
    }
    return register(key, (event) => handlerRef.current(event))
  }, [register, key, enabled])
}
