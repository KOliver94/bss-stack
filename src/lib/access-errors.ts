/**
 * A server function's error reaches the client as a plain `Error` that keeps
 * its `name` and own fields, so the guard errors are recognised by name.
 */
function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined
}

/** Missing access doesn't go away on a retry. */
export function isAccessError(error: unknown): boolean {
  const name = errorName(error)
  return name === 'AuthRequiredError' || name === 'ForbiddenError'
}

/** The login URL of an expired or missing session, if that's the failure. */
export function loginUrlFromError(error: unknown): string | undefined {
  if (errorName(error) !== 'AuthRequiredError') {
    return undefined
  }
  const loginUrl = (error as { loginUrl?: unknown }).loginUrl
  return typeof loginUrl === 'string' ? loginUrl : undefined
}
