import { useLocation } from 'react-router'

/**
 * Every link that opens an overlay route (a dialog or the drawer) must go through
 * this, for two reasons: it marks the pushed history entry with `state.overlay`,
 * which is what tells useDialogClose it's safe to pop rather than navigate away;
 * and it carries the current query string along, which is how a filtered task
 * list survives opening "New task" and coming back (§2 line 49).
 */
export function useOverlayLinkProps(pathname: string): {
  to: string
  state: { overlay: true }
} {
  const location = useLocation()
  return { to: `${pathname}${location.search}`, state: { overlay: true } }
}
