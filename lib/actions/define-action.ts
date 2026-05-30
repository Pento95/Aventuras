import type { SqlOp } from '@/lib/db'

import type { DbCtx } from './types'

// Wraps a write-set builder in a single atomic transaction. The builder may read
// via ctx.db for pre-write computation (e.g. undo_payload) and returns the ops to run.
export function defineAction<Args, R>(
  build: (args: Args, ctx: DbCtx) => Promise<{ ops: SqlOp[]; result: R }>,
): (args: Args, ctx: DbCtx) => Promise<R> {
  return async (args, ctx) => {
    const { ops, result } = await build(args, ctx)
    await ctx.runInTransaction(ops)
    return result
  }
}
