import type { LogKind } from './kinds'

export type LogLevel = 'debug' | 'warn' | 'error'

export type LogEntry = {
  id: string
  emittedAt: number
  level: LogLevel
  kind: LogKind
  fields: Record<string, unknown>
  actionId?: string
}

export type HttpCall = {
  id: string
  startedAt: number
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody?: unknown
  source?: string
  actionId?: string
  state: 'in_flight' | 'completed' | 'failed'
  endedAt?: number
  durationMs?: number
  status?: number | null
  responseHeaders?: Record<string, string>
  responseBody?: unknown
  streamed?: boolean
  error?: string
}

export type PhaseEvent = {
  phase: string
  kind: 'enter' | 'exit'
  at: number
  durationMs?: number
}

export type TurnCapture = {
  actionId: string
  branchId: string
  targetEntryId?: string
  startedAt: number
  endedAt?: number
  outcome?: 'completed' | 'aborted' | 'failed'
  outcomeReason?: string
  phaseEvents: PhaseEvent[]
  classifierOutputRaw?: unknown
}
