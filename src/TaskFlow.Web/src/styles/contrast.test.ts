import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { contrastRatio, parseTokens } from './contrast'

// Resolved from the Vitest root (the web project directory) rather than
// import.meta.url: under Vite's transform that is not a file:// URL, so
// fileURLToPath rejects it.
const tokens = parseTokens(readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'))

function token(name: string): string {
  const value = tokens.get(name)
  if (!value) {
    throw new Error(`${name} is not defined in tokens.css`)
  }
  return value
}

const WHITE = '#ffffff'
const AA_TEXT = 4.5
const AA_NON_TEXT = 3

describe('token contrast', () => {
  describe('roles that must clear AA for text', () => {
    it.each([
      ['body ink on page', '--color-text', '--color-bg'],
      ['muted ink on page', '--color-neutral-700', '--color-bg'],
      ['tag ink on selected tint', '--color-accent-800', '--color-accent-100'],
      ['error ink on page', '--color-accent-2-700', '--color-bg'],
      ['danger ink on danger surface', '--color-accent-2-900', '--color-accent-2-100'],
      ['body ink on raised surface', '--color-text', '--color-surface'],
    ])('%s', (_label, ink, ground) => {
      expect(contrastRatio(token(ink), token(ground))).toBeGreaterThanOrEqual(AA_TEXT)
    })

    it.each([
      ['primary button default', '--color-accent-700'],
      ['primary button hover', '--color-accent-800'],
      ['primary button pressed', '--color-accent-900'],
    ])('%s carries white text', (_label, fill) => {
      expect(contrastRatio(token(fill), WHITE)).toBeGreaterThanOrEqual(AA_TEXT)
    })
  })

  describe('non-text roles', () => {
    it('focus ring is discernible against the page', () => {
      // §8 line 158 pins the ring to --color-accent. It clears 3:1 against the
      // page, which is where outline-offset puts it. It does NOT clear 3:1
      // against an accent-700 button fill (~1.9:1), which is why the offset must
      // never be removed and why a primary button must not sit on an accent tint.
      expect(contrastRatio(token('--color-accent'), token('--color-bg'))).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      )
    })
  })

  /* These assert failures on purpose. They are the executable record of why
     overrides.css departs from §9/§10's literal step assignments: if a future
     token edit makes either step pass, these tests break and tell us the
     override can be reverted rather than leaving it as permanent folklore. */
  describe('the steps the brief named, which is why they were overridden', () => {
    it('base --color-accent fails AA behind white text at §9 interface size', () => {
      expect(contrastRatio(token('--color-accent'), WHITE)).toBeLessThan(AA_TEXT)
    })

    it('--color-neutral-600 fails AA as metadata ink on the page', () => {
      expect(contrastRatio(token('--color-neutral-600'), token('--color-bg'))).toBeLessThan(AA_TEXT)
    })
  })
})
