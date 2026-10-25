import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  getAdminEventDetail,
  getAdminEventEditorOptions,
} from '#/server/admin/event-list.ts'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { allowedMediaHosts } from '#/server/media/allowed-hosts.ts'
import { fetchViewerState } from '#/server/pages/viewer-fn.ts'
import { ErrorState, LoadingState } from '#/components/PageStates.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextArea,
  AdminTextField,
} from '#/components/admin/form.tsx'
import {
  ConflictBanner,
  FormMessage,
  LoginRequiredBanner,
  ValidationProblems,
  WarningList,
} from '#/components/admin/Alerts.tsx'
import { StaffListEditor } from '#/components/admin/StaffListEditor.tsx'
import { postJson } from '#/lib/admin-api.ts'
import { eventStatusLabel } from '#/lib/admin-labels.ts'
import { mediaUrlWarning } from '#/lib/media-url.ts'
import type {
  AdminEventDetail,
  AdminEventEditorOptions,
} from '#/server/admin/event-list.ts'

/** Role offered first for a new crew row, as on the legacy site. */
const EVENT_CREW_ROLE_NAME = 'Esemény stábtag'

const loadAdminEventEditor = createServerFn({ method: 'GET' })
  .validator((input: unknown) => input as { id: string })
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    const detail = await getAdminEventDetail(db, data.id)
    const options =
      detail === null ? null : await getAdminEventEditorOptions(db, data.id)
    return { detail, options, mediaAllowedHosts: allowedMediaHosts() }
  })

export const Route = createFileRoute('/admin/events/$id')({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-event-editor', params.id],
      queryFn: () => loadAdminEventEditor({ data: { id: params.id } }),
    }),
  component: AdminEventEditorPage,
})

function AdminEventEditorPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const editorQuery = useQuery({
    queryKey: ['admin-event-editor', id],
    queryFn: () => loadAdminEventEditor({ data: { id } }),
  })
  const viewerQuery = useQuery({
    queryKey: ['viewer'],
    queryFn: fetchViewerState,
    staleTime: 60_000,
  })

  if (editorQuery.isPending) {
    return <LoadingState />
  }
  if (editorQuery.isError) {
    return (
      <ErrorState label="Hiba történt az esemény betöltése közben. Próbáld újra később." />
    )
  }
  const { detail, options } = editorQuery.data
  if (detail === null || options === null) {
    throw notFound()
  }

  return (
    <EventEditor
      key={`${detail.id}-${detail.version}`}
      detail={detail}
      options={options}
      mediaAllowedHosts={editorQuery.data.mediaAllowedHosts}
      isLeadership={viewerQuery.data?.level === 'leadership'}
      onReload={() =>
        queryClient.invalidateQueries({ queryKey: ['admin-event-editor', id] })
      }
    />
  )
}

