import axe, { type RunOptions } from 'axe-core'

/* axe-core directly rather than a wrapper matcher library: the wrappers in this
   space are thinly maintained relative to axe-core itself, and the whole
   integration is the twenty lines below.

   Note what jsdom cannot check: `color-contrast` needs real paint and is skipped
   by axe automatically here, so it proves nothing in this suite — the token
   ratios are covered by styles/contrast.test.ts instead. Layout-dependent rules
   are likewise unreliable. */
export async function expectNoAxeViolations(container: HTMLElement, options: RunOptions = {}) {
  const results = await axe.run(container, {
    ...options,
    resultTypes: ['violations'],
    rules: {
      // Needs canvas to measure rendered text, which jsdom does not provide — it
      // throws "Not implemented: HTMLCanvasElement.prototype.getContext" and then
      // silently proves nothing. styles/contrast.test.ts checks the ratios instead.
      'color-contrast': { enabled: false },
      ...options.rules,
    },
  })

  if (results.violations.length === 0) {
    return
  }

  const report = results.violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => `      at ${node.target.join(' ')}`)
        .join('\n')
      return `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${targets}`
    })
    .join('\n\n')

  throw new Error(`${results.violations.length} accessibility violation(s):\n\n${report}`)
}
