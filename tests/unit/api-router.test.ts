import { describe, expect, it } from 'vitest'
import { handleApiRequest } from '#/server/api/router.ts'

describe('API útvonalválasztás', () => {
  it('a záró perjeleket figyelmen kívül hagyja', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/health/live///'),
    )
    expect(response.status).toBe(200)
  })

  it('a hosszú perjelsorozatot tartalmazó útvonalat is gyorsan elutasítja', async () => {
    const started = performance.now()
    const response = await handleApiRequest(
      new Request(`http://localhost/api/${'/'.repeat(100_000)}a`),
    )
    expect(response.status).toBe(404)
    expect(performance.now() - started).toBeLessThan(500)
  })
})
