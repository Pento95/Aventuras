import type { PipelineAction } from '@/lib/actions'
import type { RunState } from '@/lib/stores'

export type PipelineError =
  | { kind: 'provider'; reason: 'auth' | 'network' | 'timeout' | 'unknown'; detail?: string }
  | { kind: 'phase-logic'; detail: string; phaseName?: string; subsystem?: string }
  | {
      kind: 'action-layer'
      detail: string
      tableName?: string
      targetId?: string
      constraintViolated?: string
    }
  | { kind: 'orchestrator'; detail: string }

export type PhaseResult =
  | { status: 'completed' }
  | { status: 'aborted' }
  | { status: 'failed'; error: PipelineError }

export type PhaseEmittedEvent =
  | { type: 'stream_chunk'; targetEntryId: string; text: string }
  | { type: 'delta_emitted'; action: PipelineAction; entryId?: string | null }
  | { type: 'recoverable_error'; error: PipelineError }

export type PipelineEvent =
  | { type: 'run_start'; runId: string; kind: string; actionId: string }
  | {
      type: 'run_complete'
      runId: string
      kind: string
      actionId: string
      outcome: 'completed' | 'aborted' | 'failed'
      error?: PipelineError
    }
  | { type: 'phase_start'; runId: string; name: string }
  | { type: 'phase_complete'; runId: string; name: string; result: PhaseResult }
  | PhaseEmittedEvent

export type PhaseFn = () => AsyncGenerator<PhaseEmittedEvent, PhaseResult>

export type PhaseNode =
  | { name: string; run: PhaseFn }
  | { name: string; parallel: readonly { name: string; run: PhaseFn }[] }

export type ConcurrencyPolicy = { blockedBy?: readonly string[]; yieldsTo?: readonly string[] }

export type Pipeline = {
  kind: string
  phases: readonly PhaseNode[]
  affordance: 'invisible' | 'pill-only' | 'pill-and-banner'
  gateBehavior: 'hard-gate' | 'no-gate'
  concurrencyPolicy: ConcurrencyPolicy
  chainsTo?: (run: RunState, app: unknown) => string | null
}

export type TxResult = {
  runId: string
  actionId: string
  outcome: 'completed' | 'aborted' | 'failed'
  error?: PipelineError
}
