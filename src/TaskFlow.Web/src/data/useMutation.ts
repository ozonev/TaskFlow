import { useCallback, useRef, useState } from 'react'

import { useQueryCache } from './QueryCacheProvider'

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }

export interface MutationOptions<A, T> {
  mutate: (args: A) => Promise<T>
  /** Key prefixes to stale on success — §7 line 145's "list refetches on 201". */
  invalidates?: readonly (readonly unknown[])[]
}

export interface Mutation<A, T> {
  run: (args: A) => Promise<MutationResult<T>>
  isPending: boolean
  error: unknown
  reset: () => void
}

/**
 * `run` RESOLVES a discriminated result rather than throwing.
 *
 * A 400 from a form submission is an expected outcome, not an exception — modelling
 * it as one forces every call site into try/catch and produces unhandled-rejection
 * noise in tests. Callers branch on `ok` instead.
 */
export function useMutation<A, T>({ mutate, invalidates = [] }: MutationOptions<A, T>): Mutation<A, T> {
  const cache = useQueryCache()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(undefined)

  /* Read through refs rather than closed over. Both are rebuilt every render at
     most call sites, so depending on them by identity would give `run` a new
     identity every render; capturing them once instead would make `run` call a
     stale `mutate` that closes over last render's props. Refs give a stable `run`
     that always calls the current one. */
  const mutateRef = useRef(mutate)
  mutateRef.current = mutate
  const invalidatesRef = useRef(invalidates)
  invalidatesRef.current = invalidates

  const run = useCallback(
    async (args: A): Promise<MutationResult<T>> => {
      setIsPending(true)
      setError(undefined)
      try {
        const value = await mutateRef.current(args)
        for (const prefix of invalidatesRef.current) {
          cache.invalidate(prefix)
        }
        return { ok: true, value }
      } catch (caught) {
        setError(caught)
        return { ok: false, error: caught }
      } finally {
        setIsPending(false)
      }
    },
    [cache],
  )

  const reset = useCallback(() => setError(undefined), [])

  return { run, isPending, error, reset }
}
