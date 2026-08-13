import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * §6 line 123 — under prefers-reduced-motion, transitions disappear and the
 * skeleton shimmer becomes a static tint. tokens.css already forces
 * `animation-duration: 0.01ms !important` globally, which is not enough on its
 * own: it makes a shimmer SNAP to its final keyframe rather than go static, and
 * it cannot be detected from a component to swap the drawer/dialog transition for
 * an instant one. This hook is the other half of that fix — see Skeleton.module.css
 * and the dialog transition classes for the CSS half.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reduced
}
