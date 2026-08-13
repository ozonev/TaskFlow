import { createContext, useContext, type ReactNode } from 'react'

import type { TaskFlowClient } from './client'
import type { MockController } from './mock/failure'

/* Components reach the API only through this context, typed as the TaskFlowClient
   interface — never as the mock's concrete type. That is what keeps "components do
   not import hard-coded fixtures" true structurally rather than by convention. */

/* The optional members spell `| undefined` explicitly because
   exactOptionalPropertyTypes is on: these props are forwarded down from a parent
   that may itself have received undefined, which `?:` alone would reject. */
interface ClientContextValue {
  client: TaskFlowClient
  /** Present only while the app runs on the mock; the dev panel is its only consumer. */
  mockController?: MockController | undefined
  resetMockData?: (() => void) | undefined
}

const ClientContext = createContext<ClientContextValue | null>(null)

export function ClientProvider({
  client,
  mockController,
  resetMockData,
  children,
}: ClientContextValue & { children: ReactNode }) {
  return (
    <ClientContext.Provider value={{ client, mockController, resetMockData }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useTaskFlowClient(): TaskFlowClient {
  const context = useContext(ClientContext)
  if (!context) {
    throw new Error('useTaskFlowClient must be used inside a ClientProvider')
  }
  return context.client
}

export function useMockControls(): Pick<ClientContextValue, 'mockController' | 'resetMockData'> {
  const context = useContext(ClientContext)
  return { mockController: context?.mockController, resetMockData: context?.resetMockData }
}
