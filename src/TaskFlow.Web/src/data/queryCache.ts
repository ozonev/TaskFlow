import { keyHasPrefix, stableKey } from '../lib/stableKey'

/* Cache and invalidation bus for useQuery.

   Held in a class provided through context rather than at module scope, so each
   test render gets a clean instance — a module-level Map leaks state between
   tests, and the resulting failures look like race conditions.

   Memory-only and cleared on reload, which is consistent with the mock store it
   sits in front of: nothing here implies durability. */

interface CacheEntry<T = unknown> {
  data: T
  updatedAt: number
}

export class QueryCache {
  private entries = new Map<string, CacheEntry>()
  private listeners = new Set<(prefix: readonly unknown[]) => void>()

  get<T>(key: readonly unknown[]): CacheEntry<T> | undefined {
    return this.entries.get(stableKey(key)) as CacheEntry<T> | undefined
  }

  set(key: readonly unknown[], data: unknown): void {
    this.entries.set(stableKey(key), { data, updatedAt: Date.now() })
  }

  subscribe(listener: (prefix: readonly unknown[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Drops every cached entry whose key starts with `prefix`, then notifies mounted
   * queries so the matching ones refetch. Prefix-based so a mutation can stale a
   * whole family — `invalidate(['tasks'])` covers every filter combination —
   * without needing to know which filters are on screen.
   *
   * Listeners receive the prefix, not the affected hashes, so a mounted query
   * whose data was never cached still learns that it should refetch.
   */
  invalidate(prefix: readonly unknown[]): void {
    for (const hash of [...this.entries.keys()]) {
      if (keyHasPrefix(JSON.parse(hash) as unknown[], prefix)) {
        this.entries.delete(hash)
      }
    }
    for (const listener of this.listeners) {
      listener(prefix)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
