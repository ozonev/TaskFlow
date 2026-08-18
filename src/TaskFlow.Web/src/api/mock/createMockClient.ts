import type { RequestOptions, TaskFlowClient } from '../client'
import {
  LIMITS,
  type AuditLogResponse,
  type CommentResponse,
  type CreateCommentBody,
  type CreateLabelBody,
  type CreateProjectBody,
  type CreateTaskBody,
  type LabelResponse,
  type ListProjectsQuery,
  type ListProjectTasksQuery,
  type Paged,
  type ProjectResponse,
  type TaskResponse,
  type TaskSearchQuery,
} from '../types'
import {
  delay,
  MockController,
  throwInjectedFailure,
  type MockEndpoint,
} from './failure'
import { byCreatedThenId, filterTasks, MockStore, paginate, withLabels } from './store'
import { notFound, optional, pageParams, required, ValidationErrors } from './validate'

export interface MockClientOptions {
  controller?: MockController
  now?: () => Date
}

export interface MockClient extends TaskFlowClient {
  readonly controller: MockController
  readonly store: MockStore
  /** Every call, in order. Tests assert on absence as much as presence. */
  readonly calls: MockEndpoint[]
  resetData(): void
}

export function createMockClient(options: MockClientOptions = {}): MockClient {
  const controller = options.controller ?? new MockController()
  const now = options.now ?? (() => new Date())
  let store = new MockStore(controller.config.seed, now)
  const calls: MockEndpoint[] = []

  /* Every method funnels through here, so latency, cancellation and failure
     injection cannot be forgotten on a new endpoint. Crucially the await happens
     BEFORE the work: an aborted request rejects without touching the store, so a
     cancelled POST is a true no-op rather than a half-applied write. */
  async function call<T>(
    endpoint: MockEndpoint,
    options: RequestOptions | undefined,
    work: () => T,
  ): Promise<T> {
    calls.push(endpoint)
    await delay(controller.config, options?.signal)

    const failure = controller.takeFailure(endpoint)
    if (failure) {
      throwInjectedFailure(failure)
    }
    return work()
  }

  return {
    controller,
    get store() {
      return store
    },
    calls,

    resetData() {
      store = new MockStore(controller.config.seed, now)
    },

    listProjects(query: ListProjectsQuery, options?: RequestOptions) {
      return call('listProjects', options, (): Paged<ProjectResponse> => {
        const { page, pageSize } = pageParams(query.page, query.pageSize)
        const ordered = [...store.data.projects].sort(byCreatedThenId)
        return paginate(ordered, page, pageSize)
      })
    },

    createProject(body: CreateProjectBody, options?: RequestOptions) {
      return call('createProject', options, (): ProjectResponse => {
        const errors = new ValidationErrors()
        const name = required(errors, 'Name', body.name, LIMITS.projectName)
        const description = optional(
          errors,
          'Description',
          body.description,
          LIMITS.projectDescription,
        )
        errors.throwIfAny()

        const project: ProjectResponse = {
          id: store.nextId(),
          name,
          description,
          createdAtUtc: store.timestamp(),
        }
        store.data.projects.push(project)
        store.data.auditLogs.push({
          id: store.nextId(),
          projectId: project.id,
          taskId: null,
          eventType: 'ProjectCreated',
          description: `Project '${project.name}' created.`,
          createdAtUtc: project.createdAtUtc,
        })
        return project
      })
    },

    getProject(id: string, options?: RequestOptions) {
      return call('getProject', options, (): ProjectResponse => {
        return store.findProject(id) ?? notFound()
      })
    },

    listProjectTasks(projectId: string, query: ListProjectTasksQuery, options?: RequestOptions) {
      return call('listProjectTasks', options, (): Paged<TaskResponse> => {
        if (!store.findProject(projectId)) {
          notFound()
        }

        const { page, pageSize } = pageParams(query.page, query.pageSize)
        const matched = store.data.tasks
          .filter((task) => task.projectId === projectId)
          .sort(byCreatedThenId)
        const paged = paginate(matched, page, pageSize)
        return { ...paged, items: paged.items.map((task) => withLabels(store, task)) }
      })
    },

    searchTasks(query: TaskSearchQuery, options?: RequestOptions) {
      return call('searchTasks', options, (): Paged<TaskResponse> => {
        const errors = new ValidationErrors()
        if (query.title !== undefined && query.title.length > LIMITS.taskTitle) {
          errors.add(
            'Title',
            `The field Title must be a string or array type with a maximum length of '${LIMITS.taskTitle}'.`,
          )
        }
        errors.throwIfAny()
        const { page, pageSize } = pageParams(query.page, query.pageSize)

        /* No 404 here even for an unknown projectId — the filter simply matches
           nothing and the response is an empty page. Mirrors TaskRepository.ApplyFilter's
           LabelId clause: a subquery over the join, applied after the scalar filters. */
        let matched = filterTasks(store.data.tasks, query)
        if (query.labelId !== undefined) {
          const taskIdsWithLabel = new Set(
            store.data.taskLabels
              .filter((link) => link.labelId === query.labelId)
              .map((link) => link.taskId),
          )
          matched = matched.filter((task) => taskIdsWithLabel.has(task.id))
        }
        matched = matched.sort(byCreatedThenId)

        const paged = paginate(matched, page, pageSize)
        return { ...paged, items: paged.items.map((task) => withLabels(store, task)) }
      })
    },

    createTask(projectId: string, body: CreateTaskBody, options?: RequestOptions) {
      return call('createTask', options, (): TaskResponse => {
        if (!store.findProject(projectId)) {
          notFound()
        }

        const errors = new ValidationErrors()
        const title = required(errors, 'Title', body.title, LIMITS.taskTitle)
        const description = optional(errors, 'Description', body.description, LIMITS.taskDescription)
        errors.throwIfAny()

        const task: TaskResponse = {
          id: store.nextId(),
          projectId,
          title,
          description,
          // Not accepted from the request: CreateTaskRequest has no Status member
          // and TaskItem.Create hardcodes it.
          status: 'Todo',
          dueDate: normaliseDueDate(body.dueDate),
          createdAtUtc: store.timestamp(),
          labels: [],
        }
        store.data.tasks.push(task)
        store.data.auditLogs.push({
          id: store.nextId(),
          projectId,
          taskId: task.id,
          eventType: 'TaskCreated',
          description: `Task '${task.title}' created.`,
          createdAtUtc: task.createdAtUtc,
        })
        return task
      })
    },

    getTask(id: string, options?: RequestOptions) {
      return call('getTask', options, (): TaskResponse => {
        const task = store.findTask(id) ?? notFound()
        return withLabels(store, task)
      })
    },

    listComments(taskId: string, options?: RequestOptions) {
      return call('listComments', options, (): CommentResponse[] => {
        if (!store.findTask(taskId)) {
          notFound()
        }
        return store.data.comments
          .filter((comment) => comment.taskId === taskId)
          .sort(byCreatedThenId)
      })
    },

    createComment(taskId: string, body: CreateCommentBody, options?: RequestOptions) {
      return call('createComment', options, (): CommentResponse => {
        if (!store.findTask(taskId)) {
          notFound()
        }

        const errors = new ValidationErrors()
        const authorName = required(
          errors,
          'AuthorName',
          body.authorName,
          LIMITS.commentAuthorName,
        )
        const text = required(errors, 'Text', body.text, LIMITS.commentText)
        errors.throwIfAny()

        const comment: CommentResponse = {
          id: store.nextId(),
          taskId,
          authorName,
          text,
          createdAtUtc: store.timestamp(),
        }
        store.data.comments.push(comment)
        store.data.auditLogs.push({
          id: store.nextId(),
          // projectId is null on comment events, so they never reach a project's
          // audit feed. Matches CreateCommentHandler.
          projectId: null,
          taskId,
          eventType: 'TaskCommentAdded',
          description: `Comment added by ${comment.authorName}.`,
          createdAtUtc: comment.createdAtUtc,
        })
        return comment
      })
    },

    listTaskAudit(taskId: string, options?: RequestOptions) {
      return call('listTaskAudit', options, (): AuditLogResponse[] => {
        if (!store.findTask(taskId)) {
          notFound()
        }
        return store.data.auditLogs
          .filter((entry) => entry.taskId === taskId)
          .sort(byCreatedThenId)
      })
    },

    listLabels(projectId: string, options?: RequestOptions) {
      return call('listLabels', options, (): LabelResponse[] => {
        if (!store.findProject(projectId)) {
          notFound()
        }
        return store.data.labels
          .filter((label) => label.projectId === projectId)
          .sort(byCreatedThenId)
      })
    },

    createLabel(projectId: string, body: CreateLabelBody, options?: RequestOptions) {
      return call('createLabel', options, (): LabelResponse => {
        if (!store.findProject(projectId)) {
          notFound()
        }

        const errors = new ValidationErrors()
        const name = required(errors, 'Name', body.name, LIMITS.labelName)
        if (
          errors.isEmpty &&
          store.data.labels.some(
            (label) => label.projectId === projectId && label.name.toLowerCase() === name.toLowerCase(),
          )
        ) {
          errors.add('Name', `A label named '${name}' already exists in this project.`)
        }
        errors.throwIfAny()

        const label: LabelResponse = {
          id: store.nextId(),
          projectId,
          name,
          createdAtUtc: store.timestamp(),
        }
        store.data.labels.push(label)
        store.data.auditLogs.push({
          id: store.nextId(),
          projectId,
          taskId: null,
          eventType: 'LabelCreated',
          description: `Label '${label.name}' created.`,
          createdAtUtc: label.createdAtUtc,
        })
        return label
      })
    },

    assignLabel(taskId: string, labelId: string, options?: RequestOptions) {
      return call('assignLabel', options, (): TaskResponse => {
        const task = store.findTask(taskId) ?? notFound()
        const label = store.findLabel(labelId) ?? notFound()

        if (label.projectId !== task.projectId) {
          const errors = new ValidationErrors()
          errors.add('LabelId', "Label does not belong to this task's project.")
          errors.throwIfAny()
        }

        // Re-assigning an already-assigned label is idempotent, matching AssignTaskLabelHandler.
        if (!store.findTaskLabel(taskId, labelId)) {
          store.data.taskLabels.push({ taskId, labelId })
          store.data.auditLogs.push({
            id: store.nextId(),
            projectId: task.projectId,
            taskId,
            eventType: 'TaskLabelAssigned',
            description: `Label '${label.name}' assigned to task '${task.title}'.`,
            createdAtUtc: store.timestamp(),
          })
        }

        return withLabels(store, task)
      })
    },
  }
}

/**
 * A DateTime with unspecified kind is treated as already-UTC by the API, so a
 * date-only value becomes midnight UTC rather than midnight local.
 */
function normaliseDueDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value
  return new Date(instant).toISOString()
}
