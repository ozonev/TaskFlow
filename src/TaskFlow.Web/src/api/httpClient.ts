import type { RequestOptions, TaskFlowClient } from './client'
import { ApiError, ValidationError, type ProblemDetails, type ValidationProblemDetails } from './problem'
import type {
  AuditLogResponse,
  CommentResponse,
  CreateCommentBody,
  CreateProjectBody,
  CreateTaskBody,
  ListProjectsQuery,
  ListProjectTasksQuery,
  Paged,
  ProjectResponse,
  TaskResponse,
  TaskSearchQuery,
} from './types'

export interface HttpClientOptions {
  baseUrl: string
}

/** Omits undefined values rather than sending them as the literal string "undefined". */
function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

async function toApiError(response: Response): Promise<ApiError> {
  const problem: ProblemDetails = await response.json().catch(() => ({
    title: response.statusText,
    status: response.status,
  }))

  return response.status === 400
    ? new ValidationError(problem as ValidationProblemDetails)
    : new ApiError(response.status, problem)
}

async function request<T>(
  baseUrl: string,
  path: string,
  options?: RequestOptions & { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? 'GET',
    ...(options?.body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }
      : {}),
    ...(options?.signal !== undefined ? { signal: options.signal } : {}),
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/** The real implementation of the port in client.ts — see api/index.ts for the swap point. */
export function createHttpClient({ baseUrl }: HttpClientOptions): TaskFlowClient {
  return {
    listProjects(query: ListProjectsQuery, options?: RequestOptions) {
      return request<Paged<ProjectResponse>>(
        baseUrl,
        `/projects${toQueryString({ page: query.page, pageSize: query.pageSize })}`,
        options,
      )
    },

    createProject(body: CreateProjectBody, options?: RequestOptions) {
      return request<ProjectResponse>(baseUrl, '/projects', { ...options, method: 'POST', body })
    },

    getProject(id: string, options?: RequestOptions) {
      return request<ProjectResponse>(baseUrl, `/projects/${id}`, options)
    },

    listProjectTasks(projectId: string, query: ListProjectTasksQuery, options?: RequestOptions) {
      return request<Paged<TaskResponse>>(
        baseUrl,
        `/projects/${projectId}/tasks${toQueryString({ page: query.page, pageSize: query.pageSize })}`,
        options,
      )
    },

    searchTasks(query: TaskSearchQuery, options?: RequestOptions) {
      return request<Paged<TaskResponse>>(
        baseUrl,
        `/tasks/search${toQueryString({
          projectId: query.projectId,
          status: query.status,
          title: query.title,
          dueDateFrom: query.dueDateFrom,
          dueDateTo: query.dueDateTo,
          page: query.page,
          pageSize: query.pageSize,
        })}`,
        options,
      )
    },

    createTask(projectId: string, body: CreateTaskBody, options?: RequestOptions) {
      return request<TaskResponse>(baseUrl, `/projects/${projectId}/tasks`, {
        ...options,
        method: 'POST',
        body,
      })
    },

    getTask(id: string, options?: RequestOptions) {
      return request<TaskResponse>(baseUrl, `/tasks/${id}`, options)
    },

    listComments(taskId: string, options?: RequestOptions) {
      return request<CommentResponse[]>(baseUrl, `/tasks/${taskId}/comments`, options)
    },

    createComment(taskId: string, body: CreateCommentBody, options?: RequestOptions) {
      return request<CommentResponse>(baseUrl, `/tasks/${taskId}/comments`, {
        ...options,
        method: 'POST',
        body,
      })
    },

    listTaskAudit(taskId: string, options?: RequestOptions) {
      return request<AuditLogResponse[]>(baseUrl, `/tasks/${taskId}/audit`, options)
    },
  }
}
