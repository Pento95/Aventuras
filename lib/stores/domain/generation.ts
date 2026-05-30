import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

export type RunState = {
  runId: string
  kind: string
  actionId: string
  storyId: string | null
  branchId: string
  abortController: AbortController
  currentPhase: string
  intermediates: Record<string, unknown>
  lastResult?: { status: 'completed' | 'aborted' | 'failed' }
}

export type TxState = { runs: Map<string, RunState> }

export type PerTurnContext = {
  actionId: string
  abortSignal: AbortSignal
  intermediates: Record<string, unknown>
}

type GenerationState = {
  txState: TxState
  startRun: (run: RunState) => void
  setCurrentPhase: (runId: string, phase: string) => void
  recordPhaseResult: (
    runId: string,
    phase: string,
    result: { status: 'completed' | 'aborted' | 'failed' },
  ) => void
  // Atomic predecessor-removal + optional successor-add in ONE setState — the
  // chained-transition "no user-edit window" invariant (gen-pipeline spec).
  finishRun: (runId: string, successor?: RunState) => void
  abortRun: (runId: string) => void
  __reset: () => void
}

const generationStore = createStore<GenerationState>()((set) => ({
  txState: { runs: new Map() },
  startRun: (run) =>
    set((s) => {
      const runs = new Map(s.txState.runs)
      runs.set(run.runId, run)
      return { txState: { runs } }
    }),
  setCurrentPhase: (runId, phase) =>
    set((s) => {
      const runs = new Map(s.txState.runs)
      const r = runs.get(runId)
      if (r) runs.set(runId, { ...r, currentPhase: phase })
      return { txState: { runs } }
    }),
  recordPhaseResult: (runId, _phase, result) =>
    set((s) => {
      const runs = new Map(s.txState.runs)
      const r = runs.get(runId)
      if (r) runs.set(runId, { ...r, lastResult: result })
      return { txState: { runs } }
    }),
  finishRun: (runId, successor) =>
    set((s) => {
      const runs = new Map(s.txState.runs)
      runs.delete(runId)
      if (successor) runs.set(successor.runId, successor)
      return { txState: { runs } }
    }),
  abortRun: (runId) =>
    set((s) => {
      const runs = new Map(s.txState.runs)
      runs.delete(runId)
      return { txState: { runs } }
    }),
  __reset: () => set({ txState: { runs: new Map() } }),
}))

let activeRunId: string | null = null

function setActiveRun(runId: string): void {
  activeRunId = runId
}

function clearActiveRun(): void {
  activeRunId = null
}

function getPerTurnContext(): PerTurnContext {
  if (activeRunId === null) throw new Error('getPerTurnContext: no active run')
  const run = generationStore.getState().txState.runs.get(activeRunId)
  if (!run) throw new Error(`getPerTurnContext: no run ${activeRunId}`)
  return {
    actionId: run.actionId,
    abortSignal: run.abortController.signal,
    intermediates: run.intermediates,
  }
}

function getTxState(): TxState {
  return generationStore.getState().txState
}

function useGeneration<T>(selector: (s: { txState: TxState }) => T): T {
  return useStore(generationStore, selector as (s: GenerationState) => T)
}

const api = generationStore.getState()

// Package-private raw handle stays unexported from lib/stores/index.ts.
export const generation = {
  useGeneration,
  getTxState,
  getPerTurnContext,
  setActiveRun,
  clearActiveRun,
  startRun: api.startRun,
  setCurrentPhase: api.setCurrentPhase,
  recordPhaseResult: api.recordPhaseResult,
  finishRun: api.finishRun,
  abortRun: api.abortRun,
  __reset: () => {
    clearActiveRun()
    api.__reset()
  },
}

export { generationStore }
