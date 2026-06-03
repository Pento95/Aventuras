import { appSettings } from './domain/app-settings'
import { generation } from './domain/generation'
import { navigation } from './domain/navigation'

export const domain = {
  // generation
  useGeneration: generation.useGeneration,
  getTxState: generation.getTxState,
  getPerTurnContext: generation.getPerTurnContext,
  setActiveRun: generation.setActiveRun,
  clearActiveRun: generation.clearActiveRun,
  startRun: generation.startRun,
  setCurrentPhase: generation.setCurrentPhase,
  recordPhaseResult: generation.recordPhaseResult,
  finishRun: generation.finishRun,
  abortRun: generation.abortRun,
  // app-settings read
  useAppSettings: appSettings.useAppSettings,
  getAppSettings: appSettings.getAppSettings,
  // navigation
  useNavigation: navigation.useNavigation,
  getNavigation: navigation.getNavigation,
  setCurrentStory: navigation.setCurrentStory,
  setCurrentBranch: navigation.setCurrentBranch,
  // Test seam: resets every domain store (pipeline harness calls domain.__reset).
  __reset: () => {
    generation.__reset()
    appSettings.__reset()
    navigation.__reset()
  },
}

export const ui = {}

export { hydrateAppSettings } from './domain/app-settings'
export { readAppSettingsRow, rehydrateAppSettings } from './domain/app-settings-read'

export type { AppSettingsSnapshot, BootHydrateResult } from './domain/app-settings'
export type { PerTurnContext, RunState, TxState } from './domain/generation'
export type { NavigationSnapshot } from './domain/navigation'
