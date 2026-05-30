import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type PipelineAction } from '@/lib/actions'
import { deltas, storyEntries } from '@/lib/db'
import { definePipeline, runPipeline, type PhaseResult } from '@/lib/pipeline'
import { domain } from '@/lib/stores'

import { makeHarness, resetSingletons } from './harness'

const base = { affordance: 'invisible', gateBehavior: 'hard-gate', concurrencyPolicy: {} } as const

async function* noop(): AsyncGenerator<never, PhaseResult> {
  return { status: 'completed' }
}

function createEntry(id: string): { type: 'delta_emitted'; action: PipelineAction } {
  return {
    type: 'delta_emitted',
    action: {
      kind: 'createStoryEntry',
      source: 'ai_classifier',
      payload: {
        entry: { id, branchId: 'b1', position: 1, kind: 'ai_reply', content: id, createdAt: 1 },
      },
    },
  }
}

describe('chained transition', () => {
  beforeEach(() => resetSingletons())
  afterEach(() => resetSingletons())

  it('leaves the successor present in txState with no empty intermediate', async () => {
    const { ctx } = await makeHarness()
    definePipeline({ kind: 'succ', phases: [{ name: 'p', run: noop }], ...base })
    definePipeline({
      kind: 'pred',
      phases: [{ name: 'p', run: noop }],
      chainsTo: () => 'succ',
      ...base,
    })

    const result = await runPipeline('pred', ctx)
    expect(result.outcome).toBe('completed')
    const runs = [...domain.getTxState().runs.values()]
    expect(runs.map((r) => r.kind)).toEqual(['succ']) // predecessor gone, successor present
  })
})

describe('parallel group', () => {
  beforeEach(() => resetSingletons())
  afterEach(() => resetSingletons())

  it('a failing branch aborts the run and reverse-replays every branch delta', async () => {
    const { db, ctx } = await makeHarness()
    async function* branchA(): AsyncGenerator<ReturnType<typeof createEntry>, PhaseResult> {
      yield createEntry('entry_a')
      return { status: 'completed' }
    }
    async function* branchB(): AsyncGenerator<ReturnType<typeof createEntry>, PhaseResult> {
      yield createEntry('entry_b')
      return { status: 'failed', error: { kind: 'phase-logic', detail: 'branch fail' } }
    }
    definePipeline({
      kind: 'synthetic',
      phases: [
        {
          name: 'group',
          parallel: [
            { name: 'a', run: branchA },
            { name: 'b', run: branchB },
          ],
        },
      ],
      ...base,
    })

    const result = await runPipeline('synthetic', ctx)
    expect(result.outcome).toBe('failed')
    expect((await db.select().from(storyEntries)).length).toBe(0) // both branch deltas reversed
    expect((await db.select().from(deltas)).length).toBe(2)
  })
})
