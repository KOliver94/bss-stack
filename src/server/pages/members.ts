import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { Viewer } from '#/server/auth/viewer.ts'
import { formatAcademicSemester } from '#/server/members/member-fields.ts'
import {
  eventStaff,
  events,
  memberCache,
  staffRoles,
  videoStaff,
  videos,
} from '#/db/schema.ts'
import type { Executor } from '#/server/shared/db-executor.ts'
import type { membershipStatusEnum } from '#/db/schema.ts'

import type { ActivityRow, YearGroup, RoleGroup } from '#/lib/activity.ts'

type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number]

export const MEMBER_PAGE_SIZE = 50

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  MEMBER_CANDIDATE_CANDIDATE: 'Stúdiósjelölt-jelölt',
  MEMBER_CANDIDATE: 'Stúdiósjelölt',
  MEMBER: 'Stúdiós',
  ACTIVE_ALUMNI: 'Aktív öregtag',
  ALUMNI: 'Öregtag',
}

export { formatAcademicSemester }

export interface PublicMemberCard {
  sub: string
  username: string | null
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  /** Set only on leadership block cards. */
  leadershipRole: string | null
}

export interface ActiveMemberBlocks {
  leadership: Array<PublicMemberCard>
  members: Array<PublicMemberCard>
  member_candidates: Array<PublicMemberCard>
  member_candidate_candidates: Array<PublicMemberCard>
  seniorActive: Array<PublicMemberCard>
}

export async function getActiveMemberBlocks(
  executor: Executor,
): Promise<ActiveMemberBlocks> {
  const rows = await executor
    .select({
      sub: memberCache.sub,
      username: memberCache.username,
      fullName: memberCache.fullName,
      nickname: memberCache.nickname,
      avatarUrl: memberCache.avatarUrl,
      leadershipRole: memberCache.leadershipRole,
      status: memberCache.membershipStatus,
    })
    .from(memberCache)
    .where(isNull(memberCache.archivedAt))
    .orderBy(asc(memberCache.fullName), asc(memberCache.sub))

  const toCard = (row: (typeof rows)[number]): PublicMemberCard => ({
    sub: row.sub,
    username: row.username,
    fullName: row.fullName,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    leadershipRole: null,
  })

  // Leaders appear only in the leadership block, whatever their status.
  const nonLeaders = rows.filter((row) => row.leadershipRole === null)
  const byStatus = (status: MembershipStatus) =>
    nonLeaders.filter((row) => row.status === status).map(toCard)

  return {
    // Positions are free text, so there is nothing to rank them by: the
    // leadership block keeps the name order of every other block.
    leadership: rows
      .filter((row) => row.leadershipRole !== null)
      .map((row) => ({ ...toCard(row), leadershipRole: row.leadershipRole })),
    members: byStatus('MEMBER'),
    member_candidates: byStatus('MEMBER_CANDIDATE'),
    member_candidate_candidates: byStatus('MEMBER_CANDIDATE_CANDIDATE'),
    seniorActive: byStatus('ACTIVE_ALUMNI'),
  }
}

export type ArchiveKind = 'archived' | 'alumni'

const ARCHIVE_TITLES: Record<ArchiveKind, string> = {
  archived: 'Dolgoztak még velünk',
  alumni: 'Öregtagok',
}

const ARCHIVE_CONDITIONS: Record<ArchiveKind, SQL> = {
  archived: isNotNull(memberCache.archivedAt),
  // Active alumni also keep their block on the active members page.
  alumni: and(
    inArray(memberCache.membershipStatus, ['ALUMNI', 'ACTIVE_ALUMNI']),
    isNull(memberCache.archivedAt),
  )!,
}

// Alumni are listed grouped by the year they joined, newest year first.
const ARCHIVE_ORDER: Record<ArchiveKind, Array<SQL>> = {
  archived: [asc(memberCache.fullName), asc(memberCache.sub)],
  alumni: [
    sql`${desc(memberCache.joinedYear)} nulls last`,
    asc(memberCache.fullName),
    asc(memberCache.sub),
  ],
}

export interface ArchiveMemberCard extends PublicMemberCard {
  joinedYear: number | null
}

export interface MemberListPage {
  items: Array<ArchiveMemberCard>
  total: number
  page: number
  totalPages: number
  title: string
}

