import { and, desc, eq } from 'drizzle-orm'

import { deltas } from '@/lib/db'
import type { Delta, SqlOp } from '@/lib/db'

import { applyUndoPayload } from './delta-encoding'
import { COLUMN_SCHEMAS, TARGET_TABLES } from './registries'
import type { TargetTableDescriptor } from './registries'
import type { DbCtx } from './types'

export class DeltaReplayError extends Error {
  readonly actionId: string
  constructor(message: string, opts: { cause: unknown; actionId: string }) {
    super(message, { cause: opts.cause })
    this.name = 'DeltaReplayError'
    this.actionId = opts.actionId
  }
}

function descriptorFor(name: string): TargetTableDescriptor {
  const descriptor = TARGET_TABLES[name]
  if (!descriptor) throw new Error(`reverse-replay: unknown target_table ${name}`)
  return descriptor
}

// Build undo ops for one action's deltas (already in log_position DESC order).
// A per-row working copy threads each op=update undo onto the prior one so multiple
// updates to the SAME row — even touching disjoint sub-keys of a JSON column —
// compose correctly instead of clobbering via stale-base whole-column overwrites.
async function buildUndoOps(rows: Delta[], ctx: DbCtx): Promise<SqlOp[]> {
  const working = new Map<string, Record<string, unknown>>()
  const ops: SqlOp[] = []

  for (const delta of rows) {
    const { table, idCol, branchCol } = descriptorFor(delta.targetTable)
    const where = branchCol
      ? and(eq(branchCol, delta.branchId), eq(idCol, delta.targetId))
      : eq(idCol, delta.targetId)
    const key = `${delta.targetTable}:${delta.branchId}:${delta.targetId}`

    if (delta.op === 'create') {
      working.delete(key)
      ops.push(ctx.db.delete(table).where(where).toSQL())
      continue
    }
    if (delta.op === 'delete') {
      const full = (delta.undoPayload ?? {}) as Record<string, unknown>
      working.set(key, { ...full })
      ops.push(ctx.db.insert(table).values(full).toSQL())
      continue
    }

    let row = working.get(key)
    if (!row) {
      const [current] = (await ctx.db.select().from(table).where(where)) as Record<
        string,
        unknown
      >[]
      row = { ...(current ?? {}) }
      working.set(key, row)
    }
    const payload = (delta.undoPayload ?? {}) as Record<string, unknown>
    const restored: Record<string, unknown> = {}
    for (const [col, partial] of Object.entries(payload)) {
      const schema = COLUMN_SCHEMAS[delta.targetTable]?.[col]
      const value = schema
        ? applyUndoPayload(
            schema,
            (row[col] as Record<string, unknown>) ?? {},
            partial as Record<string, unknown>,
          )
        : partial // scalar column: whole-value restore
      restored[col] = value
      row[col] = value // thread into the working copy for later-in-DESC undos
    }
    ops.push(ctx.db.update(table).set(restored).where(where).toSQL())
  }

  return ops
}

export async function reverseReplayDeltas(actionId: string, ctx: DbCtx): Promise<number> {
  try {
    const rows = (await ctx.db
      .select()
      .from(deltas)
      .where(eq(deltas.actionId, actionId))
      .orderBy(desc(deltas.logPosition))) as Delta[]
    if (rows.length === 0) return 0

    const ops = await buildUndoOps(rows, ctx)
    await ctx.runInTransaction(ops)
    return rows.length
  } catch (e) {
    if (e instanceof DeltaReplayError) throw e
    throw new DeltaReplayError('Reverse-replay failed', { cause: e, actionId })
  }
}
