import { and, asc, desc, eq, lte, ne, sql } from 'drizzle-orm'
import type { Clock } from '#/lib/clock.ts'
import { systemClock } from '#/lib/clock.ts'
import { can } from '#/server/auth/policy.ts'
import { ForbiddenError } from '#/server/auth/guards.ts'
import type { Viewer } from '#/server/auth/viewer.ts'
import { liveStreams } from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import { writeAudit } from '#/server/shared/write.ts'
import type { JobDefinition } from '#/server/jobs/runner.ts'
import { validateYoutubeVideo } from '#/server/media/youtube.ts'

export interface LiveDeps {
  viewer: Viewer
  clock?: Clock
  fetchImpl?: typeof fetch
}

function assertCanManageLive(viewer: Viewer): void {
  if (!can.manageLiveAndHighlight(viewer)) {
    throw new ForbiddenError('A live beállítások kezelése tagsági jog.')
  }
}

async function loadStream(executor: Executor, id: string) {
  const rows = await executor
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, id))
    .limit(1)
  return rows.at(0) ?? null
}

export interface CreateLiveInput {
  /** Any accepted YouTube URL form; gets normalized. */
  youtubeUrl: string
  startsAt: Date
}

async function normalizeYoutubeUrl(
  youtubeUrl: string,
  deps: LiveDeps,
): Promise<string> {
  const check = await validateYoutubeVideo(
    youtubeUrl,
    {
      oEmbedEndpoint: 'https://www.youtube.com/oembed',
    },
    { fetchImpl: deps.fetchImpl },
  )
  if (!check.ok || check.videoId === null) {
    throw new Error(check.problems.join(' '))
  }
  return check.videoId
}

export async function createLiveSchedule(
  executor: Executor,
  deps: LiveDeps,
  input: CreateLiveInput,
): Promise<typeof liveStreams.$inferSelect> {
  assertCanManageLive(deps.viewer)
  const youtubeVideoId = await normalizeYoutubeUrl(input.youtubeUrl, deps)

  const inserted = await executor
    .insert(liveStreams)
    .values({
      youtubeVideoId,
      startsAt: input.startsAt,
      status: 'scheduled',
      createdBy: deps.viewer.sub,
    })
    .returning()
  const row = inserted.at(0)
  if (row === undefined) {
    throw new Error('A live ütemezés mentése nem sikerült.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: row.id,
    action: 'create',
    before: null,
    after: snapshotLive(row),
    occurredAt: (deps.clock ?? systemClock).now(),
  })
  return row
}

function snapshotLive(
  row: typeof liveStreams.$inferSelect,
): Record<string, unknown> {
  return {
    youtubeVideoId: row.youtubeVideoId,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
  }
}

/** Edit a scheduled live (video and start time); a started or ended live can no longer be edited. */
export async function updateScheduledLive(
  executor: Executor,
  deps: LiveDeps,
  liveId: string,
  input: CreateLiveInput,
): Promise<typeof liveStreams.$inferSelect> {
  assertCanManageLive(deps.viewer)

  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }
  if (current.status !== 'scheduled') {
    throw new Error('Csak ütemezett live szerkeszthető.')
  }
  const youtubeVideoId = await normalizeYoutubeUrl(input.youtubeUrl, deps)

  const updated = await executor
    .update(liveStreams)
    .set({
      youtubeVideoId,
      startsAt: input.startsAt,
      activationError: null,
      updatedAt: (deps.clock ?? systemClock).now(),
    })
    .where(and(eq(liveStreams.id, liveId), eq(liveStreams.status, 'scheduled')))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new Error('A live ütemezés módosítása nem sikerült.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'update',
    before: snapshotLive(current),
    after: snapshotLive(row),
    occurredAt: (deps.clock ?? systemClock).now(),
  })
  return row
}

/**
 * Only one live can run at a time: when one starts, the previously running
 * one counts as ended at that moment.
 */
async function endSupersededLives(
  executor: Executor,
  options: { activeId: string; now: Date; actor: string },
): Promise<void> {
  const superseded = await executor
    .update(liveStreams)
    .set({ status: 'ended', endedAt: options.now, updatedAt: options.now })
    .where(
      and(
        eq(liveStreams.status, 'active'),
        ne(liveStreams.id, options.activeId),
      ),
    )
    .returning()
  for (const row of superseded) {
    await writeAudit(executor, {
      actor: options.actor,
      entityType: 'live_stream',
      entityId: row.id,
      action: 'end',
      before: { ...snapshotLive(row), status: 'active' },
      after: snapshotLive(row),
      occurredAt: options.now,
    })
  }
}

