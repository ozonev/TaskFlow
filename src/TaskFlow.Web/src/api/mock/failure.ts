import { ApiError, ValidationError } from '../problem'
import { problemTraceId } from './validate'

/* Latency and failure injection — the thing that makes "mock success and failure
   states are easy to trigger" true rather than aspirational.

   One observable config object, reachable three ways:
   - constructor, for tests (zero latency, no failures);
   - the URL, so a broken state is a shareable link you can paste into a review;
   - the dev panel, which mutates this same object live, so "the next comment POST
     fails" takes effect on the very next click with no reload.

   Read on every call rather than captured at construction, which is what makes
   the live-toggle work. */

export type MockEndpoint =
  | 'listProjects'
  | 'createProject'
  | 'getProject'
  | 'searchTasks'
  | 'createTask'
  | 'listComments'
  | 'createComment'
  | 'listTaskAudit'

export type FailureMode = '400' | '404' | '500' | 'network'

export interface Failure {
  endpoint: MockEndpoint | '*'
  mode: FailureMode
  /** Fail once then clear — for demonstrating a retry that succeeds. */
  once?: boolean
}

export interface MockConfig {
  seed: 'default' | 'empty' | 'large'
  latency: { min: number; max: number }
  failures: Failure[]
}

export const DEFAULT_MOCK_CONFIG: MockConfig = {
  seed: 'default',
  /* Deliberately above the 200ms loading gate, so §7 line 150's suppression is
     observable in both directions: at this latency a skeleton appears, and
     ?mockLatency=0 proves a fast response shows none. */
  latency: { min: 250, max: 600 },
  failures: [],
}

export class MockController {
  private listeners = new Set<() => void>()

  constructor(public config: MockConfig = structuredClone(DEFAULT_MOCK_CONFIG)) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  /* Every mutation replaces `config` with a new object rather than editing it in
     place, so reference equality is a valid change signal. That is what lets the
     dev panel drive itself off useSyncExternalStore without a version counter. */
  update(patch: Partial<MockConfig>): void {
    this.config = { ...this.config, ...patch }
    this.emit()
  }

  setFailure(endpoint: MockEndpoint | '*', mode: FailureMode | null, once = false): void {
    const remaining = this.config.failures.filter((f) => f.endpoint !== endpoint)
    this.update({ failures: mode ? [...remaining, { endpoint, mode, once }] : remaining })
  }

  clearFailures(): void {
    this.update({ failures: [] })
  }

  /** Consumes a matching failure and returns it, honouring `once`. */
  takeFailure(endpoint: MockEndpoint): Failure | undefined {
    const match = this.config.failures.find((f) => f.endpoint === endpoint || f.endpoint === '*')
    if (match?.once) {
      this.update({ failures: this.config.failures.filter((f) => f !== match) })
    }
    return match
  }
}

class AbortError extends Error {
  constructor() {
    super('The operation was aborted.')
    this.name = 'AbortError'
  }
}

/**
 * Waits out the configured latency, rejecting with an AbortError if cancelled.
 * Callers await this BEFORE mutating the store, so an aborted write is a true
 * no-op rather than a half-applied one.
 */
export function delay(config: MockConfig, signal?: AbortSignal): Promise<void> {
  const { min, max } = config.latency
  const span = Math.max(0, max - min)
  // Deterministic mid-point rather than random: a mock whose timing varies makes
  // loading-state tests flaky for no benefit.
  const duration = min + span / 2

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError())
      return
    }
    if (duration === 0) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, duration)

    function onAbort() {
      clearTimeout(timer)
      reject(new AbortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function throwInjectedFailure(failure: Failure): never {
  switch (failure.mode) {
    case 'network':
      // What fetch() rejects with when it cannot reach the server: a TypeError,
      // not an ApiError. Handling code must cope with both.
      throw new TypeError('Failed to fetch')
    case '400':
      throw new ValidationError({
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { '': ['Injected failure from the mock controls.'] },
        traceId: problemTraceId(),
      })
    case '404':
      throw new ApiError(404, {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
        title: 'Not Found',
        status: 404,
        traceId: problemTraceId(),
      })
    case '500':
      throw new ApiError(500, {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.6.1',
        title: 'An error occurred while processing your request.',
        status: 500,
        traceId: problemTraceId(),
      })
  }
}
