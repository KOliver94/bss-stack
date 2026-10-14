import type { Database } from '#/server/auth/session-store.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import type { OobConfig } from '#/server/config/oob-schema.ts'
import { jsonResponse, readJsonBody, runAdminHandler } from './http.ts'
import { requireAdmin, requireLeadership } from '#/server/auth/guards.ts'
import {
  createLiveSchedule,
  deleteScheduledLive,
  endLiveNow,
  startLiveNow,
  updateScheduledLive,
} from '#/server/homepage/live.ts'
import { ABOUT_VIDEO_LIMIT, setAboutVideos } from '#/server/homepage/about.ts'
import { setHighlightedVideo } from '#/server/homepage/highlight.ts'
import { videos } from '#/db/schema.ts'
import { and, eq, inArray } from 'drizzle-orm'
import { validateYoutubeVideo } from '#/server/media/youtube.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AdminHomepageRouteDeps {
  db?: Database
  clock?: Clock
  config?: OobConfig
  fetchImpl?: typeof fetch
}

function validation(problems: string[]): Response {
  return jsonResponse(400, { error: 'validation', problems })
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validation([`${field}: kötelező mező.`])
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw validation([`${field}: érvénytelen időpont.`])
  }
  return date
}

async function databaseOf(deps: AdminHomepageRouteDeps): Promise<Database> {
  return deps.db ?? (await getDefaultDb())
}

/** Only published + public videos can be selected as highlight or for About. */
async function assertSelectableVideos(
  database: Database,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return
  const rows = await database
    .select({ id: videos.id })
    .from(videos)
    .where(
      and(
        inArray(videos.id, [...ids]),
        eq(videos.status, 'published'),
        eq(videos.visibility, 'public'),
      ),
    )
  if (rows.length !== new Set(ids).size) {
    throw validation([
      'Csak publikált, publikus videó választható (a lista tartalmaz érvénytelen elemet).',
    ])
  }
}

export async function handleAdminHighlightRoute(
  request: Request,
  deps: AdminHomepageRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    requireAdmin(viewer, new URL(request.url).pathname)
    const body = await readJsonBody(request)
    let videoId: string | null = null
    if (body['videoId'] !== null && body['videoId'] !== undefined) {
      if (
        typeof body['videoId'] !== 'string' ||
        !UUID_PATTERN.test(body['videoId'])
      ) {
        throw validation(['Érvénytelen videóazonosító.'])
      }
      videoId = body['videoId']
      // Early Hungarian error message; the domain re-checks in a transaction.
      await assertSelectableVideos(await databaseOf(deps), [videoId])
    }
    await setHighlightedVideo(await databaseOf(deps), {
      viewer,
      videoId,
      clock: deps.clock,
    })
    return jsonResponse(200, { ok: true })
  })
}

const LIVE_ACTION_PATTERN = /^(update|start_now|end_now|delete)$/

/** Live create/edit body; the YouTube URL is checked early with a Hungarian message (oEmbed), the domain re-checks it on save. */
async function readLiveInput(
  request: Request,
  deps: AdminHomepageRouteDeps,
): Promise<{ youtubeUrl: string; startsAt: Date }> {
  const body = await readJsonBody(request)
  const youtubeUrl =
    typeof body['youtubeUrl'] === 'string' ? body['youtubeUrl'] : ''
  const startsAt = parseDate(body['startsAt'], 'Kezdési idő')
  const youtubeCheck = await validateYoutubeVideo(
    youtubeUrl,
    {
      oEmbedEndpoint:
        deps.config?.youtube.oEmbedEndpoint ?? 'https://www.youtube.com/oembed',
    },
    { fetchImpl: deps.fetchImpl },
  )
  if (!youtubeCheck.ok || youtubeCheck.videoId === null) {
    throw validation(youtubeCheck.problems)
  }
  return { youtubeUrl, startsAt }
}

export async function handleAdminLiveRoutes(
  request: Request,
  id: string | undefined,
  action: string | undefined,
  deps: AdminHomepageRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    requireAdmin(viewer, new URL(request.url).pathname)
    const liveDeps = {
      viewer,
      clock: deps.clock ?? systemClock,
      fetchImpl: deps.fetchImpl,
    }
    const database = await databaseOf(deps)

    if (action === undefined) {
      const input = await readLiveInput(request, deps)
      const row = await createLiveSchedule(database, liveDeps, input)
      return jsonResponse(200, { ok: true, id: row.id })
    }

    if (id === undefined || !UUID_PATTERN.test(id)) {
      throw validation(['Érvénytelen live azonosító.'])
    }
    if (!LIVE_ACTION_PATTERN.test(action)) {
      return jsonResponse(404, { error: 'not_found' })
    }
    switch (action) {
      case 'update': {
        const input = await readLiveInput(request, deps)
        await updateScheduledLive(database, liveDeps, id, input)
        return jsonResponse(200, { ok: true })
      }
      case 'start_now': {
        const result = await startLiveNow(database, liveDeps, id)
        return jsonResponse(200, { ok: true, activated: result.activated })
      }
      case 'end_now': {
        await endLiveNow(database, liveDeps, id)
        return jsonResponse(200, { ok: true })
      }
      default: {
        await deleteScheduledLive(database, liveDeps, id)
        return jsonResponse(200, { ok: true })
      }
    }
  })
}

export async function handleAdminAboutRoute(
  request: Request,
  deps: AdminHomepageRouteDeps = {},
): Promise<Response> {
  return runAdminHandler(request, deps, async (viewer) => {
    requireLeadership(viewer)
    const body = await readJsonBody(request)
    const orderedVideoIds = Array.isArray(body['orderedVideoIds'])
      ? body['orderedVideoIds'].filter(
          (item): item is string => typeof item === 'string',
        )
      : []
    if (orderedVideoIds.length > ABOUT_VIDEO_LIMIT) {
      throw validation([
        `Legfeljebb ${ABOUT_VIDEO_LIMIT} videó helyezhető a Rólunk oldalra.`,
      ])
    }
    for (const id of orderedVideoIds) {
      if (!UUID_PATTERN.test(id)) {
        throw validation(['Érvénytelen videóazonosító a listában.'])
      }
    }
    // Early Hungarian error message, also for invalid entries.
    await assertSelectableVideos(await databaseOf(deps), orderedVideoIds)

    await setAboutVideos(await databaseOf(deps), {
      viewer,
      orderedVideoIds,
      clock: deps.clock,
    })
    return jsonResponse(200, { ok: true })
  })
}
