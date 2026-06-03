import type { PhaseFn, Pipeline } from '../types'
import { registerPipeline } from './registry'

// definePipeline validates + registers.
export function definePipeline(def: Pipeline): Pipeline {
  return registerPipeline(def)
}

export function definePhase(name: string, run: PhaseFn): { name: string; run: PhaseFn } {
  return { name, run }
}
