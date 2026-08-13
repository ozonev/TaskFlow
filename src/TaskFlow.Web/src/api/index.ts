import { createMockClient, type MockClient } from './mock/createMockClient'
import {
  DEFAULT_MOCK_CONFIG,
  MockController,
  type Failure,
  type FailureMode,
  type MockConfig,
  type MockEndpoint,
} from './mock/failure'

/* THE SWAP POINT.

   This module is the only place that decides which TaskFlowClient the app runs
   against. Everything else depends on the interface in client.ts. To move onto
   the real API, add an httpClient.ts implementing TaskFlowClient and change the
   one expression at the bottom of this file.

   Two things must be dealt with before that switch works:
     - src/TaskFlow.Api/Program.cs configures no CORS policy, so a browser call
       from a dev server on another origin is blocked. Either add a policy or
       proxy /api through Vite.
     - GET /api/tasks/{id} does not exist. features/tasks/useTaskById.ts carries
       the temporary fallback and the note about removing it. */

const VALID_MODES: FailureMode[] = ['400', '404', '500', 'network']

const VALID_ENDPOINTS: (MockEndpoint | '*')[] = [
  '*',
  'listProjects',
  'createProject',
  'getProject',
  'searchTasks',
  'createTask',
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

export function createAppClient(search = window.location.search): MockClient {
  return createMockClient({ controller: new MockController(parseMockConfig(search)) })
}
