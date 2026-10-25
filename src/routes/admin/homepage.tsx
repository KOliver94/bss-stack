import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import { adminFnMiddleware } from '#/server/pages/admin/access-fn.ts'
import { getHomepageAdminData } from '#/server/admin/homepage-admin.ts'
import { LoadingState } from '#/components/PageStates.tsx'
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminTextField,
} from '#/components/admin/form.tsx'
import {
  AdminLoadError,
  FormMessage,
  LoginRequiredBanner,
  ValidationProblems,
} from '#/components/admin/Alerts.tsx'
import {
  AdminSearchSelect,
  FILTER_LABEL_CLASS,
} from '#/components/admin/SearchSelect.tsx'
import { postJson } from '#/lib/admin-api.ts'
import {
  budapestDatetimeLocalToIso,
  formatAdminDateTimeHu,
  toBudapestDatetimeLocal,
} from '#/lib/format-date.ts'
import { youtubeUrlWarning } from '#/lib/youtube-url.ts'
import type { SearchSelectOption } from '#/components/admin/SearchSelect.tsx'

const loadHomepageAdmin = createServerFn({ method: 'GET' })
  .middleware([adminFnMiddleware])
  .handler(async () => {
    const db = await getDefaultDb()
    return getHomepageAdminData(db)
  })

export const Route = createFileRoute('/admin/homepage')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['admin-homepage'],
      queryFn: loadHomepageAdmin,
    }),
  component: HomepageAdminPage,
})

function HomepageAdminPage() {
  const queryClient = useQueryClient()
  const dataQuery = useQuery({
    queryKey: ['admin-homepage'],
    queryFn: loadHomepageAdmin,
  })
  const isLeadership =
    Route.useRouteContext().adminViewer.level === 'leadership'

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-homepage'] })
  }

  return (
    <main className="w-full">
      <h1 className="mb-4 text-2xl font-bold text-(--bss-text)">
        Live és kiemelés
      </h1>
      {dataQuery.isPending && <LoadingState />}
      {dataQuery.isError && (
        <AdminLoadError
          error={dataQuery.error}
          label="Hiba történt a beállítások betöltése közben. Próbáld újra később."
        />
      )}
      {dataQuery.isSuccess && (
        <div className="flex flex-col gap-6">
          <HighlightSection data={dataQuery.data} onChanged={refresh} />
          <LiveSection data={dataQuery.data} onChanged={refresh} />
          {isLeadership && (
            <AboutSection data={dataQuery.data} onChanged={refresh} />
          )}
        </div>
      )}
    </main>
  )
}

type HomepageAdminPayload = Awaited<ReturnType<typeof getHomepageAdminData>>

function videoOptions(
  videos: HomepageAdminPayload['selectableVideos'],
): Array<SearchSelectOption> {
  return videos.map((video) => ({ value: video.id, label: video.title }))
}

