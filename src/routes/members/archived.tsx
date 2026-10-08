import { createFileRoute } from '@tanstack/react-router'
import { parseSearchPage } from '#/server/shared/pagination.ts'
import {
  archiveMembersQuery,
  MemberArchiveList,
} from '#/components/MemberArchiveList.tsx'

export const Route = createFileRoute('/members/archived')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: parseSearchPage(search['page']),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData(
      archiveMembersQuery('archived', deps.page),
    ),
  component: ArchivedMembersPage,
})

function ArchivedMembersPage() {
  const search = Route.useSearch()
  return <MemberArchiveList kind="archived" page={search.page} />
}
