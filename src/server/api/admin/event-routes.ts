import type { OobConfig } from '#/server/config/oob-schema.ts'
import { getCachedOobConfig } from '#/server/config/load.ts'
import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { requireAdmin } from '#/server/auth/guards.ts'
import {
  archiveEvent,
  createEvent,
  permanentlyDeleteEvent,
  publishEvent,
  setEventStaff,
  updateEvent,
} from '#/server/events/domain.ts'
import { jsonResponse, readJsonBody, runAdminHandler } from './http.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AdminEventRouteDeps {
  db?: Database
  config?: OobConfig
  clock?: Clock
  fetchImpl?: typeof fetch
}

function parseVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw jsonResponse(400, {
      error: 'bad_request',
      message: 'A verziószám (version) kötelező pozitív egész szám.',
    })
  }
  return value
}

export async function handleAdminEventRoutes(
  request: Request,
  action: string,
  id: string | undefined,
  deps: AdminEventRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    requireAdmin(viewer, new URL(request.url).pathname)
    const database = deps.db ?? (await getDefaultDb())
    const config = deps.config ?? getCachedOobConfig()
    const domainDeps = {
      viewer,
      clock: deps.clock ?? systemClock,
      mediaConfig: config.media,
      fetchImpl: deps.fetchImpl,
    }

    if (action === 'create' && id === undefined) {
      const body = await readJsonBody(request)
      const row = await createEvent(database, domainDeps, {
        title: typeof body['title'] === 'string' ? body['title'] : '',
        description: optionalNullableString(body['description']),
        thumbnailUrl: optionalNullableString(body['thumbnailUrl']),
        startDate: optionalNullableString(body['startDate']),
        endDate: optionalNullableString(body['endDate']),
      })
      return jsonResponse(200, { ok: true, id: row.id, slug: row.slug })
    }

    if (id === undefined || !UUID_PATTERN.test(id)) {
      return jsonResponse(400, {
        error: 'bad_request',
        message: 'Érvénytelen eseményazonosító.',
      })
    }
    const body = await readJsonBody(request)

    switch (action) {
      case 'update': {
        const row = await updateEvent(
          database,
          domainDeps,
          id,
          parseVersion(body['version']),
          {
            title: optionalString(body['title']),
            description: optionalNullableString(body['description']),
            thumbnailUrl: optionalNullableString(body['thumbnailUrl']),
            startDate: optionalNullableString(body['startDate']),
            endDate: optionalNullableString(body['endDate']),
            slug: optionalString(body['slug']),
          },
        )
        return jsonResponse(200, {
          ok: true,
          version: row.version,
          slug: row.slug,
        })
      }
      case 'publish': {
        const row = await publishEvent(
          database,
          domainDeps,
          id,
          parseVersion(body['version']),
        )
        return jsonResponse(200, { ok: true, version: row.version })
      }
      case 'archive': {
        const row = await archiveEvent(
          database,
          domainDeps,
          id,
          parseVersion(body['version']),
        )
        return jsonResponse(200, { ok: true, version: row.version })
      }
      case 'staff': {
        const rawAssignments = body['assignments']
        if (!Array.isArray(rawAssignments)) {
          return jsonResponse(400, {
            error: 'bad_request',
            message: 'A stáblista (assignments) lista kell legyen.',
          })
        }
        const assignments = []
        for (const entry of rawAssignments) {
          if (
            entry === null ||
            typeof entry !== 'object' ||
            typeof (entry as Record<string, unknown>)['roleId'] !== 'string' ||
            typeof (entry as Record<string, unknown>)['memberSub'] !== 'string'
          ) {
            return jsonResponse(400, {
              error: 'bad_request',
              message:
                'Minden stábbetetésnek roleId és memberSub mezője kell legyen.',
            })
          }
          assignments.push({
            roleId: (entry as Record<string, string>)['roleId'],
            memberSub: (entry as Record<string, string>)['memberSub'],
          })
        }
        const row = await setEventStaff(
          database,
          domainDeps,
          id,
          parseVersion(body['version']),
          assignments,
        )
        return jsonResponse(200, { ok: true, version: row.version })
      }
      case 'delete_permanent': {
        const result = await permanentlyDeleteEvent(
          database,
          domainDeps,
          id,
          typeof body['confirmationTitle'] === 'string'
            ? body['confirmationTitle']
            : '',
        )
        return jsonResponse(200, {
          ok: true,
          detachedVideoCount: result.detachedVideoIds.length,
        })
      }
      default:
        return jsonResponse(404, { error: 'not_found' })
    }
  })
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}
