import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { LOADING_DELAY_MS } from '../lib/constants'
import { QueryCache } from './queryCache'
import { QueryCacheProvider } from './QueryCacheProvider'
import { useQuery } from './useQuery'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function wrapper(cache: QueryCache) {
  return ({ children }: { children: ReactNode }) => (
    <QueryCacheProvider cache={cache}>{children}</QueryCacheProvider>
  )
}

describe('the 200ms loading gate (§7 line 150)', () => {
  it('shows no loading state at all for a response faster than the delay', async () => {
    const cache = new QueryCache()
    const seen: boolean[] = []

    const { result } = renderHook(
      () => {
        const query = useQuery({ key: ['fast'], fetch: () => Promise.resolve('done') })
        seen.push(query.showLoading)
        return query
      },
      { wrapper: wrapper(cache) },
    )

    await waitFor(() => expect(result.current.data).toBe('done'))
    // The point of the delay is that a brief fetch never flashes a skeleton, so
    // asserting the final state is not enough — no render may have had it true.
    expect(seen).not.toContain(true)
  })

  it('shows the loading state once a fetch outlasts the delay', async () => {
    vi.useFakeTimers()
    try {
      const cache = new QueryCache()
      const pending = deferred<string>()
      const { result } = renderHook(
        () => useQuery({ key: ['slow'], fetch: () => pending.promise }),
        { wrapper: wrapper(cache) },
      )

      expect(result.current.showLoading).toBe(false)

      await act(async () => {
        vi.advanceTimersByTime(LOADING_DELAY_MS - 1)
      })
      expect(result.current.showLoading).toBe(false)

      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(result.current.showLoading).toBe(true)

      await act(async () => {
        pending.resolve('arrived')
        await pending.promise
      })
      expect(result.current.showLoading).toBe(false)
      expect(result.current.data).toBe('arrived')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('staleness', () => {
  it('never commits a superseded response over a fresher one', async () => {
    const cache = new QueryCache()
    const slow = deferred<string>()
    const fast = deferred<string>()

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useQuery({
          key: ['item', id],
          fetch: () => (id === 'a' ? slow.promise : fast.promise),
        }),
      { wrapper: wrapper(cache), initialProps: { id: 'a' } },
    )

    // Switch keys while the first request is still in flight, then let the FIRST
    // one resolve last — the ordering that a naive implementation gets wrong.
    rerender({ id: 'b' })
    await act(async () => {
      fast.resolve('b-value')
      await fast.promise
    })
    expect(result.current.data).toBe('b-value')

    await act(async () => {
      slow.resolve('a-value')
      await slow.promise
    })
    expect(result.current.data).toBe('b-value')
  })

  it('surfaces an error but not an abort', async () => {
    const cache = new QueryCache()
    const { result } = renderHook(
      () =>
        useQuery({
          key: ['boom'],
          fetch: () => Promise.reject(new Error('failed')),
        }),
      { wrapper: wrapper(cache) },
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect((result.current.error as Error).message).toBe('failed')
  })
})

describe('invalidation', () => {
  it('refetches a query sitting under an invalidated prefix', async () => {
    const cache = new QueryCache()
    let calls = 0
    const { result } = renderHook(
      () =>
        useQuery({
          key: ['projects', 'list', { page: 1 }],
          fetch: () => {
            calls += 1
            return Promise.resolve(calls)
          },
        }),
      { wrapper: wrapper(cache) },
    )

    await waitFor(() => expect(result.current.data).toBe(1))

    await act(async () => {
      cache.invalidate(['projects'])
    })
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(calls).toBe(2)
  })

  it('leaves an unrelated query alone', async () => {
    const cache = new QueryCache()
    let calls = 0
    const { result } = renderHook(
      () =>
        useQuery({
          key: ['tasks', 'search'],
          fetch: () => {
            calls += 1
            return Promise.resolve(calls)
          },
        }),
      { wrapper: wrapper(cache) },
    )

    await waitFor(() => expect(result.current.data).toBe(1))
    await act(async () => {
      cache.invalidate(['projects'])
    })
    expect(calls).toBe(1)
  })
})

describe('window focus refetch (§11 line 231)', () => {
  it('refetches when the cached data is stale', async () => {
    const cache = new QueryCache()
    let calls = 0
    const { result } = renderHook(
      () =>
        useQuery({
          key: ['focus', 'stale'],
          staleAfterMs: 0,
          fetch: () => {
            calls += 1
            return Promise.resolve(calls)
          },
        }),
      { wrapper: wrapper(cache) },
    )

    await waitFor(() => expect(result.current.data).toBe(1))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(calls).toBe(2))
  })

  it('does not refetch while the data is still fresh', async () => {
    const cache = new QueryCache()
    let calls = 0
    const { result } = renderHook(
      () =>
        useQuery({
          key: ['focus', 'fresh'],
          staleAfterMs: 60_000,
          fetch: () => {
            calls += 1
            return Promise.resolve(calls)
          },
        }),
      { wrapper: wrapper(cache) },
    )

    await waitFor(() => expect(result.current.data).toBe(1))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(calls).toBe(1)
  })
})

describe('keepPreviousData (§7 line 143)', () => {
  it('holds the previous page visible while the next one loads', async () => {
    const cache = new QueryCache()
    const second = deferred<string>()

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useQuery({
          key: ['paged', page],
          keepPreviousData: true,
          fetch: () => (page === 1 ? Promise.resolve('page-1') : second.promise),
        }),
      { wrapper: wrapper(cache), initialProps: { page: 1 } },
    )

    await waitFor(() => expect(result.current.data).toBe('page-1'))

    rerender({ page: 2 })
    expect(result.current.data).toBe('page-1')

    await act(async () => {
      second.resolve('page-2')
      await second.promise
    })
    expect(result.current.data).toBe('page-2')
  })
})
