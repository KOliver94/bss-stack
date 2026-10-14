import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getAboutPageVideos } from '#/server/homepage/about.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { videoAssetUrls } from '#/server/media/video-media.ts'
import { pageHead } from '#/lib/seo.ts'
import { ThumbnailGridSkeleton } from '#/components/PageStates.tsx'
import Thumbnail from '#/components/Thumbnail.tsx'

const ABOUT_TEXT_VERSION = 1

const ABOUT_TEXT = `A Budavári Schönherz Stúdió a BME Schönherz Kollégium öntevékeny köre.
Videókat készítünk az egyetemi életről, rendezvényeinkről és a kollégium közösségéről.
Tagjaink operatőri, vágói és riporteri gyakorlatot szereznek, miközben együtt dolgozunk a
legjobb egyetemi videótartalmakon.`

const ABOUT_GRID_CLASS =
  'mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

const ABOUT_THUMBNAIL_SIZES =
  '(min-width: 1024px) min(calc((100vw - 5rem) / 3), 502px), (min-width: 640px) calc((100vw - 4rem) / 2), calc(100vw - 2rem)'

const loadAboutPage = createServerFn({ method: 'GET' }).handler(async () => {
  const db = await getDefaultDb()
  const aboutVideos = await getAboutPageVideos(db)
  return aboutVideos.map((video) => {
    const { thumbnailUrl, keyframeUrl } = videoAssetUrls(video)
    return {
      id: video.id,
      slug: video.slug,
      title: video.title,
      thumbnailUrl,
      keyframeUrl,
    }
  })
})

export const Route = createFileRoute('/about')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['about-page'],
      queryFn: loadAboutPage,
      staleTime: 60_000,
    }),
  head: ({ loaderData }) =>
    pageHead({
      title: 'Rólunk',
      description: ABOUT_TEXT,
      path: '/about',
      image: loaderData?.at(0)?.thumbnailUrl,
    }),
  component: AboutPage,
  pendingComponent: AboutPageSkeleton,
})

function AboutIntro() {
  return (
    <>
      <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">
        Mivel foglalkozunk?
      </h1>
      <div className="whitespace-pre-line text-lg text-(--bss-text-secondary)">
        {ABOUT_TEXT}
      </div>
    </>
  )
}

/** Placeholder for the about page: the static intro plus one row of cards. */
function AboutPageSkeleton() {
  return (
    <main className="site-width my-[4dvh]">
      <AboutIntro />
      <section className="mt-10">
        <h2 className="text-2xl font-bold text-(--bss-text)">
          Válogatott videóink
        </h2>
        <ThumbnailGridSkeleton
          count={3}
          className={ABOUT_GRID_CLASS}
          label="Videók betöltése…"
        />
      </section>
    </main>
  )
}

function AboutPage() {
  const videos = Route.useLoaderData()

  return (
    <main className="site-width my-[4dvh]">
      <AboutIntro />

      {videos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-(--bss-text)">
            Válogatott videóink
          </h2>
          <div className={ABOUT_GRID_CLASS}>
            {videos.map((video) => (
              <Link
                key={video.id}
                to="/videos/$slug"
                params={{ slug: video.slug }}
                className="group card-surface hover-lift block shadow-[0px_2px_6px_0_rgba(0,0,0,0.25)]"
              >
                <Thumbnail
                  src={video.thumbnailUrl}
                  largeSrc={video.keyframeUrl}
                  sizes={ABOUT_THUMBNAIL_SIZES}
                  alt={video.title}
                />
                <span className="block truncate px-2 py-1 text-(--bss-text-secondary) group-hover:text-(--orange)">
                  {video.title}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

export { ABOUT_TEXT_VERSION }
