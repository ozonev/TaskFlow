import type {
  AuditLogResponse,
  CommentResponse,
  CreateCommentBody,
  CreateProjectBody,
  CreateTaskBody,
  ListProjectsQuery,
  Paged,
  ProjectResponse,
  TaskResponse,
  TaskSearchQuery,
} from './types'

export interface RequestOptions {
  signal?: AbortSignal
}

/**
 * The port. One method per real endpoint, same parameters, same envelope, same
 * error shapes — so replacing the mock with an HTTP implementation is one new
 * file plus one line in api/index.ts.
 *
 * Note what is deliberately absent: there is no `getTask`. `GET /api/tasks/{id}`
 * does not exist on the backend, and §3 line 78 of the brief mandates a temporary
 * client-side fallback through task search instead. Keeping the gap visible in
 * the interface stops the fallback leaking into the client, and confines its
 * eventual removal to one hook.
 */
export interface TaskFlowClient {
  listProjects(query: ListProjectsQuery, options?: RequestOptions): Promise<Paged<ProjectResponse>>
  createProject(body: CreateProjectBody, options?: RequestOptions): Promise<ProjectResponse>
  getProject(id: string, options?: RequestOptions): Promise<ProjectResponse>

  searchTasks(query: TaskSearchQuery, options?: RequestOptions): Promise<Paged<TaskResponse>>
  createTask(
    projectId: string,
    body: CreateTaskBody,
    options?: RequestOptions,
  ): Promise<TaskResponse>

  listComments(taskId: string, options?: RequestOptions): Promise<CommentResponse[]>
  createComment(
    taskId: string,
    body: CreateCommentBody,
    options?: RequestOptions,
  ): Promise<CommentResponse>

  listTaskAudit(taskId: string, options?: RequestOptions): Promise<AuditLogResponse[]>
}
