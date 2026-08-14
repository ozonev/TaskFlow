/* Deterministic, monotonically increasing GUID-shaped ids.

   Deterministic so tests never depend on randomness. Monotonic so that id order
   agrees with insertion order — which matters because every list the API returns
   is ordered by (createdAtUtc, id), and seeded rows can share a createdAtUtc. */
export function createIdFactory(prefix = 0) {
  let counter = 0

  return function nextId(): string {
    counter += 1
    const high = prefix.toString(16).padStart(8, '0')
    const low = counter.toString(16).padStart(12, '0')
    return `${high}-0000-4000-8000-${low}`
  }
}
