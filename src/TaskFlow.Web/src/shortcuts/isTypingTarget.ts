/**
 * §6 line 137 — "single-letter shortcuts are suppressed while a text input has
 * focus". Covers native controls plus anything marked contenteditable or given
 * role="textbox", since a rich-text field wouldn't be caught by tagName alone.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  // `.isContentEditable` is unimplemented in jsdom (always false there), so the
  // attribute is checked directly too — this also covers the inherited case,
  // since contenteditable="true" cascades to descendant elements.
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.getAttribute('role') === 'textbox'
}
