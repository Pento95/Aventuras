/**
 * ContextBuilder
 *
 * Unified context building and template rendering for all AI services.
 * Replaces the two-phase expansion (MacroEngine + placeholder injection)
 * with a single LiquidJS render pass over a flat context object.
 *
 * One system for both wizard and story contexts. The wizard is just an
 * early stage — services call add() to progressively build context.
 *
 * Usage:
 *   // Story (loads context from database)
 *   const ctx = await ContextBuilder.forStory(storyId)
 *   ctx.add({ recentContent, activeQuests })
 *   const { system, user } = await ctx.render('suggestions')
 *
 *   // Wizard (progressive — service adds data at each step)
 *   const ctx = ContextBuilder.create(packId)
 *   ctx.add({ genre, settingDescription })
 *   const { system, user } = await ctx.render('setting-expansion')
 */

import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/services/ai/core/config'
import type { RenderResult, ContextBuilderConfig } from './types'

const log = createLogger('ContextBuilder')

export class ContextBuilder {
  private context: Record<string, any> = {}
  private packId: string = 'default-pack'

  /**
   * Create an empty ContextBuilder with an optional pack ID.
   * Use this for wizard contexts or any case where story doesn't exist yet.
   * Call add() to progressively build context.
   */
  static create(packId?: string): ContextBuilder {
    const builder = new ContextBuilder()
    if (packId) {
      builder.packId = packId
    }
    return builder
  }

  /**
   * Create a ContextBuilder pre-populated with story context from the database.
   * Auto-fills system variables (mode, pov, tense, genre, etc.) and loads
   * custom variable defaults from the active pack.
   */
  static async forStory(storyId: string, config?: ContextBuilderConfig): Promise<ContextBuilder> {
    const builder = new ContextBuilder()

    log('forStory', { storyId, hasConfig: !!config })

    const story = await database.getStory(storyId)
    if (!story) {
      log('forStory: story not found', { storyId })
      return builder
    }

    // Auto-populate system variables from story
    builder.context.mode = story.mode || 'adventure'
    builder.context.pov = story.settings?.pov || 'second'
    builder.context.tense = story.settings?.tense || 'present'
    builder.context.genre = story.genre || ''
    builder.context.tone = story.settings?.tone || ''
    builder.context.themes = story.settings?.themes?.join(', ') || ''
    builder.context.settingDescription = story.description || ''

    // Protagonist
    const characters = await database.getCharacters(storyId)
    const protagonist = characters.find((c) => c.relationship === 'self')
    builder.context.protagonistName = protagonist?.name || 'the protagonist'
    builder.context.protagonistDescription = protagonist?.description || ''

    // Current location
    const locations = await database.getLocations(storyId)
    const currentLocation = locations.find((l) => l.current)
    builder.context.currentLocation = currentLocation?.name || ''

    // Story time
    if (story.timeTracker) {
      const t = story.timeTracker
      builder.context.storyTime = `Year ${t.years + 1}, Day ${t.days + 1}, ${t.hours} hours ${t.minutes} minutes`
    } else {
      builder.context.storyTime = ''
    }

    // Visual mode flags
    builder.context.visualProseMode = story.settings?.visualProseMode || false
    builder.context.inlineImageMode = story.settings?.imageGenerationMode === 'inline'

    // Pack
    const packId = config?.packId || await database.getStoryPackId(storyId) || 'default-pack'
    builder.packId = packId

    // Custom variable defaults from pack
    if (!config?.skipCustomVariables) {
      await builder.loadCustomVariables(packId)
    }

    log('forStory complete', {
      storyId,
      packId: builder.packId,
      contextKeys: Object.keys(builder.context).length,
    })

    return builder
  }

  /**
   * Merge data into the flat context. Services call this to inject
   * runtime variables before rendering. Returns this for chaining.
   */
  add(data: Record<string, any>): this {
    Object.assign(this.context, data)
    return this
  }

  /**
   * Render a template from the active pack through LiquidJS.
   * Loads system content (templateId) and user content (templateId-user),
   * renders both with the flat context, returns { system, user }.
   */
  async render(templateId: string): Promise<RenderResult> {
    log('render', { templateId, packId: this.packId, contextKeys: Object.keys(this.context).length })

    // Load system template content
    const systemTemplate = await database.getPackTemplate(this.packId, templateId)
    const systemContent = systemTemplate?.content || ''

    // Load user template content (convention: templateId-user)
    const userTemplate = await database.getPackTemplate(this.packId, `${templateId}-user`)
    const userContent = userTemplate?.content || ''

    // Render both through LiquidJS with the flat context
    const system = systemContent ? templateEngine.render(systemContent, this.context) : ''
    const user = userContent ? templateEngine.render(userContent, this.context) : ''

    if (!systemContent && !userContent) {
      log('render: no template content found', { templateId, packId: this.packId })
    }

    return { system, user }
  }

  /** Get the current context (for debugging) */
  getContext(): Record<string, any> {
    return { ...this.context }
  }

  /** Get the active pack ID */
  getPackId(): string {
    return this.packId
  }

  private async loadCustomVariables(packId: string): Promise<void> {
    try {
      const variables = await database.getPackVariables(packId)
      for (const variable of variables) {
        if (!(variable.variableName in this.context)) {
          this.context[variable.variableName] = variable.defaultValue ?? ''
        }
      }
      log('loadCustomVariables', { packId, count: variables.length })
    } catch (error) {
      log('loadCustomVariables failed', { packId, error })
    }
  }
}
