import type { TaskResponse } from '../../api/types'
import { groupTasksByDueWindow, flattenVisibleTaskIds } from './grouping'

// A fixed local-noon "now" so every test is independent of when it actually runs.
const NOW = new Date(2026, 7, 13, 12, 0, 0) // Thursday, Aug 13 2026, local time

function task(id: string, dueDate: string | null): TaskResponse {
  return {
    id,
    projectId: 'p1',
    title: id,
    description: null,
    status: 'Todo',
    dueDate,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    labels: [],
  }
}

function iso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month, day, hour).toISOString()
}

describe('groupTasksByDueWindow', () => {
  it('buckets a task due yesterday as overdue', () => {
    const groups = groupTasksByDueWindow([task('a', iso(2026, 7, 12))], NOW)
    expect(groups).toEqual([{ id: 'overdue', label: 'Overdue', tasks: [expect.objectContaining({ id: 'a' })] }])
  })

  it('buckets a task due later today as today, even if it is already past that hour', () => {
    const groups = groupTasksByDueWindow([task('a', iso(2026, 7, 13, 0))], NOW)
    expect(groups.map((g) => g.id)).toEqual(['today'])
  })

  it('buckets a task due tomorrow as this week', () => {
    const groups = groupTasksByDueWindow([task('a', iso(2026, 7, 14))], NOW)
    expect(groups.map((g) => g.id)).toEqual(['thisWeek'])
  })

  it('buckets a task due next month as later', () => {
    const groups = groupTasksByDueWindow([task('a', iso(2026, 8, 20))], NOW)
    expect(groups.map((g) => g.id)).toEqual(['later'])
  })

  it('buckets a null dueDate as its own group, not later', () => {
    const groups = groupTasksByDueWindow([task('a', null)], NOW)
    expect(groups).toEqual([{ id: 'noDueDate', label: 'No due date', tasks: [expect.objectContaining({ id: 'a' })] }])
  })

  it('a task due exactly at the this-week boundary (next Monday) falls into later, not this week', () => {
    // NOW is Thursday Aug 13 2026; the coming Sunday is Aug 16, so "this week"
    // ends at that Sunday's midnight — the following Monday is the boundary.
    const groups = groupTasksByDueWindow([task('a', iso(2026, 7, 17))], NOW)
    expect(groups.map((g) => g.id)).toEqual(['later'])
  })

  it('omits empty groups entirely rather than rendering a zero count', () => {
    const groups = groupTasksByDueWindow([task('a', iso(2026, 7, 12)), task('b', null)], NOW)
    expect(groups.map((g) => g.id)).toEqual(['overdue', 'noDueDate'])
  })

  it('orders groups overdue, today, thisWeek, later, noDueDate regardless of input order', () => {
    const groups = groupTasksByDueWindow(
      [
        task('undated', null),
        task('later', iso(2026, 8, 20)),
        task('week', iso(2026, 7, 14)),
        task('today', iso(2026, 7, 13, 20)),
        task('overdue', iso(2026, 7, 1)),
      ],
      NOW,
    )
    expect(groups.map((g) => g.id)).toEqual(['overdue', 'today', 'thisWeek', 'later', 'noDueDate'])
  })

  it('preserves task order within a group', () => {
    const groups = groupTasksByDueWindow(
      [task('a', iso(2026, 7, 20)), task('b', iso(2026, 7, 21))],
      NOW,
    )
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('returns no groups for an empty task list', () => {
    expect(groupTasksByDueWindow([], NOW)).toEqual([])
  })
})

describe('flattenVisibleTaskIds', () => {
  const groups = groupTasksByDueWindow(
    [
      task('a', iso(2026, 7, 1)), // overdue
      task('b', iso(2026, 7, 13, 20)), // today
      task('c', null), // no due date
    ],
    NOW,
  )

  it('flattens across all groups when none are collapsed', () => {
    expect(flattenVisibleTaskIds(groups, new Set())).toEqual(['a', 'b', 'c'])
  })

  it('excludes a collapsed group entirely, crossing the boundary around it (§6 line 130)', () => {
    expect(flattenVisibleTaskIds(groups, new Set(['today']))).toEqual(['a', 'c'])
  })

  it('returns an empty list when every group is collapsed', () => {
    expect(flattenVisibleTaskIds(groups, new Set(['overdue', 'today', 'noDueDate']))).toEqual([])
  })
})
