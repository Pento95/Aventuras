/**
 * Context System Module
 *
 * Unified context building and template rendering for all AI services.
 *
 * @example
 * import { ContextBuilder } from '$lib/services/context'
 *
 * const ctx = await ContextBuilder.forStory(storyId)
 * ctx.add({ recentContent, activeQuests })
 * const { system, user } = await ctx.render('suggestions')
 */

export { ContextBuilder } from './context-builder'

export type { RenderResult, ExternalTemplateId } from './types'

export { WizardStep, EXTERNAL_TEMPLATE_IDS } from './types'
