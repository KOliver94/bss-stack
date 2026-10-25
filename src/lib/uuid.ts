const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Primary keys are UUIDs; anything else can't address a row. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}
