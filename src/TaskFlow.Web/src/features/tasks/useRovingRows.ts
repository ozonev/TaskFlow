import { useEffect, useState } from 'react'

export interface RovingRows {
  activeId: string | null
  moveNext: () => void
  movePrevious: () => void
}

/**
 * Roving tabindex over `ids` (§6 lines 130-131: `j`/`k` move focus between rows,
 * crossing group boundaries; `Enter` on the focused row opens it). `ids` is
 * already the flattened, collapse-aware order from grouping.ts, so this hook
 * doesn't need to know anything about groups.
 *
 * Clamps rather than wraps at the ends — wrapping in a paginated list is
 * disorienting (landing back at the top gives no signal you've hit the end of
 * THIS page rather than looped within it). Not stated by the brief; a deliberate
 * choice, recorded here rather than left implicit.
 */
export function useRovingRows(ids: readonly string[]): RovingRows {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null)

  // Re-anchor to the first row when the visible set changes (filter/page/collapse)
  // and the previously active row is no longer in it. Bookkeeping only — this
  // does NOT move focus, so a background data refresh can never steal it.
  useEffect(() => {
    if (activeId !== null && !ids.includes(activeId)) {
      setActiveId(ids[0] ?? null)
    }
  }, [ids, activeId])

  function moveTo(id: string | undefined) {
    if (!id) {
      return
    }
    setActiveId(id)
    // Roving tabindex only changes an attribute value, not which elements exist,
    // so the target is already in the DOM — .focus() works even before React
    // re-renders tabIndex from -1 to 0; browsers allow programmatic focus
    // regardless of an element's current tabIndex.
    document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus()
  }

  function moveNext() {
    if (activeId === null) {
      moveTo(ids[0])
      return
    }
    const index = ids.indexOf(activeId)
    moveTo(ids[Math.min(index + 1, ids.length - 1)])
  }

  function movePrevious() {
    if (activeId === null) {
      moveTo(ids[0])
      return
    }
    const index = ids.indexOf(activeId)
    moveTo(ids[Math.max(index - 1, 0)])
  }

  return { activeId, moveNext, movePrevious }
}
