import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

interface OverlayLocationState {
  overlay?: boolean
}

/**
 * "Back closes a dialog or undoes a filter; it never leaves the app unexpectedly"
 * (§2 line 53). `navigate(-1)` alone breaks on a cold deep link — there is no
 * in-app entry to pop back to, and popping would leave the SPA entirely. The
 * `overlay` flag on location.state (set by useOverlayLinkProps below) records
 * whether THIS history entry was pushed by opening the dialog from inside the
 * app; only then is popping safe.
 */
export function useDialogClose(fallbackPath: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const state = location.state as OverlayLocationState | null
    if (state?.overlay) {
      navigate(-1)
    } else {
      navigate(fallbackPath, { replace: true })
    }
  }, [navigate, location, fallbackPath])
}
