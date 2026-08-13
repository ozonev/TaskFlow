import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Resolved from the Vitest root (the web project directory) rather than
// import.meta.url: under Vite's transform that is not a file:// URL.
const webRoot = process.cwd()
const srcDir = join(webRoot, 'src')
const stylesDir = join(srcDir, 'styles')
const approvedTokens = join(webRoot, '..', '..', '.claude', 'docs', 'frontend')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('tokens.css provenance', () => {
  it('is byte-identical to the approved token file', () => {
    // §9 line 167: all values come from the approved stylesheet. Copying rather
    // than importing across the project boundary keeps the Vite build
    // self-contained, so this test is what stops the copy from drifting.
    const local = readFileSync(join(stylesDir, 'tokens.css'))
    const approved = readFileSync(join(approvedTokens, 'taskflow-tokens.css'))
    expect(local.equals(approved)).toBe(true)
  })
})

/* Comments are prose, not declarations — a line citing "760px" or "44px" to
   point at the §5 requirement it implements is exactly the citation style this
   codebase wants (see CLAUDE.md's Code comments section), and must not itself
   trip the guard it is explaining. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('§12 line 241 — no value outside the token file', () => {
  const moduleSheets = walk(srcDir).filter((file) => file.endsWith('.module.css'))

  it('finds component stylesheets to check', () => {
    expect(moduleSheets.length).toBeGreaterThan(0)
  })

  it.each([
    ['hex colours', /#[0-9a-fA-F]{3,8}\b/],
    ['rgb()', /\brgba?\(/],
    ['hsl()', /\bhsla?\(/],
    ['color-mix()', /\bcolor-mix\(/],
  ])('declares no %s', (_label, pattern) => {
    const offenders = moduleSheets.filter((file) =>
      pattern.test(withoutComments(readFileSync(file, 'utf8'))),
    )
    expect(offenders).toEqual([])
  })

  it('declares no raw px outside @media preludes', () => {
    // CSS forbids var() inside a @media prelude, so the two §5 breakpoints must
    // appear there as literals. Everywhere else a px value means a magic number
    // that belongs in layout.css.
    const offenders = moduleSheets.filter((file) => {
      const withoutMediaPreludes = withoutComments(readFileSync(file, 'utf8')).replace(
        /@media[^{]*\{/g,
        '',
      )
      return /\b\d+(\.\d+)?px\b/.test(withoutMediaPreludes)
    })
    expect(offenders).toEqual([])
  })
})
