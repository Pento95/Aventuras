export { runPipeline, type RunCtx } from './orchestrator'
export { definePipeline, definePhase } from './define'
export { registerPipeline, getPipeline, __resetRegistry } from './registry'
export { pipelineEventBus, __resetBus } from './event-bus'
export { isUserEditBlocked } from './gate'
// Re-export the ambient reader for pipeline-centric callers (delegates to the
// lib/diagnostics slot — set/cleared by the orchestrator).
export { getCurrentActionId } from '@/lib/diagnostics'
export { recoverInFlightRuns } from './recovery'
export type { RecoveredRun, RecoveryFailure, RecoveryReport } from './recovery'
export type {
  ConcurrencyPolicy,
  PhaseEmittedEvent,
  PhaseFn,
  PhaseNode,
  PhaseResult,
  Pipeline,
  PipelineError,
  PipelineEvent,
  TxResult,
} from './types'
