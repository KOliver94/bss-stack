const POLL_MS = 60_000

/**
 * Polling interval for live-dependent data: once a minute, but when a
 * scheduled live starts sooner, right after its start time so it shows up
 * on time instead of up to a minute late.
 */
export function liveRefetchInterval(
  startsAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (startsAtIso === null || startsAtIso === undefined) {
    return POLL_MS
  }
  const untilStart = new Date(startsAtIso).getTime() - nowMs
  if (Number.isNaN(untilStart) || untilStart < 0) {
    return POLL_MS
  }
  return Math.min(POLL_MS, untilStart + 1_000)
}
