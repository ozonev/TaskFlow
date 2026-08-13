import { ApiError, ValidationError, type ValidationProblemDetails } from '../problem'

/* Reproduces what [ApiController] + DataAnnotations actually do, including the
   two details a naive mock gets wrong:

   - Trimming happens in the request record's `init` accessor, so it runs BEFORE
     validation. "  x  " passes a MaxLength(1) check and stores "x"; "   " fails
     [Required] because it trims to "".
   - `errors` keys are ModelState member names in PascalCase, not camelCase.
     fieldErrors() in problem.ts is what makes them safe to read. */

const TRACE_ID = '00-mock0000000000000000000000000000-0000000000000000-00'

export function problemTraceId(): string {
  return TRACE_ID
}

export class ValidationErrors {
  private readonly errors: Record<string, string[]> = {}

  add(field: string, message: string): void {
    const existing = this.errors[field]
    if (existing) {
      existing.push(message)
    } else {
      this.errors[field] = [message]
    }
  }

  get isEmpty(): boolean {
    return Object.keys(this.errors).length === 0
  }

  throwIfAny(): void {
    if (this.isEmpty) {
      return
    }

    const problem: ValidationProblemDetails = {
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: this.errors,
      traceId: TRACE_ID,
    }
    throw new ValidationError(problem)
  }
}

/** Trims, then treats blank as missing — matching the `init` accessor + [Required]. */
export function required(
  errors: ValidationErrors,
  field: string,
  value: string | null | undefined,
  maxLength: number,
): string {
  const trimmed = (value ?? '').trim()

  if (trimmed.length === 0) {
    errors.add(field, `The ${field} field is required.`)
    return trimmed
  }
  if (trimmed.length > maxLength) {
    errors.add(
      field,
      `The field ${field} must be a string or array type with a maximum length of '${maxLength}'.`,
    )
  }
  return trimmed
}

/** Trims; blank becomes null, matching the domain's NormalizeDescription. */
export function optional(
  errors: ValidationErrors,
  field: string,
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    errors.add(
      field,
      `The field ${field} must be a string or array type with a maximum length of '${maxLength}'.`,
    )
  }
  return trimmed.length === 0 ? null : trimmed
}

export function pageParams(
  page: number | undefined,
  pageSize: number | undefined,
): { page: number; pageSize: number } {
  const errors = new ValidationErrors()
  const resolvedPage = page ?? 1
  const resolvedPageSize = pageSize ?? 20

  // [Range(1, int.MaxValue)] on Page, [Range(1, 100)] on PageSize.
  if (!Number.isInteger(resolvedPage) || resolvedPage < 1) {
    errors.add('Page', 'The field Page must be between 1 and 2147483647.')
  }
  if (!Number.isInteger(resolvedPageSize) || resolvedPageSize < 1 || resolvedPageSize > 100) {
    errors.add('PageSize', 'The field PageSize must be between 1 and 100.')
  }
  errors.throwIfAny()

  return { page: resolvedPage, pageSize: resolvedPageSize }
}

export function notFound(): never {
  throw new ApiError(404, {
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
    title: 'Not Found',
    status: 404,
    traceId: TRACE_ID,
  })
}
