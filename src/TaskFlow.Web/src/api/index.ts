import type { TaskFlowClient } from './client'
import { createHttpClient } from './httpClient'
import { createMockClient, type MockClient } from './mock/createMockClient'
import {
  DEFAULT_MOCK_CONFIG,
  MockController,
  type Failure,
  type FailureMode,
  type MockConfig,
  type MockEndpoint,
} from './mock/failure'

/** What main.tsx renders against — the mock's extra members are optional so a real client fits too. */
export type AppClient = TaskFlowClient & Partial<Pick<MockClient, 'controller' | 'resetData'>>

/* THE SWAP POINT.

   This module is the only place that decides which TaskFlowClient the app runs
   against. Everything else depends on the interface in client.ts.

   The mock stays the default so the prototype keeps working with zero setup.
   Set VITE_API_BASE_URL (e.g. in a gitignored .env.local) to run against the
   real backend instead — vite.config.ts proxies /api to the backend in dev, so
   no CORS policy in Program.cs is needed for that path. */

const VALID_MODES: FailureMode[] = ['400', '404', '500', 'network']

const VALID_ENDPOINTS: (MockEndpoint | '*')[] = [
  '*',
  'listProjects',
  'createProject',
  'getProject',
  'listProjectTasks',
  'searchTasks',
  'createTask',
  'getTask',
  'listComments',
  'createComment',
  'listTaskAudit',
]

/**
 * Reads mock switches out of the query string, so a broken state is a shareable
 * link rather than a code edit:
 *
 *   ?mockSeed=empty
 *   ?mockLatency=0
 *   ?mockFail=searchTasks:500,createComment:400:once
 *
 * Unrecognised values are ignored rather than thrown — a malformed demo link
 * should still render the app.
 */
export function parseMockConfig(search: string): MockConfig {
  const params = new URLSearchParams(search)
  const config: MockConfig = structuredClone(DEFAULT_MOCK_CONFIG)

  const seed = params.get('mockSeed')
  if (seed === 'empty' || seed === 'large' || seed === 'default') {
    config.seed = seed
  }

  const latency = params.get('mockLatency')
  if (latency !== null) {
    const parsed = Number(latency)
    if (Number.isFinite(parsed) && parsed >= 0) {
      config.latency = { min: parsed, max: parsed }
    }
  }

  const fail = params.get('mockFail')
  if (fail !== null) {
    config.failures = fail
      .split(',')
      .map((entry): Failure | null => {
        const [endpoint, mode, once] = entry.split(':')
        if (
          !endpoint ||
          !mode ||
          !VALID_ENDPOINTS.includes(endpoint as MockEndpoint | '*') ||
          !VALID_MODES.includes(mode as FailureMode)
        ) {
          return null
        }
        return {
          endpoint: endpoint as MockEndpoint | '*',
          mode: mode as FailureMode,
          once: once === 'once',
        }
      })
      .filter((entry): entry is Failure => entry !== null)
  }

  return config
}

export function createAppClient(search = window.location.search): AppClient {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  if (baseUrl) {
    return createHttpClient({ baseUrl })
  }
  return createMockClient({ controller: new MockController(parseMockConfig(search)) })
}
