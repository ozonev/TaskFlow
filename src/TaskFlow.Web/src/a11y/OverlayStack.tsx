import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

/* An ordered stack of open overlays, not a boolean.

   A stack because three separate things read it and each needs a different fact:
     - only the TOPMOST overlay traps focus; lower ones are inert too;
     - the shortcut provider suppresses single-letter keys while count > 0;
     - useQuery skips its window-focus refetch while count > 0, because refetching
       the list under an open drawer can replace the DOM node that focus is due to
       return to.

   The shortcuts dialog is app state rather than a route, so it can legitimately
   open over the task drawer — depth 2. A boolean would collapse that. */

interface OverlayStackValue {
  ids: string[]
  count: number
  topId: string | null
  push(id: string): void
  remove(id: string): void
}

const OverlayStackContext = createContext<OverlayStackValue | null>(null)

export function OverlayStackProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([])

  const push = useCallback((id: string) => {
    setIds((current) => (current.includes(id) ? current : [...current, id]))
  }, [])

  const remove = useCallback((id: string) => {
    setIds((current) => current.filter((existing) => existing !== id))
  }, [])

  const value = useMemo<OverlayStackValue>(
    () => ({ ids, count: ids.length, topId: ids.at(-1) ?? null, push, remove }),
    [ids, push, remove],
  )

  return <OverlayStackContext.Provider value={value}>{children}</OverlayStackContext.Provider>
}

/**
 * Safe to call outside a provider: returns an empty stack. useQuery depends on
 * this so a hook can be unit-tested without mounting the whole app shell.
 */
export function useOverlayStack(): OverlayStackValue {
  const context = useContext(OverlayStackContext)
  const fallbackRef = useRef<OverlayStackValue>({
    ids: [],
    count: 0,
    topId: null,
    push: () => {},
    remove: () => {},
  })
  return context ?? fallbackRef.current
}
