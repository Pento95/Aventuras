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
    terminal: Promise.resolve(),
    resolveTerminal: () => {},
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

  it('raw store handle is module-internal (sanity)', () => {
    expect(typeof generationStore.getState).toBe('function')
  })
})
