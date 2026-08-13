import { ApiError, fieldErrors, unclaimedErrors, ValidationError } from './problem'

function validation(errors: Record<string, string[]>): ValidationError {
  return new ValidationError({ status: 400, title: 'Invalid', errors })
}

describe('fieldErrors', () => {
  it.each([
    ['exact PascalCase, as DataAnnotations produces', { Title: ['required'] }, 'Title'],
    ['PascalCase key read with a camelCase field name', { Title: ['required'] }, 'title'],
    ['camelCase key read with a PascalCase field name', { title: ['required'] }, 'Title'],
    ['a JSON path, as a deserialization failure produces', { '$.dueDate': ['bad'] }, 'dueDate'],
    ['a JSON path read with different casing', { '$.dueDate': ['bad'] }, 'DueDate'],
  ])('resolves %s', (_label, errors, field) => {
    expect(fieldErrors(validation(errors), field)).toHaveLength(1)
  })

  it('collects messages from keys that differ only by casing', () => {
    const error = validation({ Title: ['too long'], title: ['also wrong'] })
    expect(fieldErrors(error, 'title')).toEqual(['too long', 'also wrong'])
  })

  it('returns nothing for an unrelated field', () => {
    expect(fieldErrors(validation({ Title: ['required'] }), 'description')).toEqual([])
  })

  it('returns nothing for a non-validation error', () => {
    expect(fieldErrors(new ApiError(500, { title: 'Boom' }), 'title')).toEqual([])
    expect(fieldErrors(new TypeError('Failed to fetch'), 'title')).toEqual([])
  })
})

describe('unclaimedErrors', () => {
  it('surfaces messages no rendered field claimed, so none can vanish silently', () => {
    const error = validation({ Name: ['required'], SomeRuleTheUiDoesNotModel: ['nope'] })
    expect(unclaimedErrors(error, ['name'])).toEqual(['nope'])
  })

  it('matches claimed fields case-insensitively', () => {
    const error = validation({ Name: ['required'] })
    expect(unclaimedErrors(error, ['NAME'])).toEqual([])
  })

  it('surfaces the empty-key messages that failure injection produces', () => {
    const error = validation({ '': ['Injected failure from the mock controls.'] })
    expect(unclaimedErrors(error, ['name', 'description'])).toHaveLength(1)
  })
})
