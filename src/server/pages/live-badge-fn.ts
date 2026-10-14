import { createServerFn } from '@tanstack/react-start'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { getActiveLive, getUpcomingLive } from '#/server/homepage/state.ts'
import { systemClock } from '#/lib/clock.ts'

/** Navbar logo badge: on air now, or a schedule starting within 24 hours. */
export type LiveBadgeDto =
  | { status: 'live' }
  | { status: 'upcoming'; startsAtIso: string }
  | { status: 'none' }

/**
 * The activation job runs once a minute, so a live stays `scheduled` for a
 * while after its start time; the badge keeps showing it in the meantime.
 */
const ACTIVATION_GRACE_MS = 5 * 60 * 1000

export const fetchLiveBadge = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LiveBadgeDto> => {
    const db = await getDefaultDb()
    const now = systemClock.now()
    if ((await getActiveLive(db, { now })) !== undefined) {
      return { status: 'live' }
    }
    const upcoming = await getUpcomingLive(db, {
      now,
      graceMs: ACTIVATION_GRACE_MS,
    })
    return upcoming === null
      ? { status: 'none' }
      : {
          status: 'upcoming',
          startsAtIso: upcoming.stream.startsAt.toISOString(),
        }
  },
)
