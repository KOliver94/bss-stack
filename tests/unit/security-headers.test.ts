import { describe, expect, it } from 'vitest'
import {
  contentSecurityPolicy,
  robotsTxt,
  securityHeaders,
  withSecurityHeaders,
} from '#/server/http/security-headers.ts'
import { TEST_MEDIA_HOST } from '../helpers/oob-config.ts'

describe('BSS-035: biztonsági fejlécek és CSP', () => {
  it('a CSP engedi a média hostot és a YouTube nocookie framet', () => {
    const csp = contentSecurityPolicy(TEST_MEDIA_HOST)
    expect(csp).toContain("media-src 'self' https://v.bsstudio.hu")
    expect(csp).toContain('https://www.youtube-nocookie.com')
    expect(csp).toMatch(/frame-src [^;]*https:\/\/www\.google\.com/)
    expect(csp).toMatch(/img-src [^;]*https:\/\/backstage\.bsstudio\.hu/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('minden alapbiztonsági header jelen van', () => {
    const headers = securityHeaders(TEST_MEDIA_HOST)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['content-security-policy']).toContain('default-src')
  })

  it('a válasz saját fejléceit megtartja, a hiányzó biztonsági fejléceket hozzáadja', async () => {
    const response = withSecurityHeaders(
      new Response('<urlset/>', {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'x-frame-options': 'SAMEORIGIN',
        },
      }),
      TEST_MEDIA_HOST,
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<urlset/>')
    expect(response.headers.get('content-type')).toBe(
      'application/xml; charset=utf-8',
    )
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    )
  })

  it('a robots.txt tiltja az admin, api és keresés útvonalakat, és mutatja a sitemapet', () => {
    const robots = robotsTxt('http://localhost:3000')
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Disallow: /api')
    expect(robots).toContain('Disallow: /search')
    expect(robots).toContain('Sitemap: http://localhost:3000/sitemap.xml')
  })
})
