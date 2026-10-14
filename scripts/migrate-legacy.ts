/**
 * Full legacy migration: videos, members, events from ../bss-dump into the
 * new bss-stack Postgres (memberCache, events, videos, tags, staffRoles ...).
 * Usage:
 *   pnpm exec tsx scripts/migrate-legacy.ts --dry-run   # print summary, write artifacts to oob/migrate-*.json
 *   pnpm exec tsx scripts/migrate-legacy.ts --execute   # actually write to Postgres DATABASE_URL
 *
 * The script is idempotent: members are upserted by sub, events/videos by slug,
 * tags/roles by normalizedName.
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, inArray } from 'drizzle-orm'
import {
  events,
  memberCache,
  membershipStatusEnum,
  staffRoles,
  tags,
  videoStaff,
  videoTags,
  videos,
} from '#/db/schema.ts'
import { slugify } from '#/server/shared/slug.ts'
import { TEXT_LIMITS } from '#/server/shared/text.ts'
import { normalizeCatalogName } from '#/server/catalog/names.ts'
import { parseAcademicSemester } from '#/server/members/member-fields.ts'

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
function stripHtml(html: string): string {
  // MySQL body may contain HTML like <p>, <a>, <img style="display:none">
  let s = html.replace(/<[^>]*>/g, ' ')
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > TEXT_LIMITS.description)
    s = s.slice(0, TEXT_LIMITS.description)
  return s || ''
}

function truncate(str: string | null, max: number): string | null {
  if (str === null) return null
  if (str.length <= max) return str
  return str.slice(0, max)
}

const REPOSITORY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LEGACY_DUMP_DIR = resolve(REPOSITORY_DIR, '../bss-dump')
const BACKSTAGE_DUMP_PATH = join(
  LEGACY_DUMP_DIR,
  'backstage-migration-20260825.dump',
)

function mysqlExec(sqlQuery: string): string {
  const query = `SET NAMES utf8mb4; ${sqlQuery}`
  try {
    return execFileSync(
      'docker',
      [
        'exec',
        '-e',
        'MYSQL_PWD=website',
        'bss-dump-mysql-1',
        'mysql',
        '-uwebsite',
        '--default-character-set=utf8mb4',
        '-N',
        '-B',
        'website_db',
        '-e',
        query,
      ],
      { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 },
    )
  } catch (dockerError) {
    try {
      return execFileSync(
        'mysql',
        [
          '-h127.0.0.1',
          '-uwebsite',
          '--default-character-set=utf8mb4',
          '-N',
          '-B',
          'website_db',
          '-e',
          query,
        ],
        {
          encoding: 'utf-8',
          env: { ...process.env, MYSQL_PWD: 'website' },
          maxBuffer: 200 * 1024 * 1024,
        },
      )
    } catch {
      console.error(
        `MySQL query failed. Start the dump with: docker compose -f ${join(LEGACY_DUMP_DIR, 'docker-compose.yaml')} up -d`,
      )
      throw dockerError
    }
  }
}

let backstageSql: string | null = null

function readBackstageSql(): string {
  if (backstageSql !== null) return backstageSql
  if (!existsSync(BACKSTAGE_DUMP_PATH)) {
    throw new Error(`Backstage dump not found: ${BACKSTAGE_DUMP_PATH}`)
  }
  backstageSql = execFileSync('pg_restore', ['--file=-', BACKSTAGE_DUMP_PATH], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return backstageSql
}

function decodeCopyField(value: string): string | null {
  if (value === '\\N') return null
  return value.replace(/\\([btnrfv\\])/g, (_, escaped: string) => {
    const decoded: Record<string, string> = {
      b: '\b',
      t: '\t',
      n: '\n',
      r: '\r',
      f: '\f',
      v: '\v',
      '\\': '\\',
    }
    return decoded[escaped] ?? escaped
  })
}

function parseBackstageCopy(section: string): string[][] {
  const text = readBackstageSql()
  const needle = `COPY public."${section}"`
  const start = text.indexOf(needle)
  if (start === -1) return []
  const from = text.indexOf('FROM stdin;', start)
  if (from === -1) return []
  const end = text.indexOf('\n\\.', from)
  if (end === -1) return []
  const copyBlock = text.slice(from + 'FROM stdin;'.length, end).trim()
  if (copyBlock === '') return []
  return copyBlock
    .split('\n')
    .map((line) =>
      line.split('\t').map((field) => decodeCopyField(field) ?? '\\N'),
    )
}

// ---------------------------------------------------------------------------
// Member migration
// ---------------------------------------------------------------------------

type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number]

// membershipStatusEnum reuses the Backstage MembershipStatus values verbatim,
// so migrating is a validation step rather than a mapping.
const MEMBERSHIP_STATUSES = new Set<string>(membershipStatusEnum.enumValues)

function mapMembershipStatus(backstageStatus: string): MembershipStatus {
  if (!MEMBERSHIP_STATUSES.has(backstageStatus)) {
    console.warn(
      `Unknown Backstage status "${backstageStatus}", falling back to MEMBER_CANDIDATE_CANDIDATE`,
    )
    return 'MEMBER_CANDIDATE_CANDIDATE'
  }
  return backstageStatus as MembershipStatus
}

/**
 * Hungarian display order: family name first, then the given name(s). COPY
 * fields arrive as "\\N" when NULL, so both halves are cleaned before joining.
 */
function hungarianFullName(firstName: string, lastName: string): string {
  const given = firstName === '\\N' ? '' : firstName.trim()
  const family = lastName === '\\N' ? '' : lastName.trim()
  return `${family} ${given}`.trim()
}

