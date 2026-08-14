import { useCallback, useEffect, useRef, useState } from 'react'

import { useOverlayStack } from '../a11y/OverlayStack'
import { LOADING_DELAY_MS } from '../lib/constants'
import { keyHasPrefix, stableKey } from '../lib/stableKey'
import { useQueryCache } from './QueryCacheProvider'
import { useDelayedFlag } from './useDelayedFlag'

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error'

export interface QueryResult<T> {
  data: T | undefined
  error: unknown
  status: QueryStatus
  /** True during any fetch, including a background refetch over existing data. */
  isFetching: boolean
  /** True only once a fetch has been running for LOADING_DELAY_MS (§7 line 150). */
  showLoading: boolean
  refetch: () => void
}

export interface QueryOptions<T> {
  key: readonly unknown[]
  fetch: (context: { signal: AbortSignal }) => Promise<T>
  enabled?: boolean
  /** §7 line 143 — paging keeps the previous rows visible under the skeleton. */
  keepPreviousData?: boolean
  /** How long cached data counts as fresh for the window-focus refetch. */
  staleAfterMs?: number
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function useQuery<T>({
  key,
  fetch,
  enabled = true,
  keepPreviousData = false,
  staleAfterMs = 10_000,
}: QueryOptions<T>): QueryResult<T> {
  const cache = useQueryCache()
  const overlays = useOverlayStack()
  const hash = stableKey(key)

  const [state, setState] = useState<{ data: T | undefined; error: unknown; status: QueryStatus }>(
    () => {
      const cached = cache.get<T>(key)
      return cached
        ? { data: cached.data, error: undefined, status: 'success' }
        : { data: undefined, error: undefined, status: enabled ? 'loading' : 'idle' }
    },
  )
  const [isFetching, setIsFetching] = useState(false)

  /* Two independent guards, deliberately. The AbortController stops work in
     flight; runIdRef stops a resolved-but-superseded promise from committing. The
     second is what actually prevents stale results landing over fresh ones — abort
     timing is under our control against the mock, but will not be against a real
     fetch, where a response can already be in the microtask queue when we abort. */
  const runIdRef = useRef(0)
  const fetchRef = useRef(fetch)
  fetchRef.current = fetch

  const run = useCallback(() => {
    if (!enabled) {
      return () => {}
    }

    const runId = (runIdRef.current += 1)
    const controller = new AbortController()

    setIsFetching(true)
    setState((current) => ({
      data: keepPreviousData ? current.data : undefined,
      error: undefined,
      status: current.data !== undefined && keepPreviousData ? 'success' : 'loading',
    }))

    fetchRef
      .current({ signal: controller.signal })
      .then((data) => {
        if (runId !== runIdRef.current) {
          return
        }
        cache.set(key, data)
        setState({ data, error: undefined, status: 'success' })
        setIsFetching(false)
      })
      .catch((error: unknown) => {
        if (runId !== runIdRef.current || isAbort(error)) {
          return
        }
        setState({ data: undefined, error, status: 'error' })
        setIsFetching(false)
      })

    return () => controller.abort()
    // `hash` stands in for `key`: it is the stable identity of the query, whereas
    // the array itself is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, enabled, hash, keepPreviousData])

  useEffect(() => run(), [run])

  // Invalidation: refetch when a mutation stales a prefix this key sits under.
  useEffect(
    () =>
      cache.subscribe((prefix) => {
        if (keyHasPrefix(key, prefix)) {
          run()
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache, hash, run],
  )

  /* §11 line 231 — refetch on window focus, no sockets. Gated two ways: only if
     the data is actually stale, and never while an overlay is open, because
     replacing the list under an open drawer can destroy the element that focus is
     due to return to on close. */
  useEffect(() => {
    if (!enabled) {
      return
    }

    function onFocus() {
      if (overlays.count > 0) {
        return
      }
      const cached = cache.get<T>(key)
      if (!cached || Date.now() - cached.updatedAt > staleAfterMs) {
        run()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, enabled, hash, overlays.count, run, staleAfterMs])

  const showLoading = useDelayedFlag(isFetching && state.data === undefined, LOADING_DELAY_MS)

  return { ...state, isFetching, showLoading, refetch: run }
}
