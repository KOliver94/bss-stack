/**
 * Server function input is whatever JSON the caller sends; the TypeScript
 * signature only describes what our own pages pass. These checks accept the
 * expected shape and reject everything else.
 */
export class InvalidInputError extends Error {
  constructor() {
    super('Érvénytelen kérés.')
    this.name = 'InvalidInputError'
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A plain object; a missing input counts as an empty one. */
export function recordInput(input: unknown): Record<string, unknown> {
  if (input === undefined) {
    return {}
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidInputError()
  }
  return input as Record<string, unknown>
}

export function stringInput(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidInputError()
  }
  return value
}

export function optionalStringInput(value: unknown): string | undefined {
  return value === undefined ? undefined : stringInput(value)
}

/** Range checks are left to the page functions, which fall back to defaults. */
export function optionalNumberInput(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number') {
    throw new InvalidInputError()
  }
  return value
}

export function integerInput(value: unknown, min: number, max: number): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new InvalidInputError()
  }
  return value as number
}

/** `{ id }` addressing one row by its UUID primary key. */
export function idInput(input: unknown): { id: string } {
  const id = stringInput(recordInput(input)['id'])
  if (!UUID_PATTERN.test(id)) {
    throw new InvalidInputError()
  }
  return { id }
}

/** A URL search parameter: the router's serializer yields text or a number. */
export function searchValueInput(value: unknown): string | number | undefined {
  if (
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return value
  }
  throw new InvalidInputError()
}

export function searchInput(
  input: unknown,
): Record<string, string | number | undefined> {
  const record = recordInput(input)
  Object.values(record).forEach(searchValueInput)
  return record as Record<string, string | number | undefined>
}
