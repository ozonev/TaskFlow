import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHttpClient } from './httpClient'
import { isApiError, isValidationError } from './problem'

/* fetch is stubbed per test via vi.stubGlobal rather than a network call — this
   file only verifies the client's own contract (URL/body construction, response
   mapping), not the real backend. */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request construction', () => {
  it('builds the URL under baseUrl and omits undefined query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createHttpClient({ baseUrl: '/api' })
    await client.listProjects({ page: 2 })

    expect(fetchMock).toHaveBeenCalledWith('/api/projects?page=2', expect.objectContaining({ method: 'GET' }))
  })

  it('builds searchTasks query params from every optional filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createHttpClient({ baseUrl: '/api' })
    await client.searchTasks({ projectId: 'p1', status: 'Todo', title: 'brief', dueDateFrom: '2026-01-01T00:00:00.000Z' })

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(
      '/api/tasks/search?projectId=p1&status=Todo&title=brief&dueDateFrom=2026-01-01T00%3A00%3A00.000Z',
    )
  })

  it('sends a JSON body with a Content-Type header on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1', name: 'Named', description: null, createdAtUtc: 'x' }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createHttpClient({ baseUrl: '/api' })
    await client.createProject({ name: 'Named' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Named' }),
      }),
    )
  })

  it('forwards the AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1', projectId: 'p', title: 't', description: null, status: 'Todo', dueDate: null, createdAtUtc: 'x' }))
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const client = createHttpClient({ baseUrl: '/api' })
    await client.getTask('t1', { signal: controller.signal })

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/t1', expect.objectContaining({ signal: controller.signal }))
  })
})

describe('response mapping', () => {
  it('resolves with the parsed JSON body on success', async () => {
    const body = { id: '1', name: 'Named', description: null, createdAtUtc: 'x' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    const client = createHttpClient({ baseUrl: '/api' })
    await expect(client.getProject('1')).resolves.toEqual(body)
  })

  it('maps a 400 with an errors dictionary to a ValidationError', async () => {
    const problem = {
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { Name: ['The Name field is required.'] },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(problem, 400)))

    const client = createHttpClient({ baseUrl: '/api' })
    const error = await client.createProject({ name: '' }).catch((caught: unknown) => caught)

    expect(isValidationError(error)).toBe(true)
    expect(isValidationError(error) && error.problem.errors).toEqual(problem.errors)
  })

  it('maps a 404 to a plain ApiError', async () => {
    const problem = { title: 'Not Found', status: 404 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(problem, 404)))

    const client = createHttpClient({ baseUrl: '/api' })
    const error = await client.getTask('unknown').catch((caught: unknown) => caught)

    expect(isApiError(error) && error.status).toBe(404)
    expect(isValidationError(error)).toBe(false)
  })

  it('propagates a network failure as the TypeError fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const client = createHttpClient({ baseUrl: '/api' })
    const error = await client.listProjects({}).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TypeError)
    expect(isApiError(error)).toBe(false)
  })
})
