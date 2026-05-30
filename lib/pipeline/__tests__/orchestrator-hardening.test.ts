import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type PipelineAction } from '@/lib/actions'
import { pipelineRuns, storyEntries } from '@/lib/db'
import { getCurrentActionId, getDiagnosticsSnapshot } from '@/lib/diagnostics'
import { definePipeline, runPipeline, type PhaseResult } from '@/lib/pipeline'
import { domain } from '@/lib/stores'

import { makeHarness, resetSingletons } from './harness'

const base = { affordance: 'invisible', gateBehavior: 'hard-gate', concurrencyPolicy: {} } as const

const newEntry = (id: string): PipelineAction => ({
  kind: 'createStoryEntry',
  source: 'ai_classifier',
  payload: {
    entry: { id, branchId: 'b1', position: 1, kind: 'ai_reply', content: 'hi', createdAt: 1 },
  },
})

// Emits the same entry twice → second INSERT violates the PK → applyDeltaAction throws.
async function* doubleCreate(): AsyncGenerator<
  { type: 'delta_emitted'; action: PipelineAction },
  PhaseResult
> {
  yield { type: 'delta_emitted', action: newEntry('entry_dup') }
  yield { type: 'delta_emitted', action: newEntry('entry_dup') }
  return { status: 'completed' }
}

// Updates a row that does not exist → applyDeltaAction returns { status: 'rejected' }.
async function* updateMissing(): AsyncGenerator<
  { type: 'delta_emitted'; action: PipelineAction },
  PhaseResult
> {
  yield {
    type: 'delta_emitted',
    action: {
      kind: 'updateStoryEntryMetadata',
      source: 'ai_classifier',
      payload: {
        branchId: 'b1',
        id: 'ghost',
        metadata: { sceneEntities: [], currentLocationId: null, worldTime: 1 },
      },
    },
  }
  return { status: 'completed' }
}

async function* throwsDirectly(): AsyncGenerator<never, PhaseResult> {
  throw new Error('phase blew up')
}

describe('orchestrator hardening', () => {
  beforeEach(() => resetSingletons())
  afterEach(() => resetSingletons())

  it('an unexpected action throw routes to abortRun with full cleanup', async () => {
    const { db, ctx } = await makeHarness()
    definePipeline({ kind: 'throwy', phases: [{ name: 'p', run: doubleCreate }], ...base })

    const result = await runPipeline('throwy', ctx)

    expect(result.outcome).toBe('failed')
    expect(result.error?.kind).toBe('action-layer')
    // first create reverse-replayed away
    const rows = await db
      .select()
      .from(storyEntries)
      .where(and(eq(storyEntries.branchId, 'b1'), eq(storyEntries.id, 'entry_dup')))
    expect(rows.length).toBe(0)
    const [pr] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.runId, result.runId))
    expect(pr.outcome).toBe('failed')
    expect(pr.finishedAt).not.toBeNull()
    expect(getCurrentActionId()).toBeUndefined() // ambient cleared
    const turn = getDiagnosticsSnapshot().turnCaptures.find((t) => t.actionId === result.actionId)
    expect(turn?.endedAt).toBeDefined() // turn finalized
    expect(() => domain.getPerTurnContext()).toThrow('no active run') // active run released
  })

  it('a rejected MutationResult routes to abortRun as an action-layer error', async () => {
    const { ctx } = await makeHarness()
    definePipeline({ kind: 'rejecty', phases: [{ name: 'p', run: updateMissing }], ...base })

    const result = await runPipeline('rejecty', ctx)

    expect(result.outcome).toBe('failed')
    expect(result.error?.kind).toBe('action-layer')
    expect(getCurrentActionId()).toBeUndefined()
  })

  it('a non-action throw from a phase body maps to an orchestrator error', async () => {
    const { ctx } = await makeHarness()
    definePipeline({ kind: 'boom', phases: [{ name: 'p', run: throwsDirectly }], ...base })

    const result = await runPipeline('boom', ctx)

    expect(result.outcome).toBe('failed')
    expect(result.error?.kind).toBe('orchestrator')
  })
})
