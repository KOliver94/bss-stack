import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { loadArchiveMembersServer } from '#/server/pages/member-archive-fn.ts'
import type { ArchiveKind } from '#/server/pages/members.ts'
import { EmptyState } from '#/components/PageStates.tsx'
import { memberSlug } from '#/lib/member-slug.ts'

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
          <h1 className="mb-6 text-3xl font-bold text-(--bss-text)">
            {listQuery.data.title}
          </h1>
          {listQuery.data.items.length === 0 ? (
            <EmptyState
              title="Nincs megjeleníthető tag"
              description="Ezen a listán jelenleg nincs senki."
            />
          ) : (
            <>
              <div className="mt-4 flex flex-wrap justify-center gap-4">
                {listQuery.data.items.map((member) => (
                  <Link
                    key={member.sub}
                    to="/members/$slug"
                    params={{ slug: memberSlug(member) }}
                    className="flex w-[178px] flex-col items-center border border-(--card-border) bg-(--members-card-bg) p-3 text-center shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
                  >
                    <img
                      src={member.avatarUrl ?? '/default-avatar.png'}
                      alt={member.fullName}
                      className="h-[178px] w-[178px] overflow-hidden object-cover"
                    />
                    <p className="text-lg font-bold text-(--bss-text-secondary)">
                      {member.fullName}
                    </p>
                    {member.nickname !== null && (
                      <p className="text-(--bss-text-secondary)">
                        „{member.nickname}”
                      </p>
                    )}
                  </Link>
                ))}
              </div>
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
