import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Access = 'public' | 'admin' | 'leadership'

/**
 * Minden szerverfüggvény önálló HTTP-végpont, amelyet bárki meghívhat, ezért a
 * jogosultságot magának kell ellenőriznie; az útvonal guardja csak a
 * navigációt védi. Új szerverfüggvényt ide is be kell sorolni.
 */
const EXPECTED: Record<string, Access> = {
  'src/routes/about.tsx#loadAboutPage': 'public',
  'src/routes/events/$slug.tsx#loadEventDetail': 'public',
  'src/routes/events/index.tsx#loadEventList': 'public',
  'src/routes/index.tsx#loadHomepage': 'public',
  'src/routes/members/$slug.tsx#loadMemberActivity': 'public',
  'src/routes/members/$slug.tsx#loadMemberProfile': 'public',
  'src/routes/members/index.tsx#loadActiveMembers': 'public',
  'src/routes/search.tsx#loadSearchResults': 'public',
  'src/routes/search.tsx#loadVideoHits': 'public',
  'src/routes/videos/$slug.tsx#loadVideoDetail': 'public',
  'src/routes/videos/index.tsx#loadFilterOptions': 'public',
  'src/routes/videos/index.tsx#loadVideoList': 'public',
  'src/server/pages/admin/access-fn.ts#fetchAdminAreaAccess': 'public',
  'src/server/pages/admin/access-fn.ts#fetchLeadershipAreaAccess': 'public',
  'src/server/pages/live-badge-fn.ts#fetchLiveBadge': 'public',
  'src/server/pages/member-archive-fn.ts#loadArchiveMembersServer': 'public',
  'src/server/pages/viewer-fn.ts#fetchViewerState': 'public',

  'src/routes/admin/events/$id.tsx#loadAdminEventEditor': 'admin',
  'src/routes/admin/events/index.tsx#loadAdminEventList': 'admin',
  'src/routes/admin/homepage.tsx#loadHomepageAdmin': 'admin',
  'src/routes/admin/trash.tsx#loadTrashPage': 'admin',
  'src/routes/admin/videos/$id.tsx#loadAdminVideoEditor': 'admin',
  'src/routes/admin/videos/index.tsx#loadAdminVideoList': 'admin',
  'src/routes/admin/videos/index.tsx#loadFilterOptions': 'admin',

  'src/routes/admin/audit.tsx#loadAuditFilterValues': 'leadership',
  'src/routes/admin/audit.tsx#loadAuditPage': 'leadership',
  'src/routes/admin/catalog/staff-roles.tsx#loadRoleCatalog': 'leadership',
  'src/routes/admin/catalog/tags.tsx#loadTagCatalog': 'leadership',
  'src/routes/admin/members.tsx#loadMemberDiagnostics': 'leadership',
}

const GUARD_LEVELS: Record<string, Access> = {
  adminFnMiddleware: 'admin',
  leadershipFnMiddleware: 'leadership',
}

function sourceFiles(): string[] {
  return readdirSync('src', { recursive: true, encoding: 'utf8' })
    .map((path) => `src/${path.replaceAll('\\', '/')}`)
    .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.gen.ts'))
}

function declaredServerFns(): Record<string, Access> {
  const declared: Record<string, Access> = {}
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8')
    const calls = source.match(/createServerFn\(/g)?.length ?? 0
    const declarations = [
      ...source.matchAll(
        /const (\w+) = createServerFn\(([\s\S]*?)\.handler\(/g,
      ),
    ]
    // Felismeretlen formájú deklaráció ne csússzon át ellenőrzés nélkül.
    expect(declarations.length, file).toBe(calls)

    for (const [, name, chain] of declarations) {
      const levels = [...chain.matchAll(/\.middleware\(\[([^\]]*)\]\)/g)]
        .flatMap(([, list]) => list.split(','))
        .map((guard) => GUARD_LEVELS[guard.trim()])
      declared[`${file}#${name}`] = levels.includes('leadership')
        ? 'leadership'
        : levels.includes('admin')
          ? 'admin'
          : 'public'
    }
  }
  return declared
}

describe('Szerverfüggvények jogosultság-ellenőrzése', () => {
  it('minden szerverfüggvény szerepel a listában, a várt szintű guarddal', () => {
    expect(declaredServerFns()).toEqual(EXPECTED)
  })

  it('az admin útvonalak egyik szerverfüggvénye sem nyilvános', () => {
    const publicAdminFns = Object.entries(declaredServerFns())
      .filter(
        ([key, access]) =>
          key.startsWith('src/routes/admin') && access === 'public',
      )
      .map(([key]) => key)
    expect(publicAdminFns).toEqual([])
  })
})
