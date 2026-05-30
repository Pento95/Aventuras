import { afterEach, describe, expect, it } from 'vitest'

import { clearCurrentActionId, getCurrentActionId, setCurrentActionId } from './ambient-action-id'
import { logger } from './logger'
import { diagnosticsStore } from './store'

afterEach(() => {
  clearCurrentActionId()
  diagnosticsStore.getState().__reset()
})

describe('ambient actionId', () => {
  it('stamps logger emissions with the current actionId, cleared after', () => {
    diagnosticsStore.getState().setEnabled(true)
    setCurrentActionId('act_42')
    logger.warn('pipeline.test_event', {})
    const entries = diagnosticsStore.getState().logEntries
    expect(entries.at(-1)?.actionId).toBe('act_42')

    clearCurrentActionId()
    logger.warn('pipeline.test_event', {})
    expect(getCurrentActionId()).toBeUndefined()
    expect(diagnosticsStore.getState().logEntries.at(-1)?.actionId).toBeUndefined()
  })
})
