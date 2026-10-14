import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { loadArchiveMembersServer } from '#/server/pages/member-archive-fn.ts'
import type { ArchiveKind, ArchiveMemberCard } from '#/server/pages/members.ts'
import { EmptyState } from '#/components/PageStates.tsx'
import { MemberCard } from '#/components/MemberCard.tsx'

export const ARCHIVE_ROUTES = {
  archived: '/members/archived',
  alumni: '/members/alumni',
} as const satisfies Record<ArchiveKind, string>

export function archiveMembersQuery(kind: ArchiveKind, page?: number) {
  return {
    queryKey: ['members-archive', kind, page ?? 1],
    queryFn: () => loadArchiveMembersServer({ data: { kind, page } }),
  }
}

/** Paginated member card grid shared by the archive-style member lists. */
export function MemberArchiveList({
  kind,
  page,
}: {
  kind: ArchiveKind
  page?: number
}) {
  const listQuery = useQuery(archiveMembersQuery(kind, page))

  return (
    <main className="site-width my-[4dvh]">
      {listQuery.isPending && (
        <p
          role="status"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Betöltés…
        </p>
      )}
      {listQuery.isError && (
        <p
          role="alert"
          className="py-[6dvh] text-center text-(--bss-text-secondary)"
        >
          Hiba történt az adatok betöltése közben. Próbáld újra később.
        </p>
      )}
      {listQuery.isSuccess && (
        <>
          <h1 className="mb-6 text-center text-3xl font-bold text-(--bss-text)">
            {listQuery.data.title}
          </h1>
          {listQuery.data.items.length === 0 ? (
            <EmptyState
              title="Nincs megjeleníthető tag"
              description="Ezen a listán jelenleg nincs senki."
            />
          ) : (
            <>
              {kind === 'alumni' ? (
                groupByJoinedYear(listQuery.data.items).map((group) => (
                  <section key={group.year ?? 'unknown'} className="mt-8">
                    <h2 className="text-center text-2xl font-bold text-(--bss-text)">
                      {group.year ?? 'Ismeretlen csatlakozási év'}
                    </h2>
                    <MemberCardGrid members={group.members} />
                  </section>
                ))
              ) : (
                <MemberCardGrid members={listQuery.data.items} />
              )}
              {listQuery.data.totalPages > 1 && (
                <nav
                  aria-label="Tagok lapozása"
                  className="mt-8 flex justify-center gap-2"
                >
                  {Array.from(
                    { length: listQuery.data.totalPages },
                    (_, index) => index + 1,
                  ).map((value) => (
                    <Link
                      key={value}
                      to={ARCHIVE_ROUTES[kind]}
                      search={{ page: value === 1 ? undefined : value }}
                      aria-current={
                        value === listQuery.data.page ? 'page' : undefined
                      }
                      className={`h-10 w-10 text-center leading-10 ${
                        value === listQuery.data.page
                          ? 'font-bold text-(--orange)'
                          : 'text-(--bss-text-secondary)'
                      }`}
                    >
                      {value}
                    </Link>
                  ))}
                </nav>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

function MemberCardGrid({ members }: { members: Array<ArchiveMemberCard> }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-4">
      {members.map((member) => (
        <MemberCard key={member.sub} member={member} />
      ))}
    </div>
  )
}

/** Items arrive sorted by join year, so equal years are always adjacent. */
function groupByJoinedYear(members: Array<ArchiveMemberCard>) {
  const groups: Array<{
    year: number | null
    members: Array<ArchiveMemberCard>
  }> = []
  for (const member of members) {
    const last = groups.at(-1)
    if (last !== undefined && last.year === member.joinedYear) {
      last.members.push(member)
    } else {
      groups.push({ year: member.joinedYear, members: [member] })
    }
  }
  return groups
}
