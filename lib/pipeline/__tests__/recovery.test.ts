import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { deltas, pipelineRuns, storyEntries } from '@/lib/db'
import { getDiagnosticsSnapshot } from '@/lib/diagnostics'
import { recoverInFlightRuns } from '@/lib/pipeline'

import { makeHarness, resetSingletons } from './harness'

async function seedOrphan(
  db: Awaited<ReturnType<typeof makeHarness>>['db'],
  o: { runId: string; actionId: string; startedAt: number },
): Promise<void> {
  await db.insert(pipelineRuns).values({
    runId: o.runId,
    kind: 'per-turn',
    actionId: o.actionId,
    storyId: 's1',
    startedAt: o.startedAt,
  })
}

describe('recoverInFlightRuns', () => {
  beforeEach(() => resetSingletons())
  afterEach(() => resetSingletons())

  it('reverses dirty orphans, deletes clean ones, and reports failures', async () => {
    const { db, ctx } = await makeHarness()

    // dirty orphan A: one create delta on a real row → reverse-replay deletes it
    await seedOrphan(db, { runId: 'run_a', actionId: 'act_a', startedAt: 1 })
    await db.insert(storyEntries).values({
      id: 'entry_a',
      branchId: 'b1',
      position: 1,
      kind: 'ai_reply',
      content: 'a',
      createdAt: 1,
    })
    await db.insert(deltas).values({
      id: 'delta_a',
      branchId: 'b1',
      entryId: 'entry_a',
      actionId: 'act_a',
      logPosition: 1,
      source: 'ai_classifier',
      targetTable: 'story_entries',
      targetId: 'entry_a',
      op: 'create',
      undoPayload: null,
      encodingVersion: 1,
      createdAt: 1,
    })

    // clean orphan B: no deltas → row deleted
    await seedOrphan(db, { runId: 'run_b', actionId: 'act_b', startedAt: 2 })

    // failing orphan C: a delta on an unknown target_table → DeltaReplayError
    await seedOrphan(db, { runId: 'run_c', actionId: 'act_c', startedAt: 3 })
    await db.insert(deltas).values({
      id: 'delta_c',
      branchId: 'b1',
      entryId: null,
      actionId: 'act_c',
      logPosition: 2,
      source: 'ai_classifier',
      targetTable: 'bogus_table',
      targetId: 'x',
      op: 'create',
      undoPayload: null,
      encodingVersion: 1,
      createdAt: 1,
    })

    const report = await recoverInFlightRuns(ctx)

    expect(report.reversed).toEqual([
      { runId: 'run_a', kind: 'per-turn', actionId: 'act_a', storyId: 's1', deltas: 1 },
    ])
    expect(report.failures.map((f) => f.runId)).toEqual(['run_c'])

    // A recovered, its entry reversed
    const [a] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.runId, 'run_a'))
    expect(a.outcome).toBe('recovered')
    expect(a.finishedAt).not.toBeNull()
    expect(
      (await db.select().from(storyEntries).where(eq(storyEntries.id, 'entry_a'))).length,
    ).toBe(0)

    // B deleted
    expect(
      (await db.select().from(pipelineRuns).where(eq(pipelineRuns.runId, 'run_b'))).length,
    ).toBe(0)

    // C retained for next boot
    const [c] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.runId, 'run_c'))
    expect(c.finishedAt).toBeNull()

    const logs = getDiagnosticsSnapshot().logEntries
    expect(logs.some((e) => e.kind === 'pipeline.recovered')).toBe(true)
    expect(logs.some((e) => e.kind === 'pipeline.recovery_failed')).toBe(true)
  })

  it('a non-DeltaReplayError during marker cleanup is caught — boot is not blocked', async () => {
    const { db, ctx } = await makeHarness()
    // clean orphan (0 deltas) → triggers the DELETE path
    await seedOrphan(db, { runId: 'run_x', actionId: 'act_x', startedAt: 1 })

    const throwingDb = new Proxy(ctx.db, {
      get(target, prop, receiver) {
        if (prop === 'delete') {
          return () => {
            throw new Error('transient db failure')
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })

    const report = await recoverInFlightRuns({ ...ctx, db: throwingDb })

    expect(report.failures.map((f) => f.runId)).toContain('run_x')
    expect(report.reversed).toEqual([])
  })
})
