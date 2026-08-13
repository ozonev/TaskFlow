const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Tabbable elements within a container, computed fresh at press time rather than
 * cached — a field can mount after the dialog opens (e.g. inline validation
 * revealing a new control), and a stale list would trap focus on elements that no
 * longer exist.
 *
 * Deliberately does not filter by visibility (offsetParent, computed display):
 * jsdom performs no layout, so any such check would silently exclude every
 * element in tests and prove nothing. The dialogs this build renders don't hide
 * interactive elements behind CSS, so the gap costs nothing here.
 */
export function getTabbables(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return []
  }
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR))
}
