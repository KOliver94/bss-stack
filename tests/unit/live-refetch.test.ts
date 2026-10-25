import { describe, expect, it } from 'vitest'
import { liveRefetchInterval } from '#/lib/live-refetch.ts'

describe('liveRefetchInterval', () => {
  const now = Date.parse('2026-10-25T18:00:00.000Z')

  it('percenként frissít, ha nincs közeli live', () => {
    expect(liveRefetchInterval(null, now)).toBe(60_000)
    expect(liveRefetchInterval('2026-10-25T20:00:00.000Z', now)).toBe(60_000)
  })

  it('a kezdési idő után azonnal frissít', () => {
    expect(liveRefetchInterval('2026-10-25T18:00:20.000Z', now)).toBe(21_000)
  })

  it('már elmúlt kezdésnél visszaáll a percenkénti frissítésre', () => {
    expect(liveRefetchInterval('2026-10-25T17:59:00.000Z', now)).toBe(60_000)
  })
})