function buildMemberCachePayload(opts: {
  sub: string
  username: string
  fullName: string
  nickname: string | null
  avatarUrl: string | null
  membershipStatus: MembershipStatus
  leadershipRole: string | null
  joinedSemesterRaw: string | null
  introduction: string | null
}): typeof memberCache.$inferInsert {
  let joinedYear: number | null = null
  let joinedSemester: 'spring' | 'autumn' | null = null
  const raw = opts.joinedSemesterRaw
  if (raw && raw !== '\\N' && raw.trim() !== '') {
    try {
      const parsed = parseAcademicSemester(raw)
      joinedYear = parsed.year
      joinedSemester = parsed.semester
    } catch {
      // Ignore parse errors; already warned elsewhere. Keep null.
    }
  }
  // introduction comes from Drupal profile_values fid 13, may be HTML-ish; strip and limit
  let intro: string | null = null
  if (opts.introduction) {
    const stripped = stripHtml(opts.introduction)
    if (stripped.length > 0) intro = stripped.slice(0, 10_000)
    else intro = null
  }
  return {
    sub: opts.sub,
    username: opts.username,
    fullName:
      truncate(opts.fullName, TEXT_LIMITS.title) ?? opts.fullName.slice(0, 200),
    nickname: opts.nickname ? truncate(opts.nickname, 200) : null,
    avatarUrl: opts.avatarUrl,
    membershipStatus: opts.membershipStatus,
    leadershipRole: opts.leadershipRole
      ? truncate(opts.leadershipRole, 200)
      : null,
    joinedYear,
    joinedSemester: joinedSemester,
    introduction: intro,
    // createdAt/updatedAt/archivedAt handled by caller
  }
}

function encodingGroupFromProfile(
  nid: string | null,
): '4a3_SD' | '16a9_SD' | '16a9_HD' | null {
  if (nid === '30') return '4a3_SD'
  if (nid === '443') return '16a9_SD'
  if (nid === '444') return '16a9_HD'
  return null
}

