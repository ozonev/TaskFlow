import { fieldErrors, isApiError, isValidationError } from '../problem'
import { createMockClient, type MockClient } from './createMockClient'
import { MockController, type MockConfig } from './failure'

/* The highest-value file in the build: every screen's behaviour is only as
   faithful as this client, and a fidelity bug here shows up as a plausible-looking
   prototype that misrepresents the API. Each assertion below traces to something
   verified in the real source, not to the brief's summary of it. */

const NOW = new Date('2026-08-13T10:00:00.000Z')

function client(overrides: Partial<MockConfig> = {}): MockClient {
  const controller = new MockController({
    seed: 'default',
    latency: { min: 0, max: 0 },
    failures: [],
    ...overrides,
  })
  return createMockClient({ controller, now: () => NOW })
}

async function firstProjectId(api: MockClient): Promise<string> {
  const page = await api.listProjects({})
  const project = page.items[0]
  if (!project) throw new Error('seed produced no projects')
  return project.id
}

describe('paging contract', () => {
  it('defaults to page 1 and pageSize 20', async () => {
    const page = await client().listProjects({})
    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(20)
  })

  it('reports totalPages as 0 when nothing matches, not 1', async () => {
    const page = await client({ seed: 'empty' }).listProjects({})
    expect(page.totalCount).toBe(0)
    expect(page.totalPages).toBe(0)
    expect(page.items).toEqual([])
  })

  it('returns an empty page but echoes the requested page past the end', async () => {
    const api = client({ seed: 'large' })
    const page = await api.listProjects({ page: 99, pageSize: 20 })
    expect(page.items).toEqual([])
    expect(page.page).toBe(99)
    expect(page.totalCount).toBe(45)
    expect(page.totalPages).toBe(3)
  })

  it.each([
    ['page below 1', { page: 0 }, 'Page'],
    ['pageSize below 1', { pageSize: 0 }, 'PageSize'],
    ['pageSize above 100', { pageSize: 101 }, 'PageSize'],
  ])('rejects %s with a 400 keyed on the member name', async (_label, query, key) => {
    const error = await client()
      .listProjects(query)
      .catch((caught: unknown) => caught)

    expect(isValidationError(error)).toBe(true)
    // Keys arrive PascalCase because DictionaryKeyPolicy is not camelCase; the
    // lookup must be case-insensitive, which is what fieldErrors provides.
    expect(fieldErrors(error, key.toLowerCase())).not.toHaveLength(0)
  })

  it('orders projects by createdAtUtc then id, ascending', async () => {
    const page = await client({ seed: 'large' }).listProjects({ pageSize: 100 })
    const timestamps = page.items.map((project) => project.createdAtUtc)
    expect([...timestamps].sort()).toEqual(timestamps)
  })
})

describe('task search', () => {
  it('matches title as a case-insensitive substring, not a prefix', async () => {
    const api = client()
    const projectId = await firstProjectId(api)

    const middle = await api.searchTasks({ projectId, title: 'CONTRAST' })
    expect(middle.items).toHaveLength(1)
    expect(middle.items[0]?.title).toContain('contrast')

    const prefixOnly = await api.searchTasks({ projectId, title: 'ontrast failure' })
    expect(prefixOnly.items).toHaveLength(1)
  })

  it('ignores a whitespace-only title rather than matching nothing', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const blank = await api.searchTasks({ projectId, title: '   ' })
    const none = await api.searchTasks({ projectId })
    expect(blank.totalCount).toBe(none.totalCount)
  })

  it('returns an empty page for an unknown projectId, not a 404', async () => {
    const page = await client().searchTasks({ projectId: 'ffffffff-0000-4000-8000-000000000000' })
    expect(page.items).toEqual([])
    expect(page.totalCount).toBe(0)
  })

  it('excludes tasks with a null dueDate from either date bound', async () => {
    const api = client()
    const projectId = await firstProjectId(api)

    const unfiltered = await api.searchTasks({ projectId, pageSize: 100 })
    const undated = unfiltered.items.filter((task) => task.dueDate === null)
    expect(undated.length).toBeGreaterThan(0)

    const bounded = await api.searchTasks({
      projectId,
      pageSize: 100,
      dueDateFrom: '1970-01-01T00:00:00.000Z',
      dueDateTo: '2999-01-01T00:00:00.000Z',
    })
    expect(bounded.items.every((task) => task.dueDate !== null)).toBe(true)
    expect(bounded.totalCount).toBe(unfiltered.totalCount - undated.length)
  })

  it('compares date bounds as instants — the bug a day-granular filter would hide', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const created = await api.createTask(projectId, {
      title: 'Due mid-afternoon',
      dueDate: '2026-09-10T15:30:00.000Z',
    })

    // A naive dueDateTo of the bare date is midnight, so it excludes the task.
    const naive = await api.searchTasks({
      projectId,
      pageSize: 100,
      dueDateTo: '2026-09-10T00:00:00.000Z',
    })
    expect(naive.items.map((t) => t.id)).not.toContain(created.id)

    // Widening to end-of-day includes it. lib/datetime.ts does this for the UI.
    const widened = await api.searchTasks({
      projectId,
      pageSize: 100,
      dueDateTo: '2026-09-10T23:59:59.999Z',
    })
    expect(widened.items.map((t) => t.id)).toContain(created.id)
  })

  it('rejects a title longer than 200 characters', async () => {
    const error = await client()
      .searchTasks({ title: 'x'.repeat(201) })
      .catch((caught: unknown) => caught)
    expect(fieldErrors(error, 'title')).not.toHaveLength(0)
  })
})

