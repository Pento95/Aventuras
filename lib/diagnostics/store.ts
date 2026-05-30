import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { HttpCall, LogEntry, TurnCapture } from './types'

const LOG_ENTRIES_CAP = 500

type DiagnosticsState = {
  enabled: boolean
  debugEnabled: boolean
  logEntries: LogEntry[]
  httpCalls: HttpCall[]
  turnCaptures: TurnCapture[]
  pushLog: (entry: LogEntry) => void
  setEnabled: (enabled: boolean) => void
  setDebugEnabled: (debugEnabled: boolean) => void
  __reset: () => void
}

const emptySlices = {
  enabled: false,
  debugEnabled: false,
  logEntries: [] as LogEntry[],
  httpCalls: [] as HttpCall[],
  turnCaptures: [] as TurnCapture[],
}

export const diagnosticsStore = createStore<DiagnosticsState>()((set) => ({
  ...emptySlices,
  pushLog: (entry) =>
    set((state) => ({
      logEntries:
        state.logEntries.length >= LOG_ENTRIES_CAP
          ? [...state.logEntries.slice(state.logEntries.length - LOG_ENTRIES_CAP + 1), entry]
          : [...state.logEntries, entry],
    })),
  // "Off means off": flipping the master gate off clears all three in-memory
  // slices atomically (observability spec). Persisted probe_captures untouched.
  setEnabled: (enabled) =>
    set(() =>
      enabled
        ? { enabled: true }
        : { enabled: false, logEntries: [], httpCalls: [], turnCaptures: [] },
    ),
  setDebugEnabled: (debugEnabled) => set({ debugEnabled }),
  // Test-only reset; not reachable through the public read hook.
  __reset: () => set({ ...emptySlices }),
}))

// Public read-only view: the selector type excludes the mutator actions, so UI
// cannot reach setEnabled/pushLog through the hook. Internal code mutates via
// diagnosticsStore.getState().<action>().
type DiagnosticsReadState = Pick<
  DiagnosticsState,
  'enabled' | 'debugEnabled' | 'logEntries' | 'httpCalls' | 'turnCaptures'
>

export function useDiagnosticsStore<T>(selector: (state: DiagnosticsReadState) => T): T {
  return useStore(diagnosticsStore, selector as (state: DiagnosticsState) => T)
}

export function setDiagnosticsEnabled(enabled: boolean): void {
  diagnosticsStore.getState().setEnabled(enabled)
}

export function setDiagnosticsDebugEnabled(enabled: boolean): void {
  diagnosticsStore.getState().setDebugEnabled(enabled)
}

export function getDiagnosticsSnapshot(): Pick<
  DiagnosticsReadState,
  'enabled' | 'debugEnabled' | 'logEntries' | 'httpCalls' | 'turnCaptures'
> {
  const s = diagnosticsStore.getState()
  return {
    enabled: s.enabled,
    debugEnabled: s.debugEnabled,
    logEntries: s.logEntries,
    httpCalls: s.httpCalls,
    turnCaptures: s.turnCaptures,
  }
}

export type { DiagnosticsState, DiagnosticsReadState }
