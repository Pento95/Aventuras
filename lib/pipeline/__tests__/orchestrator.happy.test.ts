import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type PipelineAction } from '@/lib/actions'
import { deltas, pipelineRuns, storyEntries } from '@/lib/db'
import { getCurrentActionId, getDiagnosticsSnapshot } from '@/lib/diagnostics'
import { definePipeline, pipelineEventBus, runPipeline, type PhaseResult } from '@/lib/pipeline'
import { domain } from '@/lib/stores'

import { makeHarness, resetSingletons } from './harness'

const base = { affordance: 'invisible', gateBehavior: 'hard-gate', concurrencyPolicy: {} } as const

// Synthetic phase: warn (recoverable) -> create entry -> complete.
async function* phase(): AsyncGenerator<
  | { type: 'recoverable_error'; error: { kind: 'phase-logic'; detail: string } }
  | { type: 'delta_emitted'; action: PipelineAction },
  PhaseResult
> {
  yield { type: 'recoverable_error', error: { kind: 'phase-logic', detail: 'synthetic hiccup' } }
  yield {
    type: 'delta_emitted',
    action: {
      kind: 'createStoryEntry',
      source: 'ai_classifier',
      payload: {
        entry: {
          id: 'entry_1',
          branchId: 'b1',
          position: 1,
          kind: 'ai_reply',
          content: 'hi',
          createdAt: 1,
        },
      },
    },
  }
  return { status: 'completed' }
}

describe('orchestrator happy path', () => {
  beforeEach(() => resetSingletons())
  afterEach(() => resetSingletons())

  it('runs begin -> delta -> commit and updates every surface', async () => {
    const { db, ctx } = await makeHarness()
    definePipeline({ kind: 'synthetic', phases: [{ name: 'only', run: phase }], ...base })

    let sizeDuringRun = -1
    const off = pipelineEventBus.subscribe('run_start', () => {
      sizeDuringRun = domain.getTxState().runs.size
    })
    const result = await runPipeline('synthetic', ctx)
    off()

    expect(result.outcome).toBe('completed')
    expect(sizeDuringRun).toBe(1) // run present during execution
    expect(domain.getTxState().runs.size).toBe(0) // cleared after

    const [pr] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.runId, result.runId))
    expect(pr.outcome).toBe('completed')
    expect(pr.finishedAt).not.toBeNull()

    expect((await db.select().from(deltas)).length).toBe(1)
    expect(
      (await db.select().from(storyEntries).where(eq(storyEntries.id, 'entry_1'))).length,
    ).toBe(1)

    const snap = getDiagnosticsSnapshot()
    const turn = snap.turnCaptures.find((t) => t.actionId === result.actionId)
    expect(turn?.outcome).toBe('completed')
    expect(turn?.endedAt).toBeDefined()
    expect(snap.logEntries.some((e) => e.kind === 'pipeline.run_complete')).toBe(true)
  })

  it('threads the ambient actionId through logger.warn, cleared after commit', async () => {
    const { ctx } = await makeHarness()
    definePipeline({ kind: 'synthetic', phases: [{ name: 'only', run: phase }], ...base })
    const result = await runPipeline('synthetic', ctx)

    const warn = getDiagnosticsSnapshot().logEntries.find(
      (e) => e.kind === 'pipeline.recoverable_error',
    )
    expect(warn?.actionId).toBe(result.actionId)
    expect(getCurrentActionId()).toBeUndefined()
  })
})
