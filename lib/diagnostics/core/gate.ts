type GateThunks = { isEnabled: () => boolean; isDebugEnabled: () => boolean }

const OFF: GateThunks = { isEnabled: () => false, isDebugEnabled: () => false }

let gate: GateThunks = OFF

export function configureDiagnosticsGate(thunks: GateThunks): void {
  gate = thunks
}

export function isDiagnosticsEnabled(): boolean {
  return gate.isEnabled()
}

export function isDiagnosticsDebugEnabled(): boolean {
  return gate.isDebugEnabled()
}

export function __resetDiagnosticsGate(): void {
  gate = OFF
}
