import { useEffect, useState } from 'react'

/**
 * Mirrors `active`, but only after it has stayed true for `delayMs`. Goes false
 * immediately.
 *
 * This is §7 line 150 — "a response under 200ms shows no loading state at all, to
 * avoid a flash". The delay is the feature, not an optimisation: showing a
 * skeleton for 80ms and removing it reads as a glitch, so the correct behaviour is
 * to render nothing and let the content arrive.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }

    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return visible
}
