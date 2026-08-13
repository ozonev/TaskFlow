import { useCallback, useSyncExternalStore } from 'react'

import { useMockControls } from '../api/ClientProvider'
import type { FailureMode, MockController, MockEndpoint } from '../api/mock/failure'
import styles from './DevPanel.module.css'

/* Runtime mock controls — the other half of "failure states are easy to trigger".
   The URL params in api/index.ts make a broken state shareable; this makes it
   flippable mid-flow, so you can arm "the next comment POST fails" and then click
   Post without reloading and losing the typed text.

   Built on <details>/<summary> deliberately: native disclosure semantics, keyboard
   operable and announced correctly with no ARIA of our own to get wrong. The
   Reset button also does quiet work for honesty — a store you can reset is
   visibly not a database. */

const ENDPOINTS: { id: MockEndpoint; label: string }[] = [
  { id: 'listProjects', label: 'List projects' },
  { id: 'getProject', label: 'Get project' },
  { id: 'createProject', label: 'Create project' },
  { id: 'searchTasks', label: 'Search tasks' },
  { id: 'createTask', label: 'Create task' },
  { id: 'listComments', label: 'List comments' },
  { id: 'createComment', label: 'Post comment' },
  { id: 'listTaskAudit', label: 'Task activity' },
]

const MODES: { value: FailureMode | ''; label: string }[] = [
  { value: '', label: 'Succeeds' },
  { value: '400', label: 'Fails 400' },
  { value: '404', label: 'Fails 404' },
  { value: '500', label: 'Fails 500' },
  { value: 'network', label: 'Network error' },
]

export function DevPanel() {
  const { mockController, resetMockData } = useMockControls()
  if (!mockController) {
    return null
  }
  return <DevPanelBody mockController={mockController} resetMockData={resetMockData} />
}

/* Split from DevPanel so the hooks below run unconditionally — DevPanel returns
   early when there is no mock controller, which a hook call cannot sit above. */
function DevPanelBody({
  mockController,
  resetMockData,
}: {
  mockController: MockController
  resetMockData?: (() => void) | undefined
}) {
  const subscribe = useCallback(
    (onChange: () => void) => mockController.subscribe(onChange),
    [mockController],
  )
  const config = useSyncExternalStore(subscribe, () => mockController.config)

  return (
    <details className={styles.panel}>
      <summary className={`${styles.summary} type-label`}>Mock controls</summary>

      <div className={styles.body}>
        <p className={`${styles.note} type-meta`}>
          This prototype runs against an in-memory mock. Changes here take effect on the next
          request — no reload needed.
        </p>

        <fieldset className={styles.group}>
          <legend className="type-label">Latency</legend>
          <label className={`${styles.row} type-interface`}>
            <span>Milliseconds</span>
            <input
              className={styles.number}
              type="number"
              min={0}
              step={50}
              value={config.latency.min}
              onChange={(event) => {
                const value = Math.max(0, Number(event.target.value) || 0)
                mockController.update({ latency: { min: value, max: value } })
              }}
            />
          </label>
          <p className={`${styles.note} type-meta`}>
            Set 0 to see the sub-200ms path, where no loading state renders at all.
          </p>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className="type-label">Force a failure</legend>
          {ENDPOINTS.map((endpoint) => {
            const current = config.failures.find((failure) => failure.endpoint === endpoint.id)
            return (
              <label key={endpoint.id} className={`${styles.row} type-interface`}>
                <span>{endpoint.label}</span>
                <select
                  className={styles.select}
                  value={current?.mode ?? ''}
                  onChange={(event) => {
                    const mode = event.target.value as FailureMode | ''
                    mockController.setFailure(endpoint.id, mode === '' ? null : mode, false)
                  }}
                >
                  {MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </fieldset>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.action} type-interface`}
            onClick={() => mockController.clearFailures()}
          >
            Clear failures
          </button>
          {resetMockData && (
            <button
              type="button"
              className={`${styles.action} type-interface`}
              onClick={resetMockData}
            >
              Reset data
            </button>
          )}
        </div>
      </div>
    </details>
  )
}
