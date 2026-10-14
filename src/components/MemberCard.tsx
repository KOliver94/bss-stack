import { Link } from '@tanstack/react-router'
import type { PublicMemberCard } from '#/server/pages/members.ts'
import { memberSlug } from '#/lib/member-slug.ts'

export function MemberCard({ member }: { member: PublicMemberCard }) {
  return (
    <Link
      to="/members/$slug"
      params={{ slug: memberSlug(member) }}
      className="hover-lift flex w-[178px] flex-col items-center border border-(--card-border) bg-(--members-card-bg) p-3 text-center shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
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
        <p className="text-(--bss-text-secondary) italic">{member.nickname}</p>
      )}
      {member.leadershipRole !== null && (
        <p className="text-sm text-(--bss-text-secondary)">
          {member.leadershipRole}
        </p>
      )}
    </Link>
  )
}
