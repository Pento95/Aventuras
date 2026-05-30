import { generation } from './domain/generation'

// Namespaced public API. The raw useGenerationStore handle is never exported.
// Slice 1.6 extends this with app-settings / navigation / ui sub-namespaces.
export const domain = generation

export type { PerTurnContext, RunState, TxState } from './domain/generation'
