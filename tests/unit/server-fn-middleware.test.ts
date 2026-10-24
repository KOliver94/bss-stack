import { describe, expect, it, vi } from 'vitest'
import type { Viewer } from '#/server/auth/viewer.ts'
import { AuthRequiredError, ForbiddenError } from '#/server/auth/guards.ts'
import {
  adminFnMiddleware,
  leadershipFnMiddleware,
} from '#/server/pages/admin/access-fn.ts'

// A kérésből feloldott nézőt az integrációs teszt valódi sessionnel
// ellenőrzi; itt csak az a kérdés, melyik guardot futtatja a middleware.
const resolved = vi.hoisted((): { level: Viewer['level'] } => ({
  level: 'anonymous',
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('http://localhost/_serverFn/admin-fn'),
}))

vi.mock('#/server/pages/viewer.ts', () => ({
  resolveViewerStateFromRequest: () =>
    Promise.resolve({
      viewer: {
        level: resolved.level,
        sub: resolved.level === 'anonymous' ? null : `sub-${resolved.level}`,
        username: null,
      },
      loggedIn: resolved.level !== 'anonymous',
    }),
}))

type ServerMiddleware = (ctx: {
  next: () => Promise<unknown>
}) => Promise<unknown>

function run(
  middleware: { options: { server?: unknown } },
  level: Viewer['level'],
) {
  resolved.level = level
  const next = vi.fn(() => Promise.resolve('tovább'))
  const result = (middleware.options.server as ServerMiddleware)({ next })
  return { result, next }
}

describe('Szerverfüggvény-guard middleware-ek', () => {
  it('adminFnMiddleware: a tagot továbbengedi, a névtelent és a schönherzest nem', async () => {
    for (const level of ['member', 'leadership'] as const) {
      const { result, next } = run(adminFnMiddleware, level)
      await expect(result, level).resolves.toBe('tovább')
      expect(next, level).toHaveBeenCalledOnce()
    }

    const anonymous = run(adminFnMiddleware, 'anonymous')
    await expect(anonymous.result).rejects.toBeInstanceOf(AuthRequiredError)
    expect(anonymous.next).not.toHaveBeenCalled()

    const schonherz = run(adminFnMiddleware, 'schonherz')
    await expect(schonherz.result).rejects.toBeInstanceOf(ForbiddenError)
    expect(schonherz.next).not.toHaveBeenCalled()
  })

  it('leadershipFnMiddleware: csak a vezetőséget engedi tovább, a sima tagot sem', async () => {
    const leadership = run(leadershipFnMiddleware, 'leadership')
    await expect(leadership.result).resolves.toBe('tovább')
    expect(leadership.next).toHaveBeenCalledOnce()

    const anonymous = run(leadershipFnMiddleware, 'anonymous')
    await expect(anonymous.result).rejects.toBeInstanceOf(AuthRequiredError)
    expect(anonymous.next).not.toHaveBeenCalled()

    for (const level of ['schonherz', 'member'] as const) {
      const { result, next } = run(leadershipFnMiddleware, level)
      await expect(result, level).rejects.toBeInstanceOf(ForbiddenError)
      expect(next, level).not.toHaveBeenCalled()
    }
  })
})
