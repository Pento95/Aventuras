import type { TxState } from '@/lib/stores'

import { getPipeline } from '../authoring/registry'

// True while any in-flight run declares hard-gate.
export function isUserEditBlocked(txState: TxState): boolean {
  return [...txState.runs.values()].some((r) => getPipeline(r.kind).gateBehavior === 'hard-gate')
}
