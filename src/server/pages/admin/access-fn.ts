import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  requireAdminViewer,
  requireLeadershipViewer,
} from '#/server/api/admin/http.ts'
import { resolveViewerStateFromRequest } from '#/server/pages/viewer.ts'
import { recordInput, stringInput } from '#/server/shared/server-fn-input.ts'
import { sanitizeReturnTo } from '#/lib/return-to.ts'
import { adminAreaAccess } from './access.ts'

/**
 * Every server function is a public HTTP endpoint of its own, whichever route
 * calls it, so privileged ones check the caller here; route guards only steer
 * navigation.
 */
export const adminFnMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    await requireAdminViewer(getRequest())
    return next()
  },
)

export const leadershipFnMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  await requireLeadershipViewer(getRequest())
  return next()
})

export interface AdminAccessDto {
  kind: 'ok' | 'login' | 'forbidden'
  loginUrl?: string
  viewer?: { level: string; sub: string | null; username: string | null }
}

/**
 * The page passes its own path as `returnTo`: on a client-side navigation the
 * request URL is this function's endpoint, not the page.
 */
export const fetchAdminAreaAccess = createServerFn({ method: 'GET' })
  .validator((input: { returnTo: string }) => ({
    returnTo: sanitizeReturnTo(stringInput(recordInput(input)['returnTo'])),
  }))
  .handler(async ({ data }): Promise<AdminAccessDto> => {
    return toDto(
      adminAreaAccess(
        (await resolveViewerStateFromRequest(getRequest())).viewer,
        data.returnTo,
      ),
    )
  })

function toDto(access: ReturnType<typeof adminAreaAccess>): AdminAccessDto {
  if (access.kind === 'login') {
    return { kind: 'login', loginUrl: access.loginUrl }
  }
  if (access.kind === 'forbidden') {
    return { kind: 'forbidden' }
  }
  return {
    kind: 'ok',
    viewer: {
      level: access.viewer.level,
      sub: access.viewer.sub,
      username: access.viewer.username,
    },
  }
}
