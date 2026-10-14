import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { sanitizeReturnTo } from '#/lib/return-to.ts'
import { SITE_NAME } from '#/lib/seo.ts'

const VIEWER_QUERY = {
  queryKey: ['viewer'],
  queryFn: fetchViewerState,
  staleTime: 60_000,
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search['returnTo'] === 'string'
      ? { returnTo: sanitizeReturnTo(search['returnTo']) }
      : {},
  loaderDeps: ({ search }) => ({ returnTo: search.returnTo ?? '/' }),
  loader: async ({ context, deps }) => {
    const viewer = await context.queryClient.ensureQueryData(VIEWER_QUERY)
    if (viewer.loggedIn) {
      throw redirect({ href: deps.returnTo })
    }
  },
  head: () => ({
    meta: [
      { title: `Belépés | ${SITE_NAME}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: LoginPage,
})

function LoginPage() {
  const { returnTo = '/' } = Route.useSearch()
  const authschEnabled =
    useQuery(VIEWER_QUERY).data?.authschLoginEnabled ?? false
  const returnToParam = `?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-(--darker-blue) px-6 py-12 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Belépés</h1>
        <p className="mt-3 text-white/70">Válaszd ki, hogyan lépsz be.</p>
      </div>

      <div className="grid w-full max-w-2xl gap-6 sm:grid-cols-2">
        <ProviderButton
          href={`/api/auth/login${returnToParam}`}
          logoSrc="/bss-navbar-logo.svg"
          logoAlt="Budavári Schönherz Stúdió"
          title="BSS tagoknak"
          caption="Stúdiós fiókkal"
        />
        <ProviderButton
          href={
            authschEnabled ? `/api/auth/authsch/login${returnToParam}` : null
          }
          logoSrc="/partners/schonherz.svg"
          logoAlt="Schönherz"
          title="AuthSch"
          caption={authschEnabled ? 'Vagy BME címtár' : 'Jelenleg nem elérhető'}
        />
      </div>

      <a href={returnTo} className="nav-link text-sm text-white/70">
        ← Vissza az oldalra
      </a>
    </main>
  )
}

function ProviderButton({
  href,
  logoSrc,
  logoAlt,
  title,
  caption,
}: {
  href: string | null
  logoSrc: string
  logoAlt: string
  title: string
  caption: string
}) {
  const content = (
    <>
      <span className="flex h-24 items-center justify-center">
        <img src={logoSrc} alt={logoAlt} className="h-16 w-auto" />
      </span>
      <span className="block text-xl font-bold">{title}</span>
      <span className="block text-sm text-white/70">{caption}</span>
    </>
  )
  const base =
    'flex flex-col items-center gap-2 rounded-lg border-2 px-6 py-8 text-center'

  if (href === null) {
    return (
      <div
        aria-disabled="true"
        className={`${base} border-white/10 opacity-50`}
      >
        {content}
      </div>
    )
  }
  return (
    <a
      href={href}
      className={`${base} border-white/20 bg-white/5 transition hover:-translate-y-0.5 hover:border-(--orange) hover:bg-white/10 focus-visible:border-(--orange)`}
    >
      {content}
    </a>
  )
}
