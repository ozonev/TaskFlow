/* RFC 9457 problem responses, and the field-error lookup that copes with how
   ASP.NET actually keys them.

   The trap: JsonSerializerDefaults.Web sets PropertyNamingPolicy but NOT
   DictionaryKeyPolicy, and `errors` is a dictionary. So its keys are NOT
   camelCased — they arrive as ModelState member names ("Title", "PageSize") for
   DataAnnotations failures, or as JSON paths ("$.dueDate") when deserialization
   fails. The backend's own tests compare these with OrdinalIgnoreCase for exactly
   this reason; matching a hardcoded casing here would drop messages silently. */

export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  traceId?: string
}

export interface ValidationProblemDetails extends ProblemDetails {
  errors: Record<string, string[]>
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    super(problem.title ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
  }
}

export class ValidationError extends ApiError {
  constructor(override readonly problem: ValidationProblemDetails) {
    super(400, problem)
    this.name = 'ValidationError'
  }
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** `"$.dueDate"` and `"DueDate"` both normalise to `"duedate"`. */
function normaliseKey(key: string): string {
  return key.replace(/^\$\./, '').toLowerCase()
}

/**
 * Messages for one field, matched case-insensitively and ignoring a JSON-path
 * prefix. Returns an empty array when the field is not in error.
 */
export function fieldErrors(error: unknown, field: string): string[] {
  if (!isValidationError(error)) {
    return []
  }

  const wanted = normaliseKey(field)
  const messages: string[] = []
  for (const [key, values] of Object.entries(error.problem.errors)) {
    if (normaliseKey(key) === wanted) {
      messages.push(...values)
    }
  }
  return messages
}

/**
 * Messages that no rendered field claimed. Surfaced in the error summary so a
 * server-side rule the UI doesn't model can never vanish without a trace.
 */
export function unclaimedErrors(error: unknown, claimedFields: readonly string[]): string[] {
  if (!isValidationError(error)) {
    return []
  }

  const claimed = new Set(claimedFields.map(normaliseKey))
  const messages: string[] = []
  for (const [key, values] of Object.entries(error.problem.errors)) {
    if (!claimed.has(normaliseKey(key))) {
      messages.push(...values)
    }
  }
  return messages
}
