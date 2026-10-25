import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { ForbiddenContent, NotFoundContent } from '#/components/PageStates.tsx'
import { AdminSidebar } from '#/components/admin/AdminSidebar.tsx'
import { fetchAdminAreaAccess } from '#/server/pages/admin/access-fn.ts'
import { noindexHead } from '#/lib/seo.ts'

const FORBIDDEN = 'forbidden'

/**
 * Granted access is reused for a while so paging, filtering and preloading
 * don't each wait on a fresh check; the server functions check every call
 * anyway. A refusal is checked again, its login URL depends on the page.
 */
const GRANTED_ACCESS_STALE_TIME = 60_000

export const Route = createFileRoute('/admin')({
  // Admin pages must not start loading data for a viewer without access:
  // child loaders wait for `beforeLoad`, while a `loader` runs alongside them.
  beforeLoad: async ({ context, location }) => {
    const access = await context.queryClient.fetchQuery({
      queryKey: ['admin-access'],
      queryFn: () =>
        fetchAdminAreaAccess({ data: { returnTo: location.href } }),
      staleTime: (query) =>
        query.state.data?.kind === 'ok' ? GRANTED_ACCESS_STALE_TIME : 0,
    })
    if (access.kind === 'login') {
      throw redirect({ href: access.loginUrl })
    }
    if (access.kind === 'forbidden' || access.viewer === undefined) {
      // The router cannot answer 403; not-found stops the child loaders too.
      throw notFound({ data: FORBIDDEN })
    }
    return { adminViewer: access.viewer }
  },
  head: () => noindexHead('Admin'),
  notFoundComponent: ({ data }) =>
    data === FORBIDDEN ? <ForbiddenContent /> : <NotFoundContent />,
  component: AdminLayout,
})

function AdminLayout() {
  const { adminViewer } = Route.useRouteContext()

  return (
    <div className="site-width my-[3dvh] flex flex-col gap-4 md:flex-row">
      <AdminSidebar level={adminViewer.level} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
