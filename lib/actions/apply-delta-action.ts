import { and, eq, sql } from 'drizzle-orm'

import { deltas, storyEntries } from '@/lib/db'
import type { SqlOp } from '@/lib/db'
import { generateId } from '@/lib/ids'

import { computeUndoPayload } from './delta-encoding'
import { COLUMN_SCHEMAS } from './registries'
import type { DbCtx, MutationResult, PipelineAction } from './types'

type Args = { action: PipelineAction; actionId: string; branchId: string; entryId?: string | null }

// MAX+1-within-branch as a subquery so the assignment is atomic inside the INSERT.
function nextLogPosition(branchId: string) {
  return sql<number>`(SELECT COALESCE(MAX(${deltas.logPosition}), 0) + 1 FROM ${deltas} WHERE ${deltas.branchId} = ${branchId})`
}

export async function applyDeltaAction(args: Args, ctx: DbCtx): Promise<MutationResult> {
  const { action, actionId, branchId } = args
  const entryId = args.entryId ?? null
  const ops: SqlOp[] = []
  let targetTable: string
  let targetId: string
  let op: 'create' | 'update' | 'delete'
  let undoPayload: Record<string, unknown> | null

  if (action.kind === 'createStoryEntry') {
    const { entry } = action.payload
    targetTable = 'story_entries'
    targetId = entry.id
    op = 'create'
    undoPayload = null
    ops.push(ctx.db.insert(storyEntries).values(entry).toSQL())
  } else {
    // updateStoryEntryMetadata
    const { branchId: bid, id, metadata } = action.payload
    targetTable = 'story_entries'
    targetId = id
    op = 'update'
    const [current] = await ctx.db
      .select()
      .from(storyEntries)
      .where(and(eq(storyEntries.branchId, bid), eq(storyEntries.id, id)))
    const before = (current?.metadata ?? {}) as Record<string, unknown>
    // Column-keyed: reverse-replay iterates undo_payload's top-level keys as
    // target columns. metadata is the column; the inner object is its partial.
    undoPayload = {
      metadata: computeUndoPayload(COLUMN_SCHEMAS.story_entries.metadata, before, metadata),
    }
    ops.push(
      ctx.db
        .update(storyEntries)
        .set({ metadata })
        .where(and(eq(storyEntries.branchId, bid), eq(storyEntries.id, id)))
        .toSQL(),
    )
  }

  const deltaId = generateId('delta')
  ops.unshift(
    ctx.db
      .insert(deltas)
      .values({
        id: deltaId,
        branchId,
        entryId,
        actionId,
        logPosition: nextLogPosition(branchId),
        source: action.source,
        targetTable,
        targetId,
        op,
        undoPayload,
        encodingVersion: 1,
        createdAt: Date.now(),
      })
      .toSQL(),
  )

  await ctx.runInTransaction(ops)

  // Read back by this delta's own id (not actionId): a multi-delta action shares
  // one actionId, so an actionId lookup would return an arbitrary row's position.
  const [row] = await ctx.db
    .select({ lp: deltas.logPosition })
    .from(deltas)
    .where(eq(deltas.id, deltaId))
  return { status: 'ok', logPosition: row.lp }
}