export async function startLiveNow(
  executor: Executor,
  deps: LiveDeps & { youtubeConfig?: { oEmbedEndpoint: string } },
  liveId: string,
): Promise<{ stream: typeof liveStreams.$inferSelect; activated: boolean }> {
  assertCanManageLive(deps.viewer)

  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }

  const check = await validateYoutubeVideo(
    `https://www.youtube.com/watch?v=${current.youtubeVideoId}`,
    deps.youtubeConfig ?? { oEmbedEndpoint: 'https://www.youtube.com/oembed' },
    { fetchImpl: deps.fetchImpl },
  )
  const now = (deps.clock ?? systemClock).now()
  if (!check.ok) {
    // Fallback allowed: the error is recorded and the live stays scheduled.
    const updated = await executor
      .update(liveStreams)
      .set({ activationError: check.problems.join(' '), updatedAt: now })
      .where(eq(liveStreams.id, liveId))
      .returning()
    const row = updated.at(0)
    if (row === undefined) {
      throw new Error('A live állapota nem frissíthető.')
    }
    await writeAudit(executor, {
      actor: deps.viewer.sub ?? '',
      entityType: 'live_stream',
      entityId: liveId,
      action: 'activation_failed',
      before: snapshotLive(current),
      after: { error: row.activationError },
      occurredAt: now,
    })
    return { stream: row, activated: false }
  }

  const updated = await executor
    .update(liveStreams)
    .set({
      status: 'active',
      startsAt: now,
      activatedAt: now,
      activationError: null,
      updatedAt: now,
    })
    .where(eq(liveStreams.id, liveId))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new Error('A live állapota nem frissíthető.')
  }
  await endSupersededLives(executor, {
    activeId: liveId,
    now,
    actor: deps.viewer.sub ?? '',
  })

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'activate',
    before: snapshotLive(current),
    after: snapshotLive(row),
    occurredAt: now,
  })
  return { stream: row, activated: true }
}

/** `End now`: the live immediately goes into the ended state; this is the only way a running live ends. */
export async function endLiveNow(
  executor: Executor,
  deps: LiveDeps,
  liveId: string,
): Promise<typeof liveStreams.$inferSelect> {
  assertCanManageLive(deps.viewer)

  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }

  const now = (deps.clock ?? systemClock).now()
  const updated = await executor
    .update(liveStreams)
    .set({ status: 'ended', endedAt: now, updatedAt: now })
    .where(eq(liveStreams.id, liveId))
    .returning()
  const row = updated.at(0)
  if (row === undefined) {
    throw new Error('A live állapota nem frissíthető.')
  }

  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'end',
    before: snapshotLive(current),
    after: snapshotLive(row),
    occurredAt: now,
  })
  return row
}

/** Delete a scheduled live; an active or ended one cannot be deleted. */
export async function deleteScheduledLive(
  executor: Executor,
  deps: LiveDeps,
  liveId: string,
): Promise<void> {
  assertCanManageLive(deps.viewer)
  const current = await loadStream(executor, liveId)
  if (current === null) {
    throw new Error('A live ütemezés nem található.')
  }
  if (current.status !== 'scheduled') {
    throw new Error('Csak ütemezett live törölhető.')
  }
  await executor.delete(liveStreams).where(eq(liveStreams.id, liveId))
  await writeAudit(executor, {
    actor: deps.viewer.sub ?? '',
    entityType: 'live_stream',
    entityId: liveId,
    action: 'delete',
    before: snapshotLive(current),
    after: null,
    occurredAt: (deps.clock ?? systemClock).now(),
  })
}

/** Activates due schedules; a running live is never ended automatically. */
export async function transitionLiveStates(
  executor: Executor,
  options: { now: Date },
): Promise<{ activated: number }> {
  let activated = 0

  const toActivate = await executor
    .select()
    .from(liveStreams)
    .where(
      and(
        sql`${liveStreams.status} = 'scheduled'`,
        lte(liveStreams.startsAt, options.now),
      ),
    )
    .orderBy(asc(liveStreams.startsAt))
  for (const stream of toActivate) {
    const updated = await executor
      .update(liveStreams)
      .set({
        status: 'active',
        activatedAt: options.now,
        updatedAt: options.now,
      })
      .where(
        and(eq(liveStreams.id, stream.id), eq(liveStreams.status, 'scheduled')),
      )
      .returning({ id: liveStreams.id })
    if (updated.length > 0) {
      activated += 1
      await endSupersededLives(executor, {
        activeId: stream.id,
        now: options.now,
        actor: 'system',
      })
      await writeAudit(executor, {
        actor: 'system',
        entityType: 'live_stream',
        entityId: stream.id,
        action: 'activate',
        before: snapshotLive(stream),
        after: { status: 'active' },
        occurredAt: options.now,
      })
    }
  }

  return { activated }
}

/** Admin history: every live, most recent first (never in the public archive). */

export function createLiveTransitionJob(deps: {
  clock?: Clock
  db: () => Promise<Executor>
}): JobDefinition {
  return {
    name: 'live-state-transitions',
    intervalMs: 60_000,
    run: async (ctx) => {
      const executor = await deps.db()
      await transitionLiveStates(executor, {
        now: (deps.clock ?? ctx.clock).now(),
      })
    },
  }
}

export async function listLiveHistory(
  executor: Executor,
  viewer: Viewer,
): Promise<Array<typeof liveStreams.$inferSelect>> {
  assertCanManageLive(viewer)
  return executor.select().from(liveStreams).orderBy(desc(liveStreams.startsAt))
}
