import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupAdminApiTest, testConfig } from '../helpers/admin-api.ts'
import type { AdminTestContext } from '../helpers/admin-api.ts'
import {
  requireAdminViewer,
  requireLeadershipViewer,
} from '#/server/api/admin/http.ts'
import { AuthRequiredError, ForbiddenError } from '#/server/auth/guards.ts'
import { SESSION_COOKIE_NAME } from '#/server/auth/session-cookies.ts'

const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL)

afterAll(async () => {
  const { dropAll } = await import('../helpers/admin-api.ts')
  if (hasTestDatabase) {
    await dropAll()
  }
})

/** Közvetlen hívás a szerverfüggvény saját URL-jére, oldalbetöltés nélkül. */
function serverFnRequest(token: string | null): Request {
  return new Request('http://localhost/_serverFn/admin-fn', {
    headers:
      token !== null ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  })
}

describe.skipIf(!hasTestDatabase)(
  'Admin szerverfüggvények guardja valódi sessionnel',
  () => {
    let ctx: AdminTestContext
    let deps: Parameters<typeof requireAdminViewer>[1]

    beforeAll(async () => {
      ctx = await setupAdminApiTest('bss_fnguard')
      deps = { db: ctx.db, config: testConfig }
    })

    it('admin szint: a névtelen és a schönherzes hívót elutasítja, a tagot átengedi', async () => {
      await expect(
        requireAdminViewer(serverFnRequest(null), deps),
      ).rejects.toBeInstanceOf(AuthRequiredError)
      await expect(
        requireAdminViewer(serverFnRequest('kitalalt-token'), deps),
      ).rejects.toBeInstanceOf(AuthRequiredError)
      await expect(
        requireAdminViewer(serverFnRequest(ctx.schonherzToken), deps),
      ).rejects.toBeInstanceOf(ForbiddenError)

      await expect(
        requireAdminViewer(serverFnRequest(ctx.memberToken), deps),
      ).resolves.toMatchObject({ level: 'member' })
      await expect(
        requireAdminViewer(serverFnRequest(ctx.leadershipToken), deps),
      ).resolves.toMatchObject({ level: 'leadership' })
    })

    it('vezetőségi szint: a névtelen hívót és a sima tagot elutasítja, a vezetőséget átengedi', async () => {
      await expect(
        requireLeadershipViewer(serverFnRequest(null), deps),
      ).rejects.toBeInstanceOf(AuthRequiredError)
      await expect(
        requireLeadershipViewer(serverFnRequest(ctx.schonherzToken), deps),
      ).rejects.toBeInstanceOf(ForbiddenError)
      await expect(
        requireLeadershipViewer(serverFnRequest(ctx.memberToken), deps),
      ).rejects.toBeInstanceOf(ForbiddenError)

      await expect(
        requireLeadershipViewer(serverFnRequest(ctx.leadershipToken), deps),
      ).resolves.toMatchObject({ level: 'leadership' })
    })
  },
)
