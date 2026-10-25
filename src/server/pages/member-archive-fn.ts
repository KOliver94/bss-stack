import { createServerFn } from '@tanstack/react-start'
import { getDefaultDb } from '#/server/auth/session-store.ts'
import {
  InvalidInputError,
  optionalNumberInput,
  recordInput,
} from '#/server/shared/server-fn-input.ts'
import { getMemberArchivePage, isArchiveKind } from './members.ts'
import type { ArchiveKind } from './members.ts'

export const loadArchiveMembersServer = createServerFn({ method: 'GET' })
  .validator((input: { kind: ArchiveKind; page?: number }) => {
    const raw = recordInput(input)
    const kind = raw['kind']
    if (typeof kind !== 'string' || !isArchiveKind(kind)) {
      throw new InvalidInputError()
    }
    return {
      kind,
      page: optionalNumberInput(raw['page']),
    }
  })
  .handler(async ({ data }) => {
    const db = await getDefaultDb()
    return getMemberArchivePage(db, data.kind, { page: data.page })
  })
