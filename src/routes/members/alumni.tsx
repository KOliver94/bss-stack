import { createFileRoute } from '@tanstack/react-router'
import { parseSearchPage } from '#/server/shared/pagination.ts'
import {
  archiveMembersQuery,
  MemberArchiveList,
} from '#/components/MemberArchiveList.tsx'
import { pageHead, pagedPath } from '#/lib/seo.ts'

export const Route = createFileRoute('/members/alumni')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: parseSearchPage(search['page']),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData(
      archiveMembersQuery('alumni', deps.page),
    ),
  head: ({ loaderData, match }) =>
    loaderData === undefined
      ? {}
      : pageHead({
          title: loaderData.title,
          description:
            'A Budavári Schönherz Stúdió öregtagjai.',
          path: pagedPath('/members/alumni', match.search.page),
        }),
  component: AlumniMembersPage,
})

function AlumniMembersPage() {
  const search = Route.useSearch()
  return <MemberArchiveList kind="alumni" page={search.page} />
}
