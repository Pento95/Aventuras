import { describe, expect, it } from 'vitest'

import { domain } from '@/lib/stores'

// Imports via the namespace only. A deep import of the raw handle
// (`@/lib/stores/domain/generation`) would fail the boundaries lint rule —
// asserted by the dedicated public-API surface task, not here.
describe('lib/stores public namespace', () => {
  it('exposes the generation selector + mutators', () => {
    expect(typeof domain.useGeneration).toBe('function')
    expect(typeof domain.startRun).toBe('function')
    expect(typeof domain.finishRun).toBe('function')
  })
})