describe('list project tasks', () => {
  it('returns only tasks for the given project, unfiltered otherwise', async () => {
    const api = client({ seed: 'large' })
    const projects = await api.listProjects({ pageSize: 100 })
    const projectId = projects.items[0]?.id
    if (!projectId) throw new Error('seed produced no projects')

    const listed = await api.listProjectTasks(projectId, {})
    const searched = await api.searchTasks({ projectId, pageSize: 100 })
    expect(listed.totalCount).toBe(searched.totalCount)
    expect(listed.items.every((task) => task.projectId === projectId)).toBe(true)
  })

  it('404s for an unknown project, unlike searchTasks', async () => {
    const error = await client()
      .listProjectTasks('ffffffff-0000-4000-8000-000000000000', {})
      .catch((caught: unknown) => caught)
    expect(isApiError(error) && error.status).toBe(404)
  })

  it('orders tasks by createdAtUtc then id, ascending', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const page = await api.listProjectTasks(projectId, { pageSize: 100 })
    const timestamps = page.items.map((task) => task.createdAtUtc)
    expect([...timestamps].sort()).toEqual(timestamps)
  })
})

describe('get task', () => {
  it('returns the task by id', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const created = await api.createTask(projectId, { title: 'Look me up' })

    const fetched = await api.getTask(created.id)
    expect(fetched).toEqual(created)
  })

  it('404s for an unknown id', async () => {
    const error = await client()
      .getTask('ffffffff-0000-4000-8000-000000000000')
      .catch((caught: unknown) => caught)
    expect(isApiError(error) && error.status).toBe(404)
  })
})

describe('create project', () => {
  it('trims before validating, so padding passes and is not stored', async () => {
    const project = await client().createProject({ name: '  Padded  ', description: '  spaced  ' })
    expect(project.name).toBe('Padded')
    expect(project.description).toBe('spaced')
  })

  it.each([['omitted', undefined], ['empty', ''], ['whitespace only', '   ']])(
    'rejects a %s name as required',
    async (_label, name) => {
      const error = await client()
        .createProject({ name: name as string })
        .catch((caught: unknown) => caught)
      expect(fieldErrors(error, 'Name')).not.toHaveLength(0)
    },
  )

  it('rejects a name over 100 characters', async () => {
    const error = await client()
      .createProject({ name: 'x'.repeat(101) })
      .catch((caught: unknown) => caught)
    expect(fieldErrors(error, 'name')).not.toHaveLength(0)
  })

  it('normalises a blank description to null', async () => {
    const project = await client().createProject({ name: 'Named', description: '   ' })
    expect(project.description).toBeNull()
  })

  it('appears in the list and writes a ProjectCreated audit row', async () => {
    const api = client()
    const before = await api.listProjects({ pageSize: 100 })
    const created = await api.createProject({ name: 'Fresh' })

    const after = await api.listProjects({ pageSize: 100 })
    expect(after.totalCount).toBe(before.totalCount + 1)
    expect(after.items.map((p) => p.id)).toContain(created.id)
    expect(
      api.store.data.auditLogs.some(
        (entry) => entry.projectId === created.id && entry.eventType === 'ProjectCreated',
      ),
    ).toBe(true)
  })
})