function EventEditor({
  detail,
  options,
  mediaAllowedHosts,
  isLeadership,
  onReload,
}: {
  detail: AdminEventDetail
  options: AdminEventEditorOptions
  mediaAllowedHosts: string[]
  isLeadership: boolean
  onReload: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: detail.title,
    slug: detail.slug,
    description: detail.description ?? '',
    thumbnailUrl: detail.thumbnailUrl ?? '',
    startDate: detail.startDate ?? '',
    endDate: detail.endDate ?? '',
  })
  const [version, setVersion] = useState(detail.version)
  // Sequential saves (see saveAll) need the latest version before re-render.
  const versionRef = useRef(detail.version)
  const [staff, setStaff] = useState<
    Array<{ roleId: string; memberSub: string }>
  >(detail.staffAssignments)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteSummary, setDeleteSummary] = useState<string | null>(null)

  const [savedFormSnapshot, setSavedFormSnapshot] = useState(() =>
    JSON.stringify(form),
  )
  const [savedStaffSnapshot, setSavedStaffSnapshot] = useState(() =>
    JSON.stringify(detail.staffAssignments),
  )
  const formDirty = JSON.stringify(form) !== savedFormSnapshot
  const staffDirty = JSON.stringify(staff) !== savedStaffSnapshot
  const isDirty = formDirty || staffDirty
  const crewRoleId = options.staffRoles.find(
    (role) => role.name === EVENT_CREW_ROLE_NAME,
  )?.id

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // The server rejects an invalid thumbnail host even in drafts,
  // so we surface it here while editing.
  const thumbnailWarning = mediaUrlWarning(
    'Thumbnail URL',
    form.thumbnailUrl,
    mediaAllowedHosts,
  )

  function patch(partial: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  async function call(
    action: string,
    body: Record<string, unknown>,
    successMessage?: string,
  ): Promise<boolean> {
    setBusy(true)
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
    setConflictMessage(null)
    setDeleteSummary(null)
    const result = await postJson<{
      version?: number
      slug?: string
      detachedVideoCount?: number
    }>(`/api/admin/events/${detail.id}/${action}`, {
      version: versionRef.current,
      ...body,
    })
    setBusy(false)
    if (result.ok) {
      if (typeof result.data.version === 'number') {
        versionRef.current = result.data.version
        setVersion(result.data.version)
      }
      const savedSlug = result.data.slug ?? form.slug
      if (savedSlug !== form.slug) {
        patch({ slug: savedSlug })
      }
      if (action === 'update') {
        setSavedFormSnapshot(JSON.stringify({ ...form, slug: savedSlug }))
      } else if (action === 'staff') {
        setSavedStaffSnapshot(JSON.stringify(staff))
      }
      if (
        typeof result.data.detachedVideoCount === 'number' &&
        action === 'delete_permanent'
      ) {
        setDeleteSummary(
          `Az esemény véglegesen törölve; ${result.data.detachedVideoCount} videó leválasztva.`,
        )
        await navigate({ to: '/admin/events' })
        return true
      }
      setMessage(successMessage ?? null)
      return true
    }
    const error = result.error
    if (error.code === 'auth_required' && error.loginUrl !== undefined) {
      setLoginUrl(error.loginUrl)
      return false
    }
    if (error.code === 'conflict') {
      setConflictMessage(error.message)
      return false
    }
    if (error.problems !== undefined) {
      setProblems(error.problems)
      return false
    }
    setProblems([error.message])
    return false
  }

  async function saveDraft(
    successMessage = 'Piszkozat elmentve.',
  ): Promise<boolean> {
    return call('update', form, successMessage)
  }

  async function saveStaff(
    successMessage = 'Közreműködők elmentve.',
  ): Promise<boolean> {
    return call('staff', { assignments: staff }, successMessage)
  }

  /** The bottom save button saves every section with unsaved changes. */
  async function saveAll() {
    const pending = [
      { dirty: staffDirty, save: saveStaff },
      { dirty: formDirty, save: saveDraft },
    ].filter((item) => item.dirty)
    for (const [index, item] of pending.entries()) {
      const isLast = index === pending.length - 1
      const saved = await item.save(
        isLast && pending.length > 1 ? 'Minden változás elmentve.' : undefined,
      )
      if (!saved) return
    }
  }

  async function publish() {
    if (formDirty && !(await saveDraft())) return
    await call('publish', {}, 'Esemény publikálva.')
  }

  async function deletePermanently() {
    await call('delete_permanent', { confirmationTitle: deleteConfirmation })
  }

  return (
    <main className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-(--bss-text)">{detail.title}</h1>
        <span className="rounded bg-(--nav-search-bg) px-2 py-1 text-xs font-bold text-(--bss-text-secondary)">
          {eventStatusLabel(detail.status)} · v{version}
        </span>
        {/* Public page of a published event in a new tab, so editing isn't lost. */}
        {detail.status === 'published' ? (
          <Link
            to="/events/$slug"
            params={{ slug: detail.slug }}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-(--orange) underline"
          >
            Megnyitás az oldalon ↗
          </Link>
        ) : (
          <span className="text-xs text-(--bss-text-secondary)">
            A nyilvános oldal csak publikált állapotban érhető el.
          </span>
        )}
      </div>

      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      {conflictMessage !== null && (
        <ConflictBanner
          message={conflictMessage}
          onReload={() => void onReload()}
        />
      )}
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}

      <section className="flex flex-col gap-4 rounded border border-(--nav-border-b) p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <AdminTextField
            label="Cím"
            value={form.title}
            onChange={(value) => patch({ title: value })}
            required
            maxLength={200}
          />
          <AdminTextField
            label="Slug"
            value={form.slug}
            onChange={(value) => patch({ slug: value })}
            maxLength={200}
            hint="Módosításkor a régi slug átirányításként megmarad."
          />
          <AdminTextField
            label="Kezdődátum"
            type="date"
            value={form.startDate}
            onChange={(value) => patch({ startDate: value })}
          />
          <AdminTextField
            label="Befejezés dátuma"
            type="date"
            value={form.endDate}
            onChange={(value) => patch({ endDate: value })}
          />
        </div>
        <AdminTextField
          label="Thumbnail URL"
          value={form.thumbnailUrl}
          onChange={(value) => patch({ thumbnailUrl: value })}
          hint="Opcionális; hiányában a legfrissebb látható videó thumbnailje jelenik meg."
        />
        <WarningList
          warnings={thumbnailWarning === null ? [] : [thumbnailWarning]}
        />
        <AdminTextArea
          label="Leírás"
          value={form.description}
          onChange={(value) => patch({ description: value })}
          rows={5}
          maxLength={10_000}
        />
      </section>

      <StaffListEditor
        title="Közreműködők"
        roles={options.staffRoles}
        members={options.members}
        assignments={staff}
        defaultRoleId={crewRoleId}
        onChange={setStaff}
        onSave={() => void saveStaff()}
        busy={busy}
      />

      <section className="flex flex-wrap gap-2 rounded border border-(--nav-border-b) p-4">
        {detail.status !== 'published' && (
          <AdminPrimaryButton onClick={() => void publish()} disabled={busy}>
            Publikálás
          </AdminPrimaryButton>
        )}
        {(detail.status === 'published' || detail.status === 'draft') && (
          <AdminSecondaryButton
            onClick={() => void call('archive', {}, 'Esemény archiválva.')}
            disabled={busy}
          >
            Archiválás
          </AdminSecondaryButton>
        )}
      </section>

      {isLeadership && (
        <section className="flex flex-col gap-3 rounded border border-red-500 p-4">
          <h2 className="font-bold text-(--bss-text)">Végleges törlés</h2>
          <p className="text-sm text-(--bss-text-secondary)">
            A művelet azonnali és visszavonhatatlan. A hozzárendelt{' '}
            <strong>{detail.attachedVideoIds.length}</strong> videó
            leválasztásra kerül (a készülési dátumuk megmarad), a slug nem
            használható fel újra. A megerősítéshez írd be az esemény címét:{' '}
            <strong>{detail.title}</strong>
          </p>
          <input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={detail.title}
            className="h-10 w-full max-w-md border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none"
          />
          <div>
            <AdminSecondaryButton
              onClick={() => void deletePermanently()}
              disabled={busy || deleteConfirmation.trim() !== detail.title}
              confirm={`Biztosan VÉGLEGesen törlöd „${detail.title}" eseményt? ${detail.attachedVideoIds.length} videó válik le róla.`}
            >
              Végleges törlés
            </AdminSecondaryButton>
          </div>
          {deleteSummary !== null && <FormMessage>{deleteSummary}</FormMessage>}
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-(--nav-border-b) bg-(--bg) py-3">
        <AdminPrimaryButton
          onClick={() => void saveAll()}
          disabled={busy || !isDirty}
        >
          Piszkozat mentése
        </AdminPrimaryButton>
        {!isDirty ? (
          <span className="text-xs text-(--bss-text-secondary)">
            Nincs mentetlen változás.
          </span>
        ) : (
          <span className="text-xs text-red-500">Mentetlen változások!</span>
        )}
      </div>
    </main>
  )
}
