/* UTC-on-the-wire, local-in-the-viewport (§3 line 67).

   The important function here is toDueDateToInstant. The backend's dueDateFrom /
   dueDateTo filters compare DateTime *instants* — see TaskRepository.ApplyFilter —
   and a date-only value normalises to midnight UTC via UtcDateTimeConversion. So
   sending dueDateTo=2026-08-20 silently excludes every task due later that same
   UTC day: 09:00Z is > 00:00Z. The brief's "inclusive" (§3) means inclusive of
   instants, not of days. Widening the upper bound to end-of-day is therefore a
   correctness requirement, not a nicety — without it users lose rows with no
   feedback at all. */

/** `2026-08-20` → `2026-08-20T00:00:00.000Z`. Lower bound of that UTC day. */
export function toDueDateFromInstant(date: string): string {
  return `${date}T00:00:00.000Z`
}

/** `2026-08-20` → `2026-08-20T23:59:59.999Z`. Upper bound of that UTC day. */
export function toDueDateToInstant(date: string): string {
  return `${date}T23:59:59.999Z`
}

/** An instant back to the `yyyy-MM-dd` a date input wants, in UTC. */
export function toDateInputValue(instant: string): string {
  return instant.slice(0, 10)
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Local-zone rendering. §3 line 67 wants the absolute value in a title attribute. */
export function formatDate(instant: string): string {
  return dateFormatter.format(new Date(instant))
}

export function formatDateTime(instant: string): string {
  return dateTimeFormatter.format(new Date(instant))
}

/** Midnight this morning, local zone — the boundary the due-window grouping uses. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function startOfTomorrow(now: Date = new Date()): Date {
  const start = startOfToday(now)
  start.setDate(start.getDate() + 1)
  return start
}

/**
 * Midnight after the coming Sunday, local zone — the exclusive end of "this week".
 * Sunday is treated as the last day of the week, so on a Sunday this returns
 * tomorrow and "this week" holds only today.
 */
export function endOfThisWeek(now: Date = new Date()): Date {
  const start = startOfToday(now)
  const daysUntilSunday = (7 - start.getDay()) % 7
  const end = new Date(start)
  end.setDate(end.getDate() + daysUntilSunday + 1)
  return end
}
