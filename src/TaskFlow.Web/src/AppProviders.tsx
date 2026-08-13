import type { ReactNode } from 'react'

import { OverlayStackProvider } from './a11y/OverlayStack'
import { ClientProvider } from './api/ClientProvider'
import type { TaskFlowClient } from './api/client'
import type { MockController } from './api/mock/failure'
import { QueryCacheProvider } from './data/QueryCacheProvider'
import type { QueryCache } from './data/queryCache'
import { ShortcutProvider } from './shortcuts/ShortcutProvider'

/* One provider stack, shared by main.tsx and the test harness, so tests exercise
   the same context tree the app runs in rather than an approximation of it.

   Order matters only in that ClientProvider and QueryCacheProvider are siblings —
   neither depends on the other — while OverlayStackProvider must be outside
   anything that reads the overlay count (useQuery's focus-refetch gate).

   ToastProvider is deliberately NOT here: it renders a `<Link>` (§6 line 120's
   link to the new task), which needs Router context. This stack wraps
   `<RouterProvider>` from the OUTSIDE, so anything rendered here is siblings to
   the router, not inside it — a `<Link>` here would crash with "Cannot
   destructure property 'basename' of React.useContext(...) as it is null".
   ToastProvider lives in RootLayout instead, which the router renders FOR us. */
export function AppProviders({
  client,
  mockController,
  resetMockData,
  cache,
  children,
}: {
  client: TaskFlowClient
  mockController?: MockController | undefined
  resetMockData?: (() => void) | undefined
  cache?: QueryCache | undefined
  children: ReactNode
}) {
  return (
    <OverlayStackProvider>
      <ShortcutProvider>
        <QueryCacheProvider cache={cache}>
          <ClientProvider
            client={client}
            mockController={mockController}
            resetMockData={resetMockData}
          >
            {children}
          </ClientProvider>
        </QueryCacheProvider>
      </ShortcutProvider>
    </OverlayStackProvider>
  )
}
