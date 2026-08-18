import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { SEARCH_DEBOUNCE_MS } from '../../lib/constants'

export interface TaskFiltersState {
  /** The committed value — what the search actually runs against. */
  q: string
  /** What the search input displays; can lag `q` during the debounce window. */
  searchDraft: string
  status: 'Todo' | ''
  dueFrom: string
  dueTo: string
  /** Single label id, or '' for "any label" — the filter is single-select. */
  labelId: string
  page: number
  hasActiveFilters: boolean
}

export interface TaskFiltersApi extends TaskFiltersState {
  onSearchChange: (value: string) => void
  /** Commits the current draft immediately, bypassing the debounce (Enter, blur). */
  flushSearch: () => void
  setStatus: (value: 'Todo' | '') => void
  setDueFrom: (value: string) => void
  setDueTo: (value: string) => void
  setLabelId: (value: string) => void
  setPage: (page: number) => void
  clearAll: () => void
}

/**
 * The query string is the source of truth for every filter (§2, §6, §7) — this
 * hook is the only thing that writes to it, so those rules live in one place.
 */
export function useTaskFilters(): TaskFiltersApi {
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = (searchParams.get('status') as 'Todo' | '' | null) ?? ''
  const dueFrom = searchParams.get('dueFrom') ?? ''
  const dueTo = searchParams.get('dueTo') ?? ''
  const labelId = searchParams.get('label') ?? ''
  const rawPage = Number(searchParams.get('page'))
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1
  const hasActiveFilters = q !== '' || status !== '' || dueFrom !== '' || dueTo !== '' || labelId !== ''

  /* §6 line 116 — search debounces 300ms and REPLACES history while typing (so
     back doesn't step through keystrokes); §6 line 117 — every other filter
     PUSHES immediately (so back removes it). Both funnel through applyPatch's
     functional updater, so two filters changing in the same tick can't clobber
     each other by both reading a stale snapshot. */
  const applyPatch = useCallback(
    (patch: Record<string, string | null>, options: { replace?: boolean; resetPage?: boolean } = {}) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') {
              next.delete(key)
            } else {
              next.set(key, value)
            }
          }
          // A filter change makes the old page number meaningless — landing on
          // "page 4" of a now-1-page result would look like a false empty state.
          if (options.resetPage ?? true) {
            next.delete('page')
          }
          return next
        },
        { replace: options.replace ?? false },
      )
    },
    [setSearchParams],
  )

  /* The search box's own draft state, kept separate from `q` so debouncing the
     write doesn't make every keystroke feel laggy. `lastWrittenRef` is what
     resolves the one real desync risk here: back/forward can change `?q=`
     without this input's own typing having done it, and the sync effect below
     must tell those two cases apart. */
  const [searchDraft, setSearchDraft] = useState(q)
  const lastWrittenRef = useRef(q)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (q !== lastWrittenRef.current) {
      // The URL changed from something other than our own debounced write (back/
      // forward, or a clear-filters action) — resync the visible draft to match.
      lastWrittenRef.current = q
      setSearchDraft(q)
    }
  }, [q])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchDraft(value)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        lastWrittenRef.current = value
        applyPatch({ q: value }, { replace: true })
      }, SEARCH_DEBOUNCE_MS)
    },
    [applyPatch],
  )

  const flushSearch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    lastWrittenRef.current = searchDraft
    applyPatch({ q: searchDraft }, { replace: true })
  }, [applyPatch, searchDraft])

  const setStatus = useCallback((value: 'Todo' | '') => applyPatch({ status: value }), [applyPatch])
  const setDueFrom = useCallback((value: string) => applyPatch({ dueFrom: value }), [applyPatch])
  const setDueTo = useCallback((value: string) => applyPatch({ dueTo: value }), [applyPatch])
  const setLabelId = useCallback((value: string) => applyPatch({ label: value }), [applyPatch])

  const setPage = useCallback(
    (nextPage: number) => {
      applyPatch({ page: nextPage <= 1 ? null : String(nextPage) }, { resetPage: false })
    },
    [applyPatch],
  )

  const clearAll = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    lastWrittenRef.current = ''
    setSearchDraft('')
    applyPatch({ q: null, status: null, dueFrom: null, dueTo: null, label: null })
  }, [applyPatch])

  return {
    q,
    searchDraft,
    status,
    dueFrom,
    dueTo,
    labelId,
    page,
    hasActiveFilters,
    onSearchChange,
    flushSearch,
    setStatus,
    setDueFrom,
    setDueTo,
    setLabelId,
    setPage,
    clearAll,
  }
}