export async function getMemberArchivePage(
  executor: Executor,
  kind: ArchiveKind,
  params: { page?: number } = {},
): Promise<MemberListPage> {
  const page =
    params.page !== undefined &&
    Number.isInteger(params.page) &&
    params.page > 0
      ? params.page
      : 1

  const condition = ARCHIVE_CONDITIONS[kind]
  const [rows, countRows] = await Promise.all([
    executor
      .select({
        sub: memberCache.sub,
        username: memberCache.username,
        fullName: memberCache.fullName,
        nickname: memberCache.nickname,
        avatarUrl: memberCache.avatarUrl,
        joinedYear: memberCache.joinedYear,
      })
      .from(memberCache)
      .where(condition)
      .orderBy(...ARCHIVE_ORDER[kind])
      .limit(MEMBER_PAGE_SIZE)
      .offset((page - 1) * MEMBER_PAGE_SIZE),
    executor
      .select({ count: sql<number>`count(*)::int` })
      .from(memberCache)
      .where(condition),
  ])

  const total = countRows.at(0)?.count ?? 0
  return {
    items: rows.map((row) => ({ ...row, leadershipRole: null })),
    total,
    page,
    totalPages: Math.ceil(total / MEMBER_PAGE_SIZE),
    title: ARCHIVE_TITLES[kind],
  }
}

export interface MemberProfile {
  sub: string
  username: string | null
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  statusLabel: string
  leadershipRole: string | null
  joinedSemester: string | null
  introduction: string | null
  archived: boolean
}

export async function getMemberProfile(
  executor: Executor,
  slug: string,
): Promise<MemberProfile | null> {
  // Profiles are addressed by username once known, by `sub` until then; an
  // exact username match wins should a username ever equal another's `sub`.
  const rows = await executor
    .select()
    .from(memberCache)
    .where(or(eq(memberCache.username, slug), eq(memberCache.sub, slug)))
    .orderBy(sql`${memberCache.username} = ${slug} desc nulls last`)
    .limit(1)
  const member = rows.at(0)
  if (member === undefined) {
    return null
  }
  return {
    sub: member.sub,
    username: member.username,
    fullName: member.fullName,
    nickname: member.nickname,
    avatarUrl: member.avatarUrl,
    statusLabel: MEMBERSHIP_STATUS_LABELS[member.membershipStatus],
    leadershipRole: member.leadershipRole,
    joinedSemester: formatAcademicSemester(
      member.joinedYear,
      member.joinedSemester,
    ),
    introduction: member.introduction,
    archived: member.archivedAt !== null,
  }
}

export type { ActivityRow, YearGroup, RoleGroup }

export interface ActivityPage {
  items: Array<ActivityRow>
  total: number
}

/**
 * Member activity: published videos visible to the viewer plus the published
 * events the member was crew on, descending by date (`recordedAt` of videos,
 * `startDate` of events; missing values at the end). With multiple roles the
 * same video or event appears in a single row with a role list.
 */
export async function getMemberActivity(
  executor: Executor,
  viewer: Viewer,
  memberSub: string,
  params: { limit?: number; offset?: number } = {},
): Promise<ActivityPage> {
  const limit = params.limit ?? MEMBER_PAGE_SIZE
  const offset = params.offset ?? 0

  const rowsResult = await executor.execute(sql`
    select a.kind, a.id, a.slug, a.title,
      to_char(a.day, 'YYYY-MM-DD') as "recordedAt",
      extract(year from a.day)::int as year,
      a.roles,
      count(*) over () as total
    from (
      select 'video' as kind, v.id, v.slug, v.title, v.recorded_at as day,
        v.published_at as sort_at,
        coalesce(
          (select json_agg(r.name order by r.display_order, r.name)
           from ${videoStaff} vs
           join ${staffRoles} r on r.id = vs.role_id
           where vs.video_id = v.id and vs.member_sub = ${memberSub}),
          '[]'::json
        ) as roles
      from ${videos} v
      where v.status = 'published'
        and exists (
          select 1 from ${videoStaff} vs2
          where vs2.video_id = v.id and vs2.member_sub = ${memberSub}
        )
        and (
          v.visibility = 'public'
          or ${sql.raw(viewer.level === 'schonherz' ? "(v.visibility in ('public','schonherz'))" : viewer.level === 'anonymous' ? 'false' : 'true')}
        )
      union all
      select 'event' as kind, e.id, e.slug, e.title, e.start_date as day,
        e.created_at as sort_at,
        (select json_agg(r.name order by r.display_order, r.name)
         from ${eventStaff} es
         join ${staffRoles} r on r.id = es.role_id
         where es.event_id = e.id and es.member_sub = ${memberSub}) as roles
      from ${events} e
      where e.status = 'published'
        and exists (
          select 1 from ${eventStaff} es2
          where es2.event_id = e.id and es2.member_sub = ${memberSub}
        )
    ) a
    order by a.day desc nulls last, a.sort_at desc nulls last, a.kind, a.id
    limit ${limit} offset ${offset}
  `)

  const rawRows = rowsResult.rows as unknown as Array<
    Omit<ActivityRow, 'roles'> & { roles: string[]; total: number }
  >
  const first = rawRows.at(0)
  return {
    items: rawRows.map(({ total: _total, ...row }) => ({
      ...row,
      roles: row.roles,
    })),
    total: rawRows.length > 0 ? Number(first?.total ?? 0) : 0,
  }
}
