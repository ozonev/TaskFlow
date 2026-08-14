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

   The real API is the default: .env.development (checked in) sets
   VITE_API_BASE_URL to the backend's own origin, and Program.cs's Development-
   only CORS policy (Cors:AllowedOrigins in appsettings.Development.json) is
   what makes that cross-origin call work. To run against the mock instead —
   e.g. offline frontend-only work — create a gitignored .env.local with
   VITE_API_BASE_URL= (empty overrides the checked-in default; falsy fails the
   check below and falls through to the mock).

   This default only applies to `vite`/`npm run dev` — Vite loads .env files
   per MODE, and `vite build`/`npm run preview` run in "production" mode, which
   never reads .env.development. There's no .env.production yet (no deployment
   target exists to point it at), so a built/previewed bundle falls back to the
   mock. That's a deliberate gap, not a bug: it's a safe, working fallback
   rather than a build that silently points at nothing. */

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