function mysqlJson(sqlQuery: string): Record<string, unknown>[] {
  const out = mysqlExec(sqlQuery)
  // out is tab-separated lines where each line is a JSON string (with escaped quotes)
  const rows: Record<string, unknown>[] = []
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (t === '' || t === 'NULL') continue
    try {
      rows.push(JSON.parse(t))
    } catch {
      // Fallback: try to unescape mysql -B escaping
      rows.push(JSON.parse(t.replace(/\\"/g, '"')))
    }
  }
  return rows
}

interface DrupalUser {
  uid: number
  username: string
  fullName: string | null
  nickname: string | null
  introduction: string | null
  legacyStatus: string | null
  joinedSemester: string | null
  createdAt: Date
}

function legacyMembershipStatus(value: string | null): MembershipStatus {
  const normalized = value?.trim().toLocaleLowerCase('hu-HU') ?? ''
  if (normalized === 'stúdiós') return 'MEMBER'
  if (normalized === 'stúdiós jelölt') return 'MEMBER_CANDIDATE'
  if (normalized === 'stúdiós-jelölt jelölt')
    return 'MEMBER_CANDIDATE_CANDIDATE'
  if (normalized === 'aktív öregtag') return 'ACTIVE_ALUMNI'
  // Everyone else is an alumnus too.
  return 'ALUMNI'
}

function normalizeLegacySemester(value: string | null): string | null {
  if (!value) return null
  if (/^\d{4}\/\d{4}\/[12]$/.test(value.trim())) return value.trim()
  const match = /^(\d{4})\s+(tavasz|ősz)$/i.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  return match[2].toLocaleLowerCase('hu-HU') === 'ősz'
    ? `${year}/${year + 1}/1`
    : `${year - 1}/${year}/2`
}

async function migrateMembers(
  db: ReturnType<typeof drizzle> | null,
  opts: { dryRun: boolean },
) {
  console.log('\n=== Members (Backstage) ===')
  const memberRows = parseBackstageCopy('Member')
  // columns: id, firstName, lastName, nickname, email, mobile, avatarUrl, portraitUrl, university, major, dormRoom, status, joinedSemester, websiteUserId, archived, archivedAt, createdAt, updatedAt
  const leadershipRows = parseBackstageCopy('LeadershipRole')
  const leadershipLabels = new Map<string, string[]>()
  for (const cols of leadershipRows) {
    // id, memberId, label, authentikGroupIds
    const memberId = cols[1]
    const label = cols[2]?.trim()
    if (!memberId || memberId === '\\N' || !label || label === '\\N') continue
    const labels = leadershipLabels.get(memberId) ?? []
    if (!labels.includes(label)) labels.push(label)
    leadershipLabels.set(memberId, labels)
  }

  // Usernames must be the Drupal login names (like "d6", "misika"), linked via
  // Backstage's websiteUserId; introductions come from profile_values fid 13.
  const drupalRows = mysqlJson(`
    SELECT JSON_OBJECT(
      'uid', u.uid,
      'username', u.name,
      'fullName', COALESCE(NULLIF(pn.value, ''), NULLIF(r.realname, '')),
      'nickname', NULLIF(pk.value, ''),
      'introduction', NULLIF(pi.value, ''),
      'legacyStatus', NULLIF(ps.value, ''),
      'joinedSemester', NULLIF(pj.value, ''),
      'created', u.created
    )
    FROM users u
    LEFT JOIN realname r ON r.uid = u.uid
    LEFT JOIN profile_values pn ON pn.uid = u.uid AND pn.fid = 1
    LEFT JOIN profile_values pk ON pk.uid = u.uid AND pk.fid = 23
    LEFT JOIN profile_values pi ON pi.uid = u.uid AND pi.fid = 13
    LEFT JOIN profile_values ps ON ps.uid = u.uid AND ps.fid = 15
    LEFT JOIN profile_values pj ON pj.uid = u.uid AND pj.fid = 22
    WHERE u.uid > 1
  `)
  const drupalUsers: DrupalUser[] = drupalRows.map((row) => ({
    uid: Number(row['uid']),
    username: String(row['username']),
    fullName: row['fullName'] ? String(row['fullName']) : null,
    nickname: row['nickname'] ? String(row['nickname']) : null,
    introduction: row['introduction'] ? String(row['introduction']) : null,
    legacyStatus: row['legacyStatus'] ? String(row['legacyStatus']) : null,
    joinedSemester: row['joinedSemester']
      ? String(row['joinedSemester'])
      : null,
    createdAt: new Date(Number(row['created']) * 1000),
  }))
  const websiteUserIdToDrupal = new Map(
    drupalUsers.map((user) => [String(user.uid), user]),
  )

  let created = 0
  let updated = 0
  let skipped = 0
  const artifacts: unknown[] = []

  for (const cols of memberRows) {
    const [
      id,
      firstName,
      lastName,
      nicknameRaw,
      email,
      ,
      ,
      ,
      ,
      ,
      ,
      // mobile unused (not migrated)
      // avatar/portrait not migrated per spec
      // university/major/dorm not migrated
      statusRaw,
      joinedSemesterRaw,
      websiteUserIdRaw,
      archivedRaw,
      archivedAtRaw,
      createdAtRaw,
      updatedAtRaw,
    ] = cols
    if (!id || id === '\\N') continue
    const websiteUserId = websiteUserIdRaw !== '\\N' ? websiteUserIdRaw : null
    const nickname =
      nicknameRaw !== '\\N' && nicknameRaw !== '' ? nicknameRaw : null
    // Avatars are deliberately not migrated (owner decision).
    const avatarUrl: string | null = null
    const status = mapMembershipStatus(statusRaw)
    const leadershipRole = leadershipLabels.get(id)?.join(', ') ?? null
    const archived = archivedRaw === 't'

    let username: string | null = null
    let drupalIntro: string | null = null
    if (websiteUserId && websiteUserIdToDrupal.has(websiteUserId)) {
      const drupalUser = websiteUserIdToDrupal.get(websiteUserId)!
      username = drupalUser.username
      drupalIntro = drupalUser.introduction
    } else {
      // No linked Drupal account (e.g. synthetic x_... ids): synthesize from
      // email prefix or id.
      if (email && email !== '\\N') {
        const prefix = email
          .split('@')[0]
          .replace(/[^a-z0-9._-]/gi, '-')
          .slice(0, 30)
        username = prefix.toLowerCase() || `user-${id.slice(0, 8)}`
      } else {
        username = `user-${id.slice(0, 8)}`
      }
    }
    if (!username) {
      skipped++
      continue
    }
    const fullName = hungarianFullName(firstName, lastName) || username

    // The archived flag only controls visibility (memberCache.archivedAt); the
    // status itself is kept so a later restore lands on the right listing.
    const finalStatus = status

    const payload = buildMemberCachePayload({
      sub: id,
      username: username.toLowerCase(),
      fullName,
      nickname,
      avatarUrl,
      membershipStatus: finalStatus,
      leadershipRole,
      joinedSemesterRaw: joinedSemesterRaw === '\\N' ? null : joinedSemesterRaw,
      introduction: drupalIntro,
    })

    artifacts.push({
      sub: id,
      username: payload.username,
      fullName: payload.fullName,
      nickname: payload.nickname,
      membershipStatus: payload.membershipStatus,
      leadershipRole: payload.leadershipRole,
      joinedYear: payload.joinedYear,
      joinedSemester: payload.joinedSemester,
      introduction: payload.introduction
        ? `${payload.introduction.slice(0, 80)}...`
        : null,
      archived,
      websiteUserId,
    })

    if (opts.dryRun) continue
    if (!db) throw new Error('Postgres connection is missing in execute mode')

    const existing = await db
      .select()
      .from(memberCache)
      .where(eq(memberCache.sub, id))
      .limit(1)
    if (existing.length === 0) {
      const byUsername = await db
        .select()
        .from(memberCache)
        .where(eq(memberCache.username, payload.username!))
        .limit(1)
      if (byUsername.length > 0 && byUsername[0].sub !== id) {
        payload.username = `${payload.username}-${id.slice(0, 4)}`
      }
      await db.insert(memberCache).values({
        ...payload,
        createdAt: new Date(createdAtRaw),
        updatedAt: new Date(updatedAtRaw),
        archivedAt: archived
          ? new Date(
              archivedAtRaw && archivedAtRaw !== '\\N'
                ? archivedAtRaw
                : updatedAtRaw,
            )
          : null,
      })
      created++
    } else {
      const cur = existing[0]
      const needsUpdate =
        cur.username !== payload.username ||
        cur.fullName !== payload.fullName ||
        (cur.nickname ?? null) !== (payload.nickname ?? null) ||
        cur.membershipStatus !== payload.membershipStatus ||
        (cur.leadershipRole ?? null) !== (payload.leadershipRole ?? null) ||
        cur.joinedYear !== payload.joinedYear ||
        (cur.joinedSemester ?? null) !== (payload.joinedSemester ?? null) ||
        (cur.introduction ?? null) !== (payload.introduction ?? null)
      if (needsUpdate || (cur.archivedAt === null) === archived) {
        await db
          .update(memberCache)
          .set({
            username: payload.username,
            fullName: payload.fullName,
            nickname: payload.nickname,
            avatarUrl: payload.avatarUrl,
            membershipStatus: payload.membershipStatus,
            leadershipRole: payload.leadershipRole,
            joinedYear: payload.joinedYear,
            joinedSemester: payload.joinedSemester,
            introduction: payload.introduction,
            updatedAt: new Date(updatedAtRaw),
            archivedAt: archived
              ? new Date(
                  archivedAtRaw && archivedAtRaw !== '\\N'
                    ? archivedAtRaw
                    : updatedAtRaw,
                )
              : null,
          })
          .where(eq(memberCache.sub, id))
        updated++
      }
    }
  }

  // Five Drupal accounts are absent from Backstage. Keep them as (active)
  // alumni so their historical staff credits do not disappear.
  const backstageWebsiteIds = new Set(
    memberRows.map((cols) => cols[13]).filter((id) => id !== '\\N'),
  )
  for (const user of drupalUsers) {
    if (backstageWebsiteIds.has(String(user.uid))) continue
    const sub = `legacy-drupal-${user.uid}`
    const payload = buildMemberCachePayload({
      sub,
      username: user.username.toLowerCase(),
      fullName: user.fullName ?? user.username,
      nickname: user.nickname,
      avatarUrl: null,
      membershipStatus: legacyMembershipStatus(user.legacyStatus),
      leadershipRole: null,
      joinedSemesterRaw: normalizeLegacySemester(user.joinedSemester),
      introduction: user.introduction,
    })
    artifacts.push({
      sub,
      websiteUserId: String(user.uid),
      username: payload.username,
      fullName: payload.fullName,
      nickname: payload.nickname,
      membershipStatus: payload.membershipStatus,
      leadershipRole: null,
      joinedYear: payload.joinedYear,
      joinedSemester: payload.joinedSemester,
      introduction: payload.introduction
        ? `${payload.introduction.slice(0, 80)}...`
        : null,
      archived: false,
      legacyOnly: true,
    })
    if (opts.dryRun) continue
    if (!db) throw new Error('Postgres connection is missing in execute mode')
    const existing = await db
      .select()
      .from(memberCache)
      .where(eq(memberCache.sub, sub))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(memberCache).values({
        ...payload,
        createdAt: user.createdAt,
        updatedAt: user.createdAt,
        archivedAt: null,
      })
      created++
    } else {
      const current = existing[0]
      const differs =
        current.username !== payload.username ||
        current.fullName !== payload.fullName ||
        (current.nickname ?? null) !== (payload.nickname ?? null) ||
        current.membershipStatus !== payload.membershipStatus ||
        (current.leadershipRole ?? null) !== (payload.leadershipRole ?? null) ||
        current.joinedYear !== payload.joinedYear ||
        (current.joinedSemester ?? null) !== (payload.joinedSemester ?? null) ||
        (current.introduction ?? null) !== (payload.introduction ?? null) ||
        current.archivedAt !== null
      if (differs) {
        await db
          .update(memberCache)
          .set({
            ...payload,
            updatedAt: user.createdAt,
            archivedAt: null,
          })
          .where(eq(memberCache.sub, sub))
        updated++
      }
    }
  }

  console.log(
    `Members: parsed ${memberRows.length}, artifacts ${artifacts.length}, dryRun=${opts.dryRun}, created=${created} updated=${updated} skipped=${skipped}`,
  )

  const outPath = join(process.cwd(), 'oob', 'migrate-members.json')
  mkdirSync(join(process.cwd(), 'oob'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(artifacts, null, 2))
  console.log(`  -> wrote ${outPath}`)

  return { created, updated, total: artifacts.length }
}

async function migrateEventsAndVideos(
  db: ReturnType<typeof drizzle> | null,
  opts: { dryRun: boolean },
) {
  console.log('\n=== Events ===')
  // Fetch events via JSON to avoid tab parsing
  const eventJsonQuery = `
    SELECT JSON_OBJECT(
      'nid', n.nid,
      'vid', n.vid,
      'title', n.title,
      'status', n.status,
      'created', n.created,
      'changed', n.changed,
      'body', COALESCE(nr.body,''),
      'slug', (SELECT ua.dst FROM url_alias ua WHERE ua.src = CONCAT('node/', n.nid) AND ua.dst LIKE 'event/%' AND ua.dst NOT LIKE '%/feed' ORDER BY ua.pid DESC LIMIT 1)
    ) FROM node n LEFT JOIN node_revisions nr ON nr.vid = n.vid WHERE n.type='event'
  `
  const eventRows = mysqlJson(eventJsonQuery)
  console.log(`Fetched ${eventRows.length} events from MySQL`)

  const eventPayloads: Array<{
    key: string
    slug: string
    title: string
    description: string | null
    thumbCandidate: string | null
    startDate: string | null
    endDate: string | null
    status: 'draft' | 'published' | 'archived'
    createdAt: Date
    updatedAt: Date
  }> = []
  const usedEventSlugs = new Set<string>()

  for (const row of eventRows) {
    const r = row
    const nid = Number(r['nid'])
    const title = String(r['title'] ?? '')
    const statusNum = Number(r['status'] ?? 0)
    const created = Number(r['created'] ?? 0)
    const body = String(r['body'] ?? '')
    const slugRaw = r['slug'] as string | null
    let slug: string | null = null
    if (slugRaw && slugRaw !== 'NULL') {
      slug = slugRaw.startsWith('event/')
        ? slugRaw.slice('event/'.length)
        : slugRaw
    } else {
      slug = slugify(title)
    }
    slug = slug ? slugify(slug) : slugify(title)
    if (!slug) slug = `event-${nid}`
    if (slug.length > TEXT_LIMITS.slug) slug = slug.slice(0, TEXT_LIMITS.slug)

    const description = stripHtml(body) || null
    const descTrunc = description
      ? truncate(description, TEXT_LIMITS.description)
      : null

    // Correct startDate: for historical events the node.created is when the page was created,
    // not when the event happened. If title contains a year, use that year.
    // For the 6 new editorial events (from the original seed) we must preserve their correct dates,
    // otherwise the old dump's node.created (e.g. 2026-02-25 for Qpa 2025) would overwrite the correct 2025-10-07.
    const CORRECT_DATES: Record<string, string> = {
      'schonherz-qpa-2025': '2025-10-07',
      'simonyi-konferencia-2026': '2026-03-24',
      'golyabal-2025': '2025-10-31',
      'iii-sandor-laszlo-vitorlas-kupa-es-csaladi-nap': '2026-06-06',
      'golyahet-2025': '2025-08-31',
      'golyatabor-2025': '2025-08-13',
    }
    const CORRECT_END_DATES: Record<string, string | null> = {
      'schonherz-qpa-2025': '2025-10-11',
      'simonyi-konferencia-2026': null,
      'golyabal-2025': null,
      'iii-sandor-laszlo-vitorlas-kupa-es-csaladi-nap': null,
      'golyahet-2025': '2025-09-04',
      'golyatabor-2025': '2025-08-16',
    }
    let startDate: string | null = null
    let endDate: string | null = null
    if (slug in CORRECT_DATES) {
      startDate = CORRECT_DATES[slug]
      endDate = CORRECT_END_DATES[slug] ?? null
    } else {
      const yearMatch = title.match(/(19|20)\d{2}/)
      const titleYear = yearMatch ? yearMatch[0] : null
      const createdDate = created
        ? new Date(created * 1000).toISOString().slice(0, 10)
        : null
      const createdYear = createdDate?.slice(0, 4) ?? null
      if (titleYear) {
        if (createdYear && titleYear === createdYear && createdDate) {
          startDate = createdDate
        } else {
          startDate = `${titleYear}-01-01`
        }
      } else {
        startDate = createdDate
      }
      endDate = null
    }
    const status = statusNum === 1 ? 'published' : 'draft'
    if (usedEventSlugs.has(slug)) {
      const suffix = `-${nid}`
      slug = `${slug.slice(0, TEXT_LIMITS.slug - suffix.length)}${suffix}`
    }
    usedEventSlugs.add(slug)

    eventPayloads.push({
      key: `event-${nid}`,
      slug,
      title: truncate(title, TEXT_LIMITS.title) ?? title.slice(0, 200),
      description: descTrunc,
      thumbCandidate: null,
      startDate,
      endDate,
      status: status,
      createdAt: new Date(created * 1000),
      updatedAt: new Date(Number(r['changed'] ?? created) * 1000),
    })
  }

  console.log('\n=== Videos (fetching ...) ===')
  // Batched by nid range so a single huge query doesn't hit MySQL's max packet size.
  const maxNidQuery = `SELECT MAX(nid) as mx FROM node WHERE type='video'`
  const maxRows = mysqlJson(maxNidQuery)
  const maxNid = Number(maxRows[0]['mx'] ?? 4000)
  const batchSize = 500
  const allVideoRows: Record<string, unknown>[] = []
  for (let start = 0; start <= maxNid; start += batchSize) {
    const end = start + batchSize
    const q = `
      SELECT JSON_OBJECT(
        'nid', n.nid,
        'vid', n.vid,
        'title', n.title,
        'status', n.status,
        'created', n.created,
        'changed', n.changed,
        'body', COALESCE(nr.body,''),
        'baseFilename', c.field_video_base_filename_value,
        'isHq', c.field_video_is_hq_file_available_value,
        'isLq', c.field_video_is_lq_file_available_value,
        'profileNid', c.field_video_server_profile_nid,
        'shootingDate', s.field_video_shooting_date_value,
        'guests', c.field_show_guests_value,
        'slug', (SELECT ua.dst FROM url_alias ua WHERE ua.src = CONCAT('node/', n.nid) AND ua.dst LIKE 'video/%' AND ua.dst NOT LIKE '%/feed' ORDER BY ua.pid DESC LIMIT 1),
        'viewCount', COALESCE(nc.totalcount,0)
      ) FROM node n
      LEFT JOIN node_revisions nr ON nr.vid = n.vid
      LEFT JOIN content_type_video c ON c.vid = n.vid
      LEFT JOIN content_field_video_shooting_date s ON s.vid = n.vid
      LEFT JOIN node_counter nc ON nc.nid = n.nid
      WHERE n.type='video' AND n.nid >= ${start} AND n.nid < ${end}
    `
    const rows = mysqlJson(q)
    allVideoRows.push(...rows)
    if (rows.length > 0)
      console.log(`  batch ${start}-${end}: ${rows.length} rows`)
  }
  console.log(`Total video base rows: ${allVideoRows.length}`)

  // Drupal stored an explicit event-to-video relation. Some videos appear in
  // duplicate event nodes; the newest event node is the canonical parent.
  const eventLinkRows = mysqlJson(`
    SELECT JSON_OBJECT(
      'eventNid', event_node.nid,
      'videoNid', video_node.nid,
      'eventCreated', event_node.created
    )
    FROM content_field_show_videos relation
    JOIN node event_node
      ON event_node.nid = relation.nid AND event_node.type = 'event'
    JOIN node video_node
      ON video_node.nid = relation.field_show_videos_nid
      AND video_node.type = 'video'
    ORDER BY event_node.created, event_node.nid
  `)
  const eventKeyByVideoNid = new Map<number, string>()
  for (const row of eventLinkRows) {
    eventKeyByVideoNid.set(
      Number(row['videoNid']),
      `event-${Number(row['eventNid'])}`,
    )
  }

  const tagsQuery = `SELECT JSON_OBJECT('vid', tn.vid, 'name', td.name) FROM term_node tn JOIN term_data td ON td.tid=tn.tid JOIN node n ON n.vid=tn.vid WHERE n.type='video'`
  const tagRows = mysqlJson(tagsQuery)
  const tagsByVid = new Map<number, string[]>()
  for (const row of tagRows) {
    const r = row
    const vid = Number(r['vid'])
    const name = String(r['name'])
    if (!tagsByVid.has(vid)) tagsByVid.set(vid, [])
    tagsByVid.get(vid)!.push(name)
  }
  // Also ensure all historical tags from term_data are migrated even if unused
  const allTagsQuery = `SELECT JSON_OBJECT('name', name) FROM term_data`
  const allTagRows = mysqlJson(allTagsQuery)
  const allHistoricalTags = new Set<string>()
  for (const row of allTagRows) {
    const r = row
    const name = String(r['name'])
    if (name) allHistoricalTags.add(name)
  }
  // All historical staff roles (cast_cue nodes)
  const allRolesQuery = `SELECT JSON_OBJECT('title', title) FROM node WHERE type='cast_cue'`
  const allRoleRows = mysqlJson(allRolesQuery)
  const allHistoricalRoles = new Set<string>()
  for (const row of allRoleRows) {
    const r = row
    const title = String(r['title'])
    if (title) allHistoricalRoles.add(title)
  }

  const songsQuery = `SELECT JSON_OBJECT('vid', vid, 'song', field_music_value) FROM content_field_music WHERE field_music_value IS NOT NULL AND field_music_value <> ''`
  const songRows = mysqlJson(songsQuery)
  const songsByVid = new Map<number, string[]>()
  for (const row of songRows) {
    const r = row
    const vid = Number(r['vid'])
    const song = String(r['song'])
    if (!song) continue
    if (!songsByVid.has(vid)) songsByVid.set(vid, [])
    songsByVid.get(vid)!.push(song)
  }

  // content_field_cast_list -> field_cast_list_item_id -> content_type_cast_element -> uid + cue_nid -> role name
  const staffQuery = `
    SELECT JSON_OBJECT(
      'vid', cfcl.vid,
      'delta', cfcl.delta,
      'elementNid', cfcl.field_cast_list_item_id,
      'uid', cce.field_cast_person_uid,
      'cueNid', cce.field_cast_cue_nid,
      'username', u.name,
      'role', rn.title
    )
    FROM content_field_cast_list cfcl
    JOIN content_type_cast_element cce ON cce.vid = cfcl.field_cast_list_item_id
    JOIN users u ON u.uid = cce.field_cast_person_uid
    JOIN node rn ON rn.nid = cce.field_cast_cue_nid
    WHERE cfcl.field_cast_list_item_id IS NOT NULL
  `
  const staffRows = mysqlJson(staffQuery)
  const staffByVid = new Map<
    number,
    Array<{ username: string; role: string }>
  >()
  for (const row of staffRows) {
    const r = row
    const vid = Number(r['vid'])
    const username = String(r['username'] ?? '')
    const role = String(r['role'] ?? '')
    if (!username || !role) continue
    if (!staffByVid.has(vid)) staffByVid.set(vid, [])
    const list = staffByVid.get(vid)!
    if (!list.some((e) => e.username === username && e.role === role)) {
      list.push({ username, role })
    }
  }

  const videoPayloads: Array<Record<string, unknown>> = []
  const tagSet = new Set<string>()
  const roleSet = new Set<string>()
  for (const row of allVideoRows) {
    const r = row
    const nid = Number(r['nid'])
    const vid = Number(r['vid'])
    const titleRaw = String(r['title'] ?? 'Untitled')
    const title =
      truncate(titleRaw, TEXT_LIMITS.title) ?? titleRaw.slice(0, 200)
    const statusNum = Number(r['status'] ?? 0)
    const created = Number(r['created'] ?? 0)
    const body = String(r['body'] ?? '')
    const baseFilenameRaw = r['baseFilename'] as string | null
    const baseFilename =
      baseFilenameRaw && baseFilenameRaw !== 'NULL'
        ? String(baseFilenameRaw)
        : null
    const isHq = Number(r['isHq'] ?? 0) === 1
    const isLq = Number(r['isLq'] ?? 0) === 1
    const profileNid = r['profileNid'] as string | null
    const shootingDateRaw = r['shootingDate'] as string | null
    const guestsRaw = r['guests'] as string | null
    const slugRaw = r['slug'] as string | null
    const viewCount = Number(r['viewCount'] ?? 0)

    let slug: string
    if (slugRaw && slugRaw !== 'NULL') {
      const dst = String(slugRaw)
      slug = dst.startsWith('video/') ? dst.slice('video/'.length) : dst
      slug = slugify(slug)
    } else {
      slug = slugify(titleRaw)
    }
    if (!slug) slug = `video-${nid}`
    if (slug.length > TEXT_LIMITS.slug) slug = slug.slice(0, TEXT_LIMITS.slug)

    const description = stripHtml(body) || null
    const descTrunc = description
      ? truncate(description, TEXT_LIMITS.description)
      : null

    const guests =
      guestsRaw && guestsRaw !== 'NULL'
        ? truncate(stripHtml(String(guestsRaw)), TEXT_LIMITS.guestsOrSongs)
        : null

    const songsArr = songsByVid.get(vid) ?? []
    const songs =
      songsArr.length > 0
        ? truncate(songsArr.join('\n'), TEXT_LIMITS.guestsOrSongs)
        : null

    const encodingGroup = encodingGroupFromProfile(
      profileNid && profileNid !== 'NULL' ? String(profileNid) : null,
    )
    const visibility: 'public' | 'schonherz' | 'bss' = 'public'
    const status: 'draft' | 'published' | 'archived' =
      statusNum === 1 ? 'published' : 'draft'
    const recordedAt =
      shootingDateRaw && shootingDateRaw !== 'NULL'
        ? String(shootingDateRaw).slice(0, 10)
        : null
    // publishedAt: use node created as fallback for published videos, as new schema requires publishedAt for published status
    let publishedAt: Date | null = null
    if (status === 'published') {
      publishedAt = created ? new Date(created * 1000) : new Date()
    }

    const finalEncodingGroup = encodingGroup
    const finalHasHq = isHq
    const finalHasLq = isLq
    const finalBaseFilename = baseFilename
      ? truncate(baseFilename.replace(/[\\/]/g, ''), 255)
      : null

    const videoTagNames = tagsByVid.get(vid) ?? []
    for (const tagName of videoTagNames) tagSet.add(tagName)
    const staff = staffByVid.get(vid) ?? []
    for (const s of staff) roleSet.add(s.role)

    videoPayloads.push({
      key: `video-${nid}`,
      nid,
      vid,
      title,
      slug,
      description: descTrunc,
      guests,
      songs,
      encodingGroup: finalEncodingGroup,
      hasHq: finalHasHq,
      hasLq: finalHasLq,
      baseFilename: finalBaseFilename,
      visibility,
      status,
      recordedAt,
      publishedAt,
      viewCount,
      createdAt: new Date(created * 1000),
      updatedAt: new Date(Number(r['changed'] ?? created) * 1000),
      eventKey: eventKeyByVideoNid.get(nid) ?? null,
      tags: videoTagNames,
      staff,
    })
  }

  // Union all historical tags/roles so empty ones are also created
  for (const t of allHistoricalTags) tagSet.add(t)
  for (const r of allHistoricalRoles) roleSet.add(r)

  // --- Event thumbnails from linked videos (unique per event) ---
  const videosByEventKey = new Map<string, typeof videoPayloads>()
  for (const vp of videoPayloads) {
    const ek = vp['eventKey'] as string | null
    if (!ek) continue
    if (!videosByEventKey.has(ek)) videosByEventKey.set(ek, [])
    videosByEventKey.get(ek)!.push(vp)
  }
  for (const ev of eventPayloads) {
    const linked = videosByEventKey.get(ev.key) ?? []
    if (linked.length === 0) {
      // No linked video: leave thumbnail null to avoid duplicating another event's image
      ev.thumbCandidate = null
      continue
    }
    const cand =
      linked
        .filter((c) => c['baseFilename'] && c['status'] === 'published')
        .sort(
          (a, b) => (b['viewCount'] as number) - (a['viewCount'] as number),
        )[0] ?? linked[0]
    const bf = cand['baseFilename'] as string | null
    const eg = cand['encodingGroup'] as string | null
    if (bf && eg) {
      const group = eg as '4a3_SD' | '16a9_SD' | '16a9_HD'
      const dirMap: Record<string, string> = {
        '4a3_SD': 'bss_vagott_web_4a3_SD',
        '16a9_SD': 'bss_vagott_web_16a9_SD',
        '16a9_HD': 'bss_vagott_web_16a9_HD',
      }
      const dir = dirMap[group] ?? 'bss_vagott_web_16a9_HD'
      ev.thumbCandidate = `https://v.bsstudio.hu/${dir}/keyframe/${bf}_lq.png`
    }
  }

  // Write artifacts for dry-run inspection
  const oobDir = join(process.cwd(), 'oob')
  mkdirSync(oobDir, { recursive: true })
  writeFileSync(
    join(oobDir, 'migrate-events.json'),
    JSON.stringify(eventPayloads, null, 2),
  )
  writeFileSync(
    join(oobDir, 'migrate-videos.json'),
    JSON.stringify(videoPayloads, null, 2),
  )
  writeFileSync(
    join(oobDir, 'migrate-catalog.json'),
    JSON.stringify({ tags: [...tagSet], staffRoles: [...roleSet] }, null, 2),
  )
  console.log(
    `  -> wrote oob/migrate-events.json (${eventPayloads.length} events)`,
  )
  console.log(
    `  -> wrote oob/migrate-videos.json (${videoPayloads.length} videos)`,
  )
  console.log(`  -> distinct tags ${tagSet.size}, roles ${roleSet.size}`)

  if (opts.dryRun) {
    console.log('\nDry run: skipping DB writes.')
    return {
      events: eventPayloads.length,
      videos: videoPayloads.length,
      tags: tagSet.size,
      roles: roleSet.size,
    }
  }
  if (!db) throw new Error('Postgres connection is missing in execute mode')

  // --- DB writes ---
  console.log('\n=== Writing to Postgres ===')
  // Tags and roles first (like seed importer)
  let createdTags = 0
  let createdRoles = 0
  for (const tagName of tagSet) {
    const normalized = normalizeCatalogName(tagName)
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.normalizedName, normalized))
      .limit(1)
    if (existing.length === 0) {
      await db
        .insert(tags)
        .values({ name: tagName, normalizedName: normalized })
      createdTags++
    }
  }
  const roleNames = [...roleSet]
  for (const [index, roleName] of roleNames.entries()) {
    const normalized = normalizeCatalogName(roleName)
    const existing = await db
      .select({ id: staffRoles.id })
      .from(staffRoles)
      .where(eq(staffRoles.normalizedName, normalized))
      .limit(1)
    if (existing.length === 0) {
      await db.insert(staffRoles).values({
        name: roleName,
        normalizedName: normalized,
        displayOrder: index,
      })
      createdRoles++
    }
  }
  const tagIdByNorm = new Map<string, string>()
  if (tagSet.size > 0) {
    const rows = await db
      .select({ id: tags.id, normalizedName: tags.normalizedName })
      .from(tags)
    for (const row of rows)
      if ([...tagSet].map(normalizeCatalogName).includes(row.normalizedName))
        tagIdByNorm.set(row.normalizedName, row.id)
  }
  const roleIdByNorm = new Map<string, string>()
  if (roleSet.size > 0) {
    const rows = await db
      .select({ id: staffRoles.id, normalizedName: staffRoles.normalizedName })
      .from(staffRoles)
    for (const row of rows)
      if ([...roleSet].map(normalizeCatalogName).includes(row.normalizedName))
        roleIdByNorm.set(row.normalizedName, row.id)
  }

  // Resolve member subs for staff (need username -> sub) – case-insensitive
  const allStaffUsernames = [
    ...new Set(
      videoPayloads.flatMap((v) =>
        (v['staff'] as Array<{ username: string }>).map((s) => s.username),
      ),
    ),
  ]
  const allStaffLower = [
    ...new Set(allStaffUsernames.map((u) => u.toLowerCase())),
  ]
  const subByUsername = new Map<string, string>() // lowercased username -> sub
  if (allStaffLower.length > 0) {
    const chunkSize = 500
    for (let i = 0; i < allStaffLower.length; i += chunkSize) {
      const chunk = allStaffLower.slice(i, i + chunkSize)
      const rows = await db
        .select({ sub: memberCache.sub, username: memberCache.username })
        .from(memberCache)
        .where(inArray(memberCache.username, chunk))
      for (const r of rows) {
        if (r.username !== null)
          subByUsername.set(r.username.toLowerCase(), r.sub)
      }
    }
    const missing = allStaffUsernames.filter(
      (u) => !subByUsername.has(u.toLowerCase()),
    )
    if (missing.length > 0) {
      console.warn(
        `Warning: ${missing.length} staff usernames not found in memberCache (will be skipped): ${missing.slice(0, 10).join(', ')}`,
      )
    }
  }

  // Events
  let createdEvents = 0
  let updatedEvents = 0
  const eventIdByKey = new Map<string, string>()
  for (const ev of eventPayloads) {
    const existingRows = await db
      .select()
      .from(events)
      .where(eq(events.slug, ev.slug))
      .limit(1)
    const existing = existingRows.at(0)
    if (!existing) {
      const inserted = await db
        .insert(events)
        .values({
          slug: ev.slug,
          title: ev.title,
          description: ev.description,
          thumbnailUrl: ev.thumbCandidate,
          startDate: ev.startDate,
          endDate: ev.endDate,
          status: ev.status as never,
          createdAt: ev.createdAt,
          updatedAt: ev.updatedAt,
        })
        .returning()
      const row = inserted[0]
      eventIdByKey.set(ev.key, row.id)
      createdEvents++
    } else {
      eventIdByKey.set(ev.key, existing.id)
      const changes = {
        title: ev.title,
        description: ev.description,
        thumbnailUrl: ev.thumbCandidate,
        startDate: ev.startDate,
        endDate: ev.endDate,
        status: ev.status as never,
      }
      const before = existing as unknown as Record<string, unknown>
      const differs = Object.keys(changes).some(
        (k) =>
          JSON.stringify(before[k]) !==
          JSON.stringify((changes as Record<string, unknown>)[k]),
      )
      if (differs) {
        await db
          .update(events)
          .set({
            ...changes,
            version: existing.version + 1,
            updatedAt: ev.updatedAt,
          })
          .where(eq(events.id, existing.id))
        updatedEvents++
      }
    }
  }
  console.log(`Events: ${createdEvents} created, ${updatedEvents} updated`)

  // Videos
  let createdVideos = 0
  let updatedVideos = 0
  let tagLinks = 0
  let staffLinks = 0

  // For deduplication of slugs that may collide after slugify within this run
  const generatedSlugs = new Set<string>()

  for (const vp of videoPayloads) {
    let slug = vp['slug'] as string
    const baseSlug = slug
    let suffix = 2
    // Only deduplicate intra-run duplicates (two old videos slugify to same value).
    // If slug already exists in DB, we will update that row instead of creating a new one,
    // so no suffix is needed for the first occurrence.
    while (generatedSlugs.has(slug)) {
      const maxBaseLen = 200 - String(suffix).length - 1
      slug = `${baseSlug.slice(0, maxBaseLen)}-${suffix}`
      suffix++
      if (suffix > 100) throw new Error(`Cannot find free slug for ${baseSlug}`)
    }
    if (slug !== vp['slug']) {
      console.log(
        `  slug collision (intra-run): ${vp['slug']} -> ${slug} for ${vp['key']}`,
      )
      vp['slug'] = slug
    }
    generatedSlugs.add(slug)

    const existingRows = await db
      .select()
      .from(videos)
      .where(eq(videos.slug, slug))
      .limit(1)
    const existing = existingRows.at(0)

    // May be null, which clears event links left over from earlier runs.
    const inferredEventKey = vp['eventKey'] as string | null
    const inferredEventId = inferredEventKey
      ? (eventIdByKey.get(inferredEventKey) ?? null)
      : null
    const desiredBase = {
      title: vp['title'] as string,
      description: vp['description'] as string | null,
      guests: vp['guests'] as string | null,
      songs: vp['songs'] as string | null,
      encodingGroup: vp['encodingGroup'] as never,
      hasHq: vp['hasHq'] as boolean,
      hasLq: vp['hasLq'] as boolean,
      baseFilename: vp['baseFilename'] as string | null,
      visibility: vp['visibility'] as never,
      status: vp['status'] as never,
      eventId: inferredEventId,
      recordedAt: vp['recordedAt'] as string | null,
      viewCount: vp['viewCount'] as number,
    }

    const desiredTagIds = (vp['tags'] as string[])
      .map((t) => tagIdByNorm.get(normalizeCatalogName(t)))
      .filter((id): id is string => Boolean(id))

    const desiredStaff = (
      vp['staff'] as Array<{ username: string; role: string }>
    )
      .map((entry) => {
        const sub = subByUsername.get(entry.username.toLowerCase())
        const roleId = roleIdByNorm.get(normalizeCatalogName(entry.role))
        if (!sub || !roleId) return null
        return { roleId, memberSub: sub }
      })
      .filter((e): e is { roleId: string; memberSub: string } => e !== null)

    if (!existing) {
      const publishedAt =
        (vp['publishedAt'] as Date | null) ??
        (vp['status'] === 'published' ? new Date() : null)
      const inserted = await db
        .insert(videos)
        .values({
          slug,
          ...desiredBase,
          publishedAt,
          createdAt: vp['createdAt'] as Date,
          updatedAt: vp['updatedAt'] as Date,
        })
        .returning()
      const row = inserted[0]
      createdVideos++
      if (desiredTagIds.length > 0) {
        await db
          .insert(videoTags)
          .values(desiredTagIds.map((tagId) => ({ videoId: row.id, tagId })))
        tagLinks += desiredTagIds.length
      }
      if (desiredStaff.length > 0) {
        await db
          .insert(videoStaff)
          .values(desiredStaff.map((e) => ({ videoId: row.id, ...e })))
        staffLinks += desiredStaff.length
      }
    } else {
      const existingPublishedAt = existing.publishedAt
      const desiredPublishedAt =
        (vp['publishedAt'] as Date | null) ?? existingPublishedAt
      const before = existing as unknown as Record<string, unknown>
      const candidate: Record<string, unknown> = {
        ...desiredBase,
        publishedAt: desiredPublishedAt?.toISOString() ?? null,
      }
      const beforeNorm: Record<string, unknown> = {}
      for (const k of Object.keys(candidate))
        beforeNorm[k] =
          before[k] instanceof Date ? before[k].toISOString() : before[k]
      const differs = Object.keys(candidate).some(
        (k) => JSON.stringify(beforeNorm[k]) !== JSON.stringify(candidate[k]),
      )

      if (differs) {
        await db
          .update(videos)
          .set({
            ...desiredBase,
            publishedAt: desiredPublishedAt,
            version: existing.version + 1,
            updatedAt: vp['updatedAt'] as Date,
          })
          .where(eq(videos.id, existing.id))
        updatedVideos++
      }

      const currentTagIds = (
        await db
          .select({ tagId: videoTags.tagId })
          .from(videoTags)
          .where(eq(videoTags.videoId, existing.id))
      ).map((r) => r.tagId)
      const tagDiffer =
        [...currentTagIds].sort().join(',') !==
        [...desiredTagIds].sort().join(',')
      if (tagDiffer) {
        await db.delete(videoTags).where(eq(videoTags.videoId, existing.id))
        if (desiredTagIds.length > 0) {
          await db
            .insert(videoTags)
            .values(
              desiredTagIds.map((tagId) => ({ videoId: existing.id, tagId })),
            )
        }
      }
      const currentStaff = await db
        .select({ roleId: videoStaff.roleId, memberSub: videoStaff.memberSub })
        .from(videoStaff)
        .where(eq(videoStaff.videoId, existing.id))
      const staffDiffer =
        currentStaff.length !== desiredStaff.length ||
        desiredStaff.some(
          (d) =>
            !currentStaff.some(
              (c) => c.roleId === d.roleId && c.memberSub === d.memberSub,
            ),
        )
      if (staffDiffer) {
        await db.delete(videoStaff).where(eq(videoStaff.videoId, existing.id))
        if (desiredStaff.length > 0) {
          await db
            .insert(videoStaff)
            .values(desiredStaff.map((e) => ({ videoId: existing.id, ...e })))
        }
      }
      tagLinks += desiredTagIds.length
      staffLinks += desiredStaff.length
    }
  }

  console.log(
    `Videos: ${createdVideos} created, ${updatedVideos} updated, tagLinks ${tagLinks}, staffLinks ${staffLinks}`,
  )
  return {
    events: { created: createdEvents, updated: updatedEvents },
    videos: { created: createdVideos, updated: updatedVideos },
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = !args.includes('--execute')

  console.log(
    `Legacy migration ${dryRun ? '(dry-run)' : '(execute)'} started at ${new Date().toISOString()}`,
  )
  console.log('  MySQL source: ../bss-dump via bss-dump-mysql-1')
  console.log('  Postgres target: DATABASE_URL')

  if (!dryRun && !process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is not set. Set it in .env (see .env.example) or run with --dry-run.',
    )
    process.exit(1)
  }

  let db: ReturnType<typeof drizzle> | null = null
  let pool: Pool | null = null
  if (!dryRun) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    db = drizzle({ client: pool })
  }

  await migrateMembers(db, { dryRun })
  await migrateEventsAndVideos(db, { dryRun })

  if (pool) await pool.end()

  console.log('\nDone. Check oob/migrate-*.json for artifacts.')
  console.log(
    '  If dry-run looked good, run: pnpm exec tsx scripts/migrate-legacy.ts --execute',
  )
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
