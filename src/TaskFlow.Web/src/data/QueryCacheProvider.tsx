import { createContext, useContext, useState, type ReactNode } from 'react'

import { QueryCache } from './queryCache'

const QueryCacheContext = createContext<QueryCache | null>(null)

export function QueryCacheProvider({
  cache,
  children,
}: {
  cache?: QueryCache | undefined
  children: ReactNode
}) {
  // Lazily created per provider instance, so each test render starts clean.
  const [fallback] = useState(() => new QueryCache())
  return (
    <QueryCacheContext.Provider value={cache ?? fallback}>{children}</QueryCacheContext.Provider>
  )
}

export function useQueryCache(): QueryCache {
  const cache = useContext(QueryCacheContext)
  if (!cache) {
    throw new Error('useQueryCache must be used inside a QueryCacheProvider')
  }
  return cache
}
