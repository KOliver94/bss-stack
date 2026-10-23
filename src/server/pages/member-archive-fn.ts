import { createServerFn } from '@tanstack/react-start'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import {
  InvalidInputError,
  optionalNumberInput,
  recordInput,
} from '#/server/shared/server-fn-input.ts'
import { getMemberArchivePage } from './members.ts'
import type { ArchiveKind } from './members.ts'

const ARCHIVE_KINDS: Record<ArchiveKind, true> = {
  archived: true,
  alumni: true,
}

export const loadArchiveMembersServer = createServerFn({ method: 'GET' })
  .validator((input: { kind: ArchiveKind; page?: number }) => {
    const raw = recordInput(input)
    const kind = raw['kind']
    if (typeof kind !== 'string' || !Object.hasOwn(ARCHIVE_KINDS, kind)) {
      throw new InvalidInputError()
    }
    return {
      kind: kind as ArchiveKind,
      page: optionalNumberInput(raw['page']),
    }
  })
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getMemberArchivePage(db, data.kind, { page: data.page })
  })
