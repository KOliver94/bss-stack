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

export const Route = createFileRoute('/admin')({
  // Admin pages must not start loading data for a viewer without access:
  // child loaders wait for `beforeLoad`, while a `loader` runs alongside them.
  beforeLoad: async ({ location }) => {
    const access = await fetchAdminAreaAccess({
      data: { returnTo: location.href },
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