function HighlightSection({
  data,
  onChanged,
}: {
  data: HomepageAdminPayload
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState('')

  async function call(body: Record<string, unknown>, okMessage: string) {
    setBusy(true)
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
    const result = await postJson('/api/admin/highlight', body)
    setBusy(false)
    if (result.ok) {
      setMessage(okMessage)
      onChanged()
      return
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setLoginUrl(result.error.loginUrl)
      return
    }
    setProblems(result.error.problems ?? [result.error.message])
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">Kiemelt videó</h2>
      {data.highlight.videoId !== null ? (
        <p className="text-sm">
          Jelenleg kiemelve:{' '}
          <strong>{data.highlight.title ?? data.highlight.videoId}</strong>
        </p>
      ) : (
        <p className="text-sm text-(--bss-text-secondary)">
          Nincs kiemelt videó; a homepage normál állapotot mutat.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-96">
          <AdminSearchSelect
            label="Kiemelendő publikus videó"
            value={pendingId}
            onChange={setPendingId}
            options={videoOptions(data.selectableVideos)}
            searchPlaceholder="Videó keresése cím szerint…"
            labelClassName={FILTER_LABEL_CLASS}
          />
        </div>
        <AdminPrimaryButton
          disabled={busy || pendingId === ''}
          onClick={() => {
            if (pendingId === '') {
              return
            }
            void call({ videoId: pendingId }, 'Kiemelés beállítva.')
            setPendingId('')
          }}
        >
          Kiemelés
        </AdminPrimaryButton>
        {data.highlight.videoId !== null && (
          <AdminSecondaryButton
            disabled={busy}
            confirm="Biztosan elveszed a kiemelést?"
            onClick={() =>
              void call({ videoId: null }, 'Kiemelés eltávolítva.')
            }
          >
            Kiemelés eltávolítása
          </AdminSecondaryButton>
        )}
      </div>
      <p className="text-xs text-(--bss-text-secondary)">
        Csak publikált, publikus videó emelhető ki; archiválás, lomtár vagy
        láthatóság-szűkítés esetén a kiemelés automatikusan megszűnik.
      </p>
      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}
    </section>
  )
}

type LiveEntry = HomepageAdminPayload['live'][number]

function youtubeWatchUrl(youtubeVideoId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeVideoId}`
}

function YoutubeLink({ youtubeVideoId }: { youtubeVideoId: string }) {
  return (
    <a
      href={youtubeWatchUrl(youtubeVideoId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-bold underline-offset-2 hover:text-(--orange) hover:underline"
    >
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {youtubeVideoId}
    </a>
  )
}

/** YouTube URL + start time fields, shared by scheduling and editing. */
function LiveFields({
  youtubeUrl,
  onYoutubeUrlChange,
  startsAt,
  onStartsAtChange,
}: {
  youtubeUrl: string
  onYoutubeUrlChange: (value: string) => void
  startsAt: string
  onStartsAtChange: (value: string) => void
}) {
  // The server uses the same parser before the oEmbed check.
  const urlWarning = youtubeUrlWarning(youtubeUrl)
  return (
    <>
      <div className="md:col-span-2">
        <AdminTextField
          label="YouTube URL"
          value={youtubeUrl}
          onChange={onYoutubeUrlChange}
          required
          hint="watch/live/youtu.be/embed formák; a mentés oEmbed ellenőrzéssel jár."
        />
        {urlWarning !== null && (
          <p role="alert" className="mt-1 text-xs text-(--orange)">
            {urlWarning}
          </p>
        )}
      </div>
      <AdminTextField
        label="Kezdési idő"
        type="datetime-local"
        value={startsAt}
        onChange={onStartsAtChange}
        required
        hint="A kezdési időben magától elindul (legfeljebb egy perc késéssel), és a „Lezárás most” gombig fut."
      />
    </>
  )
}

function LiveSection({
  data,
  onChanged,
}: {
  data: HomepageAdminPayload
  onChanged: () => void
}) {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  async function call(
    url: string,
    body: Record<string, unknown>,
    okMessage?: string,
  ) {
    setBusy(true)
    setProblems([])
    setMessage(null)
    setLoginUrl(null)
    const result = await postJson<{ activated?: boolean }>(url, body)
    setBusy(false)
    if (result.ok) {
      if (result.data.activated === false) {
        setMessage(
          'Az aktiválás nem sikerült (YouTube-hiba); a live ütemezetten marad.',
        )
      } else if (okMessage !== undefined) {
        setMessage(okMessage)
      }
      onChanged()
      return true
    }
    if (result.error.code === 'auth_required' && result.error.loginUrl) {
      setLoginUrl(result.error.loginUrl)
      return false
    }
    setProblems(result.error.problems ?? [result.error.message])
    return false
  }

  function create() {
    void call(
      '/api/admin/live',
      { youtubeUrl, startsAt: budapestDatetimeLocalToIso(startsAt) },
      'Live ütemezve.',
    ).then((ok) => {
      if (ok) {
        setYoutubeUrl('')
        setStartsAt('')
      }
    })
  }

  const activeOrScheduled = data.live.filter((live) => live.status !== 'ended')
  const ended = data.live.filter((live) => live.status === 'ended')

  return (
    <section className="flex flex-col gap-4 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">Live</h2>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
        className="grid gap-3 md:grid-cols-2"
      >
        <LiveFields
          youtubeUrl={youtubeUrl}
          onYoutubeUrlChange={setYoutubeUrl}
          startsAt={startsAt}
          onStartsAtChange={setStartsAt}
        />
        <div className="self-start md:mt-6">
          <AdminPrimaryButton
            onClick={() => create()}
            disabled={busy || youtubeUrlWarning(youtubeUrl) !== null}
          >
            Ütemezés
          </AdminPrimaryButton>
        </div>
      </form>

      {activeOrScheduled.length === 0 ? (
        <p className="text-sm text-(--bss-text-secondary)">
          Nincs ütemezett vagy futó live.
        </p>
      ) : (
        activeOrScheduled.map((live) => (
          <div
            key={live.id}
            className="rounded border border-(--nav-border-b) p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <YoutubeLink youtubeVideoId={live.youtubeVideoId} />
              <span className="rounded bg-(--nav-search-bg) px-2 py-0.5 text-xs font-bold text-(--bss-text-secondary)">
                {live.status === 'active' ? 'Fut' : 'Ütemezett'}
              </span>
              <span className="text-xs text-(--bss-text-secondary)">
                {live.status === 'active' ? 'Indult: ' : 'Kezdés: '}
                {formatAdminDateTimeHu(live.startsAt)}
              </span>
              {live.activationError !== null && (
                <span className="text-xs text-red-500">
                  Aktiválási hiba: {live.activationError}
                </span>
              )}
            </div>
            {editingId === live.id ? (
              <LiveEditForm
                live={live}
                busy={busy}
                onCancel={() => setEditingId(null)}
                onSave={(body) =>
                  void call(
                    `/api/admin/live/${live.id}/update`,
                    body,
                    'Live módosítva.',
                  ).then((ok) => {
                    if (ok) {
                      setEditingId(null)
                    }
                  })
                }
              />
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {live.status === 'scheduled' && (
                  <>
                    <AdminSecondaryButton
                      disabled={busy}
                      onClick={() => setEditingId(live.id)}
                    >
                      Szerkesztés
                    </AdminSecondaryButton>
                    <AdminSecondaryButton
                      disabled={busy}
                      onClick={() =>
                        void call(`/api/admin/live/${live.id}/start_now`, {})
                      }
                    >
                      Indítás most
                    </AdminSecondaryButton>
                    <AdminSecondaryButton
                      disabled={busy}
                      confirm="Biztosan törlöd az ütemezett live-ot?"
                      onClick={() =>
                        void call(`/api/admin/live/${live.id}/delete`, {})
                      }
                    >
                      Törlés
                    </AdminSecondaryButton>
                  </>
                )}
                {live.status === 'active' && (
                  <AdminSecondaryButton
                    disabled={busy}
                    confirm="Biztosan lezárod a futó live-ot?"
                    onClick={() =>
                      void call(`/api/admin/live/${live.id}/end_now`, {})
                    }
                  >
                    Lezárás most
                  </AdminSecondaryButton>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {ended.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold text-(--bss-text-secondary)">
            Legutóbbi befejezett live-ok ({ended.length})
          </summary>
          <ul className="mt-2 list-inside list-disc text-sm">
            {ended.map((live) => (
              <li key={live.id}>
                <YoutubeLink youtubeVideoId={live.youtubeVideoId} /> ·{' '}
                {formatAdminDateTimeHu(live.startsAt)}
                {live.endedAt !== null &&
                  ` – ${formatAdminDateTimeHu(live.endedAt)}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      {loginUrl !== null && <LoginRequiredBanner loginUrl={loginUrl} />}
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}
    </section>
  )
}

