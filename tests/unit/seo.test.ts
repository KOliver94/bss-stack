import { describe, expect, it } from 'vitest'
import { pagedPath, toMetaDescription } from '#/lib/seo.ts'

describe('SEO segédfüggvények', () => {
  it('a leírást egy sorba vonja, és szóhatáron vágja', () => {
    expect(toMetaDescription('  Első sor\n\nmásodik   sor ')).toBe(
      'Első sor második sor',
    )
    const long = 'szó '.repeat(60)
    const description = toMetaDescription(long)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description.endsWith('szó…')).toBe(true)
    expect(toMetaDescription(null)).toBe('')
  })

  it('az első oldal kanonikus útvonala nem kap page paramétert', () => {
    expect(pagedPath('/events', undefined)).toBe('/events')
    expect(pagedPath('/events', '1')).toBe('/events')
    expect(pagedPath('/events', 'abc')).toBe('/events')
  })

  it('a további oldalak a router formátumában tartják meg a page paramétert', () => {
    expect(pagedPath('/events', '2')).toBe('/events?page=%222%22')
    expect(pagedPath('/members/alumni', 3)).toBe('/members/alumni?page=3')
  })
})
