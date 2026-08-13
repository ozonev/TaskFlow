import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/* "Components do not import hard-coded fixtures directly" as an executable check.

   Duplicates an ESLint no-restricted-imports zone on purpose: lint is a separate
   command that a contributor can skip and CI can be misconfigured to omit, whereas
   this fails the test run. The constraint is load-bearing — a component reaching
   into seed data stops the prototype being a faithful stand-in for the API — so it
   is worth guarding twice. */

const srcDir = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const CONSUMER_DIRS = ['features', 'ui', 'app', 'shortcuts', 'a11y', 'data']

/* The modules a consumer must never reach: the fixtures, the store holding them,
   and the mock implementation itself. `api/mock/failure` is deliberately NOT here
   — it carries the latency/failure config types, and the mock control panel is a
   legitimate consumer of them. The line is data and implementation, not the
   control plane. */
const FORBIDDEN_MODULES = ['seed', 'store', 'createMockClient']

describe('fixture isolation', () => {
  const consumerFiles = walk(srcDir)
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => {
      const rel = relative(srcDir, file).replace(/\\/g, '/')
      return CONSUMER_DIRS.some((dir) => rel.startsWith(`${dir}/`))
    })

  it('has consumer files to check', () => {
    expect(consumerFiles.length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN_MODULES)('no consumer imports api/mock/%s', (module) => {
    const pattern = new RegExp(`from\\s+['"][^'"]*(api/mock/${module}|/${module})['"]`)
    const offenders = consumerFiles.filter((file) => pattern.test(readFileSync(file, 'utf8')))
    expect(offenders.map((file) => relative(srcDir, file))).toEqual([])
  })

  it('no consumer names a fixture author or project from the seed', () => {
    // Catches the subtler failure the import ban misses: a component hardcoding a
    // value it happens to know is in the seed, so it "works" against the mock and
    // breaks against the API.
    const seedStrings = ['Website redesign', 'Mobile app launch', 'Priya Raman', 'Tom Weyland']
    const offenders = consumerFiles.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return seedStrings.some((value) => source.includes(value))
    })
    expect(offenders.map((file) => relative(srcDir, file))).toEqual([])
  })

  it('only the mock and its tests import the seed', () => {
    const importers = walk(srcDir)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /from\s+['"][^'"]*\/seed['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(srcDir, file).replace(/\\/g, '/'))

    expect(importers.every((file) => file.startsWith('api/mock/'))).toBe(true)
  })
})
