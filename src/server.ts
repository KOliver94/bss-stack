import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { handleApiRequest, API_PATH_PREFIXES } from '#/server/api/router.ts'
import { getRequestOrigin } from '#/server/api/http.ts'
import { startBackgroundRunner } from '#/server/jobs/runner.ts'
import type { BackgroundRunnerHandle } from '#/server/jobs/runner.ts'
import { securityHeaders, robotsTxt } from '#/server/http/security-headers.ts'
import { getSitemapEntries, sitemapXml } from '#/server/pages/sitemap.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { createLiveTransitionJob } from '#/server/homepage/live.ts'

const ssrHandler = createStartHandler(defaultStreamHandler)

// The background job runner starts only once. On error the application keeps
// running; the failure is logged and the next tick tries again.
let runnerHandle: BackgroundRunnerHandle | null = null

function ensureBackgroundRunner(): void {
  if (runnerHandle === null) {
    try {
      runnerHandle = startBackgroundRunner({}, [
        createLiveTransitionJob({ db: getDefaultDb }),
      ])
    } catch (error) {
      console.error('[jobs] A háttérfutató indítása nem sikerült:', error)
    }
  }
}

function isApiPath(pathname: string): boolean {
  return API_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

const DEV_ASSET_PREFIXES = ['/@', '/src/', '/node_modules/'] as const

function isDevAssetPath(pathname: string): boolean {
  return (
    import.meta.env.DEV &&
    DEV_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

/** Augmenting the SSR response (and everything else) with security headers. */
async function runWithSecurityHeaders(request: Request): Promise<Response> {
  const response = await ssrHandler(request)
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(securityHeaders())) {
    if (!headers.has(name)) {
      headers.set(name, value)
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url
    if (isDevAssetPath(pathname)) {
      // 404 → the request continues to the Vite dev middleware.
      return new Response(null, { status: 404 })
    }
    // Started by the first request of any kind, so scheduled lives go live
    // even if nobody touches the API after a restart.
    ensureBackgroundRunner()
    if (isApiPath(pathname)) {
      return handleApiRequest(request)
    }
    if (pathname === '/robots.txt') {
      return new Response(robotsTxt(getRequestOrigin(request)), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    if (pathname === '/sitemap.xml') {
      const db = await getDefaultDb()
      const entries = await getSitemapEntries(db)
      return new Response(sitemapXml(entries, getRequestOrigin(request)), {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=600',
        },
      })
    }
    return runWithSecurityHeaders(request)
  },
}