function LiveEditForm({
  live,
  busy,
  onCancel,
  onSave,
}: {
  live: LiveEntry
  busy: boolean
  onCancel: () => void
  onSave: (body: { youtubeUrl: string; startsAt: string }) => void
}) {
  const [youtubeUrl, setYoutubeUrl] = useState(
    youtubeWatchUrl(live.youtubeVideoId),
  )
  const [startsAt, setStartsAt] = useState(
    toBudapestDatetimeLocal(live.startsAt),
  )

  function save() {
    onSave({ youtubeUrl, startsAt: budapestDatetimeLocalToIso(startsAt) })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      className="mt-3 grid gap-3 md:grid-cols-2"
    >
      <LiveFields
        youtubeUrl={youtubeUrl}
        onYoutubeUrlChange={setYoutubeUrl}
        startsAt={startsAt}
        onStartsAtChange={setStartsAt}
      />
      <div className="flex gap-2 self-start md:mt-6">
        <AdminPrimaryButton
          onClick={() => save()}
          disabled={busy || youtubeUrlWarning(youtubeUrl) !== null}
        >
          Mentés
        </AdminPrimaryButton>
        <AdminSecondaryButton disabled={busy} onClick={onCancel}>
          Mégse
        </AdminSecondaryButton>
      </div>
    </form>
  )
}