describe('create task', () => {
  it('ignores any supplied status and always returns Todo', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const task = await api.createTask(projectId, {
      title: 'Status is not an input',
      ...({ status: 'Done' } as object),
    })
    expect(task.status).toBe('Todo')
  })

  it('treats a date-only dueDate as already UTC', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const task = await api.createTask(projectId, { title: 'Dated', dueDate: '2026-12-01' })
    expect(task.dueDate).toBe('2026-12-01T00:00:00.000Z')
  })

  it('404s for an unknown project', async () => {
    const error = await client()
      .createTask('ffffffff-0000-4000-8000-000000000000', { title: 'Orphan' })
      .catch((caught: unknown) => caught)
    expect(isApiError(error) && error.status).toBe(404)
  })

  it('rejects a title over 200 characters', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const error = await api
      .createTask(projectId, { title: 'x'.repeat(201) })
      .catch((caught: unknown) => caught)
    expect(fieldErrors(error, 'Title')).not.toHaveLength(0)
  })
})

describe('comments and audit', () => {
  async function taskWithComments(api: MockClient) {
    const projectId = await firstProjectId(api)
    const tasks = await api.searchTasks({ projectId, pageSize: 100 })
    for (const task of tasks.items) {
      if ((await api.listComments(task.id)).length > 0) return task.id
    }
    throw new Error('seed produced no commented task')
  }

  it('returns a bare ascending array', async () => {
    const api = client()
    const taskId = await taskWithComments(api)
    const comments = await api.listComments(taskId)
    const timestamps = comments.map((comment) => comment.createdAtUtc)
    expect([...timestamps].sort()).toEqual(timestamps)
  })

  it('404s comments and audit for an unknown task', async () => {
    const api = client()
    const unknown = 'ffffffff-0000-4000-8000-000000000000'
    for (const call of [api.listComments(unknown), api.listTaskAudit(unknown)]) {
      const error = await call.catch((caught: unknown) => caught)
      expect(isApiError(error) && error.status).toBe(404)
    }
  })

  it('writes a TaskCommentAdded row with a null projectId', async () => {
    const api = client()
    const projectId = await firstProjectId(api)
    const tasks = await api.searchTasks({ projectId })
    const taskId = tasks.items[0]?.id
    if (!taskId) throw new Error('seed produced no tasks')

    await api.createComment(taskId, { authorName: 'Ada', text: 'Noted.' })
    const entry = api.store.data.auditLogs.find(
      (row) => row.taskId === taskId && row.eventType === 'TaskCommentAdded',
    )
    // Null projectId is why comment events never appear in a project's audit feed.
    expect(entry?.projectId).toBeNull()
  })

  it.each([
    ['authorName', { authorName: '  ', text: 'ok' }, 'AuthorName'],
    ['text', { authorName: 'Ada', text: '   ' }, 'Text'],
  ])('rejects a blank %s', async (_label, body, key) => {
    const api = client()
    const projectId = await firstProjectId(api)
    const tasks = await api.searchTasks({ projectId })
    const taskId = tasks.items[0]?.id ?? ''
    const error = await api.createComment(taskId, body).catch((caught: unknown) => caught)
    expect(fieldErrors(error, key)).not.toHaveLength(0)
  })
})

describe('failure injection', () => {
  it('produces the requested status with a traceId', async () => {
    const api = client({ failures: [{ endpoint: 'searchTasks', mode: '500' }] })
    const error = await api.searchTasks({}).catch((caught: unknown) => caught)
    expect(isApiError(error) && error.status).toBe(500)
    expect(isApiError(error) && error.problem.traceId).toBeTruthy()
  })

  it('a `once` failure fails exactly once, so a retry succeeds', async () => {
    const api = client({ failures: [{ endpoint: 'listProjects', mode: '500', once: true }] })
    await expect(api.listProjects({})).rejects.toThrow()
    await expect(api.listProjects({})).resolves.toMatchObject({ page: 1 })
  })

  it('a network failure rejects with a TypeError, as fetch does', async () => {
    const api = client({ failures: [{ endpoint: 'listProjects', mode: 'network' }] })
    const error = await api.listProjects({}).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TypeError)
    expect(isApiError(error)).toBe(false)
  })
})

describe('cancellation', () => {
  it('rejects with AbortError and leaves the store unmutated', async () => {
    const api = createMockClient({
      controller: new MockController({
        seed: 'default',
        latency: { min: 40, max: 40 },
        failures: [],
      }),
      now: () => NOW,
    })
    const before = api.store.data.projects.length

    const controller = new AbortController()
    const pending = api.createProject({ name: 'Never written' }, { signal: controller.signal })
    controller.abort()

    const error = await pending.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('AbortError')
    // The await happens before the work, so an aborted write is a true no-op.
    expect(api.store.data.projects).toHaveLength(before)
  })
})

describe('call log', () => {
  it('records every call in order, so absence is assertable', async () => {
    const api = client()
    await api.listProjects({})
    await api.searchTasks({})
    expect(api.calls).toEqual(['listProjects', 'searchTasks'])
  })
})
