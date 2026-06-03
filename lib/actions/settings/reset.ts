import { eq } from 'drizzle-orm'

import { APP_SETTINGS_DEFAULTS, APP_SETTINGS_SINGLETON_ID, appSettings } from '@/lib/db'
import { type BootHydrateResult, rehydrateAppSettings } from '@/lib/stores'

import type { SettingsActionCtx } from './types'

export async function resetAppSettings(ctx: SettingsActionCtx): Promise<BootHydrateResult> {
  await ctx.db
    .update(appSettings)
    .set({ ...APP_SETTINGS_DEFAULTS })
    .where(eq(appSettings.id, APP_SETTINGS_SINGLETON_ID))
  return rehydrateAppSettings(ctx.db)
}