function AboutSection({
  data,
  onChanged,
}: {
  data: HomepageAdminPayload
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>(
    data.about.map((entry) => entry.videoId),
  )
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState('')

  const titlesById = new Map<string, string>()
  for (const video of data.selectableVideos) {
    titlesById.set(video.id, video.title)
  }
  for (const entry of data.about) {
    if (entry.title !== null) {
      titlesById.set(entry.videoId, entry.title)
    }
  }
  const invalidIds = new Set(
    data.about.filter((entry) => !entry.valid).map((entry) => entry.videoId),
  )

  async function save(nextSelected: string[]) {
    const previousSelected = selected
    setSelected(nextSelected)
    setBusy(true)
    setProblems([])
    setMessage(null)
    const result = await postJson('/api/admin/about', {
      orderedVideoIds: nextSelected,
    })
    setBusy(false)
    if (result.ok) {
      setMessage('Rólunk-videók elmentve.')
      void queryClient.invalidateQueries({ queryKey: ['about-page'] })
      onChanged()
      return
    }
    setSelected(previousSelected)
    setProblems(result.error.problems ?? [result.error.message])
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-(--nav-border-b) p-4">
      <h2 className="font-bold text-(--bss-text)">Rólunk-videók</h2>
      <p className="text-xs text-(--bss-text-secondary)">
        Legfeljebb hat, sorrendezett publikus videó jelenik meg a Rólunk
        oldalon; az érvénytelenné vált elemek automatikusan kiesnek a
        megjelenítésből. A változtatások automatikusan mentődnek.
      </p>
      {selected.length === 0 ? (
        <p className="text-sm text-(--bss-text-secondary)">
          Nincs kiválasztott videó.
        </p>
      ) : (
        <ol className="list-decimal list-inside text-sm">
          {selected.map((videoId, index) => (
            <li key={videoId} className="flex items-center gap-2 py-0.5">
              <span>
                {titlesById.get(videoId) ?? videoId}
                {invalidIds.has(videoId) && (
                  <span className="ml-2 text-xs text-red-500">
                    (érvénytelen — kiesik a megjelenítésből)
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label="Feljebb"
                disabled={index === 0 || busy}
                onClick={() => {
                  const next = [...selected]
                  ;[next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ]
                  void save(next)
                }}
                className="ctrl-btn rounded px-1"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Lejjebb"
                disabled={index === selected.length - 1 || busy}
                onClick={() => {
                  const next = [...selected]
                  ;[next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ]
                  void save(next)
                }}
                className="ctrl-btn rounded px-1"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Eltávolítás"
                disabled={busy}
                onClick={() =>
                  void save(selected.filter((id) => id !== videoId))
                }
                className="rounded px-1 text-red-500 hover:bg-red-500/15 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-96">
          <AdminSearchSelect
            value={pendingId}
            onChange={setPendingId}
            options={videoOptions(
              data.selectableVideos.filter(
                (video) => !selected.includes(video.id),
              ),
            )}
            placeholder="Válassz publikus videót…"
            searchPlaceholder="Videó keresése cím szerint…"
          />
        </div>
        <AdminSecondaryButton
          disabled={selected.length >= 6 || busy || pendingId === ''}
          onClick={() => {
            if (pendingId === '') {
              return
            }
            void save([...selected, pendingId])
            setPendingId('')
          }}
        >
          Hozzáadás
        </AdminSecondaryButton>
      </div>
      {problems.length > 0 && <ValidationProblems problems={problems} />}
      {message !== null && <FormMessage>{message}</FormMessage>}
    </section>
  )
}
