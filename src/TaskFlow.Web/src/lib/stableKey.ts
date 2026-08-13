/**
 * Order-independent serialisation of a query key. Object keys are sorted, so
 * `{a: 1, b: 2}` and `{b: 2, a: 1}` hash identically — otherwise a filter object
 * rebuilt in a different property order would look like a different query and
 * refetch for no reason.
 *
 * `undefined` members are dropped, matching the API's "absent means no filter":
 * `{status: undefined}` must hash the same as `{}`.
 */
export function stableKey(key: readonly unknown[]): string {
  return JSON.stringify(key, replacer)
}

function replacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return Object.fromEntries(entries)
}

/** True when `key` starts with every element of `prefix`. Drives invalidation. */
export function keyHasPrefix(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  if (prefix.length > key.length) {
    return false
  }
  return prefix.every((part, index) => stableKey([part]) === stableKey([key[index]]))
}
