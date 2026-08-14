import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

/* jsdom implements no matchMedia at all, so anything reading prefers-reduced-motion
   crashes without this. Tests that care call setPrefersReducedMotion(true); the
   default is "no preference", matching a normal viewer. */
let reducedMotion = false

export function setPrefersReducedMotion(value: boolean) {
  reducedMotion = value
}

beforeEach(() => {
  reducedMotion = false

  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: query.includes('prefers-reduced-motion: reduce') ? reducedMotion : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
})

afterEach(() => {
  localStorage.clear()
})
