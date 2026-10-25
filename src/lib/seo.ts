import type { ComponentProps } from 'react'
import { defaultStringifySearch } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getRequestOrigin } from '#/server/api/http.ts'

export const SITE_NAME = 'Budavári Schönherz Stúdió'

export const DEFAULT_DESCRIPTION =
  'A Budavári Schönherz Stúdió a BME Schönherz Kollégium öntevékeny köre: videókat készítünk az egyetemi életről, rendezvényekről és a kollégium közösségéről.'

const DEFAULT_IMAGE: PageSeoImage = {
  url: '/og-default.png',
  width: 1200,
  height: 630,
}

const DESCRIPTION_MAX_LENGTH = 160

/**
 * The public origin of the site. On the server it honours the reverse proxy's
 * forwarded headers (like the OIDC callback does), so canonical URLs never
 * point at the internal host or plain http.
 */
export const getSiteOrigin = createIsomorphicFn()
  .server(() => getRequestOrigin(getRequest()))
  .client(() => window.location.origin)

export function toMetaDescription(text: string | null | undefined): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= DESCRIPTION_MAX_LENGTH) {
    return normalized
  }
  const cut = normalized.slice(0, DESCRIPTION_MAX_LENGTH - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

export function pagedPath(path: string, page: number | string | undefined) {
  const pageNumber = Number(page)
  return Number.isInteger(pageNumber) && pageNumber > 1
    ? `${path}${defaultStringifySearch({ page })}`
    : path
}

export interface PageSeoImage {
  url: string
  width?: number
  height?: number
}

export interface PageSeo {
  /** Page title without the site name; omitted on the homepage. */
  title?: string
  description?: string | null
  /** Canonical path, starting with `/`. */
  path: string
  image?: string | PageSeoImage | null
  type?: 'website' | 'profile'
  twitterCard?: 'summary' | 'summary_large_image'
  jsonLd?: Array<Record<string, unknown>>
}

type MetaTag = ComponentProps<'meta'>

function jsonLdTag(data: Record<string, unknown>): MetaTag {
  return { 'script:ld+json': data } as unknown as MetaTag
}

export function pageHead(seo: PageSeo) {
  const origin = getSiteOrigin()
  const url = `${origin}${seo.path}`
  const title =
    seo.title === undefined ? SITE_NAME : `${seo.title} | ${SITE_NAME}`
  const description =
    toMetaDescription(seo.description) || toMetaDescription(DEFAULT_DESCRIPTION)
  const image =
    typeof seo.image === 'string'
      ? { url: seo.image }
      : (seo.image ?? DEFAULT_IMAGE)
  const imageUrl = new URL(image.url, origin).href

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:locale', content: 'hu_HU' },
      { property: 'og:type', content: seo.type ?? 'website' },
      { property: 'og:title', content: seo.title ?? SITE_NAME },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: imageUrl },
      ...(image.width !== undefined && image.height !== undefined
        ? [
            { property: 'og:image:width', content: String(image.width) },
            { property: 'og:image:height', content: String(image.height) },
          ]
        : []),
      { property: 'og:image:alt', content: seo.title ?? SITE_NAME },
      {
        name: 'twitter:card',
        content: seo.twitterCard ?? 'summary_large_image',
      },
      ...(seo.jsonLd ?? []).map(jsonLdTag),
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

/** For pages that must stay out of search results (admin, search). */
export function noindexHead(title: string) {
  return {
    meta: [
      { title: `${title} | ${SITE_NAME}` },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }
}
