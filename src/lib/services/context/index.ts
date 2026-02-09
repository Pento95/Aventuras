/**
 * Context System
 *
 * Unified context building and template rendering for all AI services.
 * One system for both wizard and story — wizard is just an early stage
 * where services call add() to progressively build context.
 *
 * @example
 * import { ContextBuilder } from '$lib/services/context'
 *
 * // Story (auto-loads context from database)
 * const ctx = await ContextBuilder.forStory(storyId)
 * ctx.add({ recentContent, activeQuests })
 * const { system, user } = await ctx.render('suggestions')
 *
 * // Wizard (progressive — service adds data at each step)
 * const ctx = ContextBuilder.create(packId)
 * ctx.add({ genre, settingDescription })
 * const { system, user } = await ctx.render('setting-expansion')
 */

export { ContextBuilder } from './context-builder'

export { RUNTIME_VARIABLES, getAvailableVariables } from './runtime-variables'

export type {
  RenderResult,
  ContextBuilderConfig,
  RuntimeVariableDefinition,
  ExternalTemplateId,
} from './types'

export { WizardStep, EXTERNAL_TEMPLATE_IDS } from './types'
