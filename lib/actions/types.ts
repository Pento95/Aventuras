import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import type { EntryMetadata, NewStoryEntry, SqlOp, dbSchema } from '@/lib/db'

export type DeltaSource = 'ai_classifier' | 'user_edit' | 'lore_agent' | 'chapter_close'
export type MutationSource = 'user' | 'pipeline'

// Db handle accepted by the action layer. Widened so both the proxy (async) and
// expo (sync) drivers satisfy it; the query-builder + .toSQL() surface is uniform.
export type DbCtx = {
  db: BaseSQLiteDatabase<'async' | 'sync', unknown, typeof dbSchema>
  runInTransaction: (ops: SqlOp[]) => Promise<void>
}

export type PipelineAction =
  | { kind: 'createStoryEntry'; source: DeltaSource; payload: { entry: NewStoryEntry } }
  | {
      kind: 'updateStoryEntryMetadata'
      source: DeltaSource
      payload: { branchId: string; id: string; metadata: EntryMetadata }
    }

export type MutationResult =
  | { status: 'ok'; logPosition: number }
  | { status: 'rejected'; reason: string }
