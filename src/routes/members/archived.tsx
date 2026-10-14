import { createFileRoute } from '@tanstack/react-router'
import { parseSearchPage } from '#/server/shared/pagination.ts'
import {
  archiveMembersQuery,
  MemberArchiveList,
} from '#/components/MemberArchiveList.tsx'
import { pageHead, pagedPath } from '#/lib/seo.ts'

export const Route = createFileRoute('/members/archived')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: parseSearchPage(search['page']),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData(
      archiveMembersQuery('archived', deps.page),
    ),
  head: ({ loaderData, match }) =>
    loaderData === undefined
      ? {}
      : pageHead({
          title: loaderData.title,
          description:
            'Korábbi közreműködők a Budavári Schönherz Stúdióban.',
          path: pagedPath('/members/archived', match.search.page),
        }),
  component: ArchivedMembersPage,
})

function ArchivedMembersPage() {
  const search = Route.useSearch()
  return <MemberArchiveList kind="archived" page={search.page} />
}
