/* Wire types for the TaskFlow API, matching what the real endpoints serialize.

   Two things here are easy to get subtly wrong and both are load-bearing:

   1. `description` and `dueDate` are `| null`, never `?`. The API configures no
      DefaultIgnoreCondition, so these keys are always present and explicitly
      null — optional properties would let a component treat "absent" and "null"
      as different states when the server never produces the former.
   2. Property names are camelCase because MVC's JsonSerializerDefaults.Web
      applies. The *error* dictionary in ValidationProblemDetails is the exception
      — see problem.ts. */

/** The status enum has exactly one member today. A board has nothing to move. */
export type TaskItemStatus = 'Todo'

export type AuditEventType =
  | 'ProjectCreated'
  | 'TaskCreated'
  | 'TaskCommentAdded'
  | 'LabelCreated'
  | 'TaskLabelAssigned'

export interface ProjectResponse {
  id: string
  name: string
  description: string | null
  /** ISO-8601, always UTC with a Z suffix. Fractional digits vary — parse, don't compare. */
  createdAtUtc: string
}

export interface LabelResponse {
  id: string
  projectId: string
  name: string
  createdAtUtc: string
}

export interface TaskResponse {
  id: string
  projectId: string
  title: string
  description: string | null
  status: TaskItemStatus
  dueDate: string | null
  createdAtUtc: string
  labels: LabelResponse[]
}

export interface CommentResponse {
  id: string
  taskId: string
  authorName: string
  text: string
  createdAtUtc: string
}

export interface AuditLogResponse {
  id: string
  projectId: string | null
  taskId: string | null
  eventType: AuditEventType
  description: string
  createdAtUtc: string
}

/** `GET /api/projects` and `GET /api/tasks/search` share this shape exactly. */
export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  /** ceil(totalCount / pageSize) — therefore 0 when totalCount is 0, not 1. */
  totalPages: number
}

export interface ListProjectsQuery {
  page?: number
  pageSize?: number
}

export interface ListProjectTasksQuery {
  page?: number
  pageSize?: number
}

export interface TaskSearchQuery {
  projectId?: string
  status?: TaskItemStatus
  title?: string
  /** Compared as an instant, inclusive. Tasks with a null dueDate are excluded. */
  dueDateFrom?: string
  /** Compared as an instant, inclusive. See toDueDateTo() in lib/datetime.ts. */
  dueDateTo?: string
  /** Single label id — the filter is single-select, matching the FilterBar control. */
  labelId?: string
  page?: number
  pageSize?: number
}

export interface CreateProjectBody {
  name: string
  description?: string | null
}

export interface CreateTaskBody {
  title: string
  description?: string | null
  dueDate?: string | null
}

export interface CreateCommentBody {
  authorName: string
  text: string
}

export interface CreateLabelBody {
  name: string
}

/** Field length limits, from the Domain layer's constants. */
export const LIMITS = {
  projectName: 100,
  projectDescription: 500,
  taskTitle: 200,
  taskDescription: 2000,
  commentAuthorName: 100,
  commentText: 2000,
  labelName: 50,
} as const
