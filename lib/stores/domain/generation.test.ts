import { beforeEach, describe, expect, it } from 'vitest'

import { generation, generationStore, type RunState } from './generation'

function run(id: string, kind = 'synthetic'): RunState {
  return {
    runId: id,
    kind,
    actionId: `act_${id}`,
    storyId: 's1',
    branchId: 'b1',
    abortController: new AbortController(),
    currentPhase: '',
    intermediates: {},
  }
}

describe('generation store', () => {
  beforeEach(() => generation.__reset())

  it('startRun adds, abortRun removes', () => {
    generation.startRun(run('run_1'))
    expect(generation.getTxState().runs.has('run_1')).toBe(true)
    generation.abortRun('run_1')
    expect(generation.getTxState().runs.has('run_1')).toBe(false)
  })

  it('finishRun(predecessor, successor) is atomic — no empty intermediate state', () => {
    generation.startRun(run('run_pred', 'per-turn'))
    generation.finishRun('run_pred', run('run_succ', 'chapter-close'))
    const runs = generation.getTxState().runs // synchronous read immediately after
    expect(runs.has('run_pred')).toBe(false)
    expect(runs.has('run_succ')).toBe(true)
    expect(runs.size).toBe(1)
  })

  it('getPerTurnContext resolves the active run; throws once cleared', () => {
    const r = run('run_2')
    generation.startRun(r)
    generation.setActiveRun('run_2')
    const ctx = generation.getPerTurnContext()
    expect(ctx.actionId).toBe('act_run_2')
    expect(ctx.abortSignal.aborted).toBe(false)
    r.abortController.abort()
    expect(ctx.abortSignal.aborted).toBe(true) // by-reference

    generation.clearActiveRun()
    expect(() => generation.getPerTurnContext()).toThrow('no active run')
  })

  it('raw store handle is module-internal (sanity)', () => {
    expect(typeof generationStore.getState).toBe('function')
  })
})
