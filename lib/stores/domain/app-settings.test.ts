import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/diagnostics'

import { appSettings, hydrateAppSettings } from './app-settings'

const VALID_CONFIG = {
  providers: [],
  profiles: [],
  assignments: {},
  defaultProviderId: null,
}

beforeEach(() => appSettings.__reset())
afterEach(() => vi.restoreAllMocks())

describe('hydrateAppSettings', () => {
  it('hydrates a valid row including diagnostics and returns ok', async () => {
    const r = await hydrateAppSettings(async () => ({
      ...VALID_CONFIG,
      diagnostics: { enabled: true, debug_level_enabled: true },
    }))
    expect(r).toEqual({ status: 'ok' })
    expect(appSettings.getAppSettings().diagnostics).toEqual({
      enabled: true,
      debug_level_enabled: true,
    })
  })

  it('absent row → defaults, ok', async () => {
    const r = await hydrateAppSettings(async () => undefined)
    expect(r).toEqual({ status: 'ok' })
    expect(appSettings.getAppSettings().diagnostics).toEqual({
      enabled: false,
      debug_level_enabled: false,
    })
  })

  it('config schema failure → config-corrupt (no apply)', async () => {
    const before = appSettings.getAppSettings()
    const r = await hydrateAppSettings(async () => ({ ...VALID_CONFIG, providers: 'nope' }))
    expect(r.status).toBe('config-corrupt')
    expect(appSettings.getAppSettings()).toEqual(before)
  })

  it('read throw → config-corrupt', async () => {
    const r = await hydrateAppSettings(async () => {
      throw new Error('unparseable json column')
    })
    expect(r.status).toBe('config-corrupt')
  })

  it('logs bootstrap.app_settings_hydrate_failed on a read throw', async () => {
    const errSpy = vi.spyOn(logger, 'error')
    await hydrateAppSettings(async () => {
      throw new Error('unparseable json column')
    })
    expect(errSpy).toHaveBeenCalledWith(
      'bootstrap.app_settings_hydrate_failed',
      expect.objectContaining({ error: expect.stringContaining('unparseable json column') }),
    )
  })

  it('logs bootstrap.app_settings_hydrate_failed on a config schema failure', async () => {
    const errSpy = vi.spyOn(logger, 'error')
    await hydrateAppSettings(async () => ({ ...VALID_CONFIG, providers: 'nope' }))
    expect(errSpy).toHaveBeenCalledWith('bootstrap.app_settings_hydrate_failed', expect.any(Object))
  })

  it('logs bootstrap.app_settings_hydrate_failed when only the diagnostics shape is corrupt', async () => {
    const errSpy = vi.spyOn(logger, 'error')
    await hydrateAppSettings(async () => ({ ...VALID_CONFIG, diagnostics: { enabled: 'yes' } }))
    expect(errSpy).toHaveBeenCalledWith('bootstrap.app_settings_hydrate_failed', expect.any(Object))
  })

  it('diagnostics wrong-shape (valid config) → ok, toggles default off', async () => {
    const r = await hydrateAppSettings(async () => ({
      ...VALID_CONFIG,
      diagnostics: { enabled: 'yes' },
    }))
    expect(r).toEqual({ status: 'ok' })
    expect(appSettings.getAppSettings().diagnostics).toEqual({
      enabled: false,
      debug_level_enabled: false,
    })
  })

  it('diagnostics null (legacy/NULL column) → ok, toggles default off', async () => {
    const r = await hydrateAppSettings(async () => ({ ...VALID_CONFIG, diagnostics: null }))
    expect(r).toEqual({ status: 'ok' })
    expect(appSettings.getAppSettings().diagnostics).toEqual({
      enabled: false,
      debug_level_enabled: false,
    })
  })

  it('getAppSettings reflects hydrated config', async () => {
    await hydrateAppSettings(async () => ({
      ...VALID_CONFIG,
      defaultProviderId: 'p1',
      diagnostics: { enabled: false, debug_level_enabled: false },
    }))
    expect(appSettings.getAppSettings().defaultProviderId).toBe('p1')
  })
})
