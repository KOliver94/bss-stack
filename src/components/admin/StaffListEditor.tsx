import { AdminPrimaryButton, AdminSecondaryButton } from './form.tsx'
import { AdminSearchSelect } from './SearchSelect.tsx'
import type { SearchSelectOption } from './SearchSelect.tsx'

export interface StaffAssignmentDraft {
  roleId: string
  memberSub: string
}

/** Role + member rows of a video's or an event's staff list. */
export function StaffListEditor({
  title,
  roles,
  members,
  assignments,
  defaultRoleId,
  onChange,
  onSave,
  busy,
}: {
  title: string
  roles: Array<{ id: string; name: string }>
  members: Array<{ sub: string; fullName: string }>
  assignments: Array<StaffAssignmentDraft>
  /** Role preselected on a new row; the first role when missing. */
  defaultRoleId?: string
  onChange: (assignments: Array<StaffAssignmentDraft>) => void
  onSave: () => void
  busy: boolean
}) {
  const roleOptions: Array<SearchSelectOption> = roles.map((role) => ({
    value: role.id,
    label: role.name,
  }))
  const memberOptions: Array<SearchSelectOption> = members.map((member) => ({
    value: member.sub,
    label: member.fullName,
  }))

  return (
    <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">{title}</h2>
      {assignments.length === 0 && (
        <p className="text-sm text-(--bss-text-secondary)">
          Még nincs stábtag hozzárendelve.
        </p>
      )}
      {assignments.map((assignment, index) => (
        <div
          key={index}
          className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <AdminSearchSelect
            label="Szerep"
            value={assignment.roleId}
            onChange={(roleId) =>
              onChange(
                assignments.map((item, i) =>
                  i === index ? { ...item, roleId } : item,
                ),
              )
            }
            options={roleOptions}
            placeholder="Válassz szerepet…"
            searchPlaceholder="Szerep keresése…"
          />
          <AdminSearchSelect
            label="Tag"
            value={assignment.memberSub}
            onChange={(memberSub) =>
              onChange(
                assignments.map((item, i) =>
                  i === index ? { ...item, memberSub } : item,
                ),
              )
            }
            options={memberOptions}
            placeholder="Válassz tagot…"
            searchPlaceholder="Tag keresése…"
          />
          <AdminSecondaryButton
            onClick={() => onChange(assignments.filter((_, i) => i !== index))}
          >
            Eltávolítás
          </AdminSecondaryButton>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <AdminSecondaryButton
          disabled={roles.length === 0 || members.length === 0}
          onClick={() =>
            onChange([
              ...assignments,
              {
                roleId: defaultRoleId ?? roles.at(0)?.id ?? '',
                memberSub: members.at(0)?.sub ?? '',
              },
            ])
          }
        >
          + Stábtag hozzáadása
        </AdminSecondaryButton>
        <AdminPrimaryButton onClick={onSave} disabled={busy}>
          {title} mentése
        </AdminPrimaryButton>
      </div>
    </section>
  )
}
