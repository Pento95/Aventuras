import { describe, expect, it } from 'vitest'

describe('lib/diagnostics public-API surface', () => {
  it('omits the relocated / deleted diagnostics-toggle symbols', async () => {
    const diagnostics = await import('@/lib/diagnostics')
    expect('setDiagnosticsEnabled' in diagnostics).toBe(false)
    expect('setDebugLevelEnabled' in diagnostics).toBe(false)
    expect('useDiagnosticsHydration' in diagnostics).toBe(false)
    expect('hydrateDiagnostics' in diagnostics).toBe(false)
  })

  it('still exposes the injected-gate + buffer infrastructure surface', async () => {
    const diagnostics = await import('@/lib/diagnostics')
    expect(typeof diagnostics.configureDiagnosticsGate).toBe('function')
    expect(typeof diagnostics.clearBuffers).toBe('function')
    expect(typeof diagnostics.logger).toBe('object')
  })
})
