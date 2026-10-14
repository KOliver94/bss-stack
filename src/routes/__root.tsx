import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import Footer from '../components/Footer'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import Navbar from '#/components/Navbar.tsx'
import { ErrorState, NotFoundContent } from '#/components/PageStates.tsx'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { SITE_NAME } from '#/lib/seo.ts'

interface MyRouterContext {
  queryClient: QueryClient
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        // Fallback only: a page's own `head` title replaces it.
        title: SITE_NAME,
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
        type: 'image/x-icon',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  // The navbar's login state is needed on every page: load it once.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['viewer'],
      queryFn: fetchViewerState,
      staleTime: 60_000,
    }),
  notFoundComponent: NotFoundContent,
  errorComponent: () => <ErrorState />,
  shellComponent: RootDocument,
})

const FULL_SCREEN_PATHS = new Set(['/login'])

function RootDocument({ children }: { children: React.ReactNode }) {
  const fullScreen = useRouterState({
    select: (state) => FULL_SCREEN_PATHS.has(state.location.pathname),
  })
  return (
    <html lang="hu" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen flex flex-col">
        {!fullScreen && <Navbar />}
        <div className="flex-1">{children}</div>
        {!fullScreen && <Footer />}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
