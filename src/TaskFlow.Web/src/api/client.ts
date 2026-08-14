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

export interface RequestOptions {
  signal?: AbortSignal
}

/**
 * The port. One method per real endpoint, same parameters, same envelope, same
 * error shapes — so replacing the mock with an HTTP implementation is one new
 * file plus one line in api/index.ts.
 */
export interface TaskFlowClient {
  listProjects(query: ListProjectsQuery, options?: RequestOptions): Promise<Paged<ProjectResponse>>
  createProject(body: CreateProjectBody, options?: RequestOptions): Promise<ProjectResponse>
  getProject(id: string, options?: RequestOptions): Promise<ProjectResponse>

  /** Plain, unfiltered listing — use this instead of searchTasks({projectId}) when no filter is active. */
  listProjectTasks(
    projectId: string,
    query: ListProjectTasksQuery,
    options?: RequestOptions,
  ): Promise<Paged<TaskResponse>>
  searchTasks(query: TaskSearchQuery, options?: RequestOptions): Promise<Paged<TaskResponse>>
  createTask(
    projectId: string,
    body: CreateTaskBody,
    options?: RequestOptions,
  ): Promise<TaskResponse>
  getTask(id: string, options?: RequestOptions): Promise<TaskResponse>

  listComments(taskId: string, options?: RequestOptions): Promise<CommentResponse[]>
  createComment(
    taskId: string,
    body: CreateCommentBody,
    options?: RequestOptions,
  ): Promise<CommentResponse>

  listTaskAudit(taskId: string, options?: RequestOptions): Promise<AuditLogResponse[]>
}
