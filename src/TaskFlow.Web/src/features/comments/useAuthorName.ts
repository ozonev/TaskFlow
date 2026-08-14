import { useCallback, useState } from 'react'

import { AUTHOR_NAME_STORAGE_KEY } from '../../lib/constants'

function readStoredName(): string {
  try {
    return localStorage.getItem(AUTHOR_NAME_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * §6 line 119 — "author name persists in local storage between comments".
 *
 * `storedName` is read once on mount; `commit` is called only after a comment
 * actually posts successfully — never on every keystroke — so a name typed and
 * abandoned mid-form never gets remembered. This is also the one place this
 * prototype genuinely persists something, which is why the field's own label
 * says "remembered on this device" rather than nothing: unlike the task and
 * comment data, this really does survive a reload.
 */
export function useAuthorName(): { storedName: string; commit: (name: string) => void } {
  const [storedName] = useState(readStoredName)

  const commit = useCallback((name: string) => {
    try {
      localStorage.setItem(AUTHOR_NAME_STORAGE_KEY, name)
    } catch {
      // Storage can be unavailable (private browsing, quota) — losing the
      // remembered name is not worth failing the comment over.
    }
  }, [])

  return { storedName, commit }
}
