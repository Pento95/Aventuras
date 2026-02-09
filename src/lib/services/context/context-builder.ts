/**
 * ContextBuilder
 *
 * Simple flat variable store + template renderer. Services add variables
 * via .add(), then render templates via .render(). No distinction between
 * variable types -- everything lives in one flat namespace.
 *
 * Usage:
 *   // With story (auto-loads story data + pack custom vars)
 *   const ctx = await ContextBuilder.forStory(storyId)
 *   ctx.add({ recentContent, activeQuests })
 *   const { system, user } = await ctx.render('suggestions')
 *
 *   // Without story (wizard, standalone)
 *   const ctx = new ContextBuilder(packId)
 *   ctx.add({ genre, mode, seed })
 *   const { system, user } = await ctx.render('setting-expansion')
 */

import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/services/ai/core/config'
import { EXTERNAL_TEMPLATE_IDS } from './types'
import type { RenderResult } from './types'

const log = createLogger('ContextBuilder')

export class ContextBuilder {
  private context: Record<string, any> = {}
  private packId: string = 'default-pack'

  constructor(packId?: string) {
    if (packId) this.packId = packId
  }

  /**
   * Convenience factory: create a ContextBuilder pre-populated from a story.
   * Loads story settings, protagonist, location, time, and pack custom variables.
   */
  static async forStory(storyId: string, packIdOverride?: string): Promise<ContextBuilder> {
    const story = await database.getStory(storyId)
    if (!story) {
      log('forStory: story not found', { storyId })
      return new ContextBuilder()
    }

    const packId = packIdOverride || await database.getStoryPackId(storyId) || 'default-pack'
    const builder = new ContextBuilder(packId)

    // Load story data into context
    builder.add({
      mode: story.mode || 'adventure',
      pov: story.settings?.pov || 'second',
      tense: story.settings?.tense || 'present',
      genre: story.genre || '',
      tone: story.settings?.tone || '',
      themes: story.settings?.themes?.join(', ') || '',
      settingDescription: story.description || '',
      visualProseMode: story.settings?.visualProseMode || false,
      inlineImageMode: story.settings?.imageGenerationMode === 'inline',
    })

    // Protagonist
    const characters = await database.getCharacters(storyId)
    const protagonist = characters.find((c) => c.relationship === 'self')
    builder.add({
      protagonistName: protagonist?.name || 'the protagonist',
      protagonistDescription: protagonist?.description || '',
    })

    // Current location
    const locations = await database.getLocations(storyId)
    const currentLocation = locations.find((l) => l.current)
    builder.add({ currentLocation: currentLocation?.name || '' })

    // Story time
    if (story.timeTracker) {
      const t = story.timeTracker
      builder.add({ storyTime: `Year ${t.years + 1}, Day ${t.days + 1}, ${t.hours} hours ${t.minutes} minutes` })
    }

    // Pack custom variable defaults
    await builder.loadCustomVariables()

    log('forStory complete', { storyId, packId, contextKeys: Object.keys(builder.context).length })
    return builder
  }

  /**
   * Merge variables into context. Returns this for chaining.
   */
  add(data: Record<string, any>): this {
    Object.assign(this.context, data)
    return this
  }

  /**
   * Render a template from the active pack.
   * Loads system + user content, renders both through LiquidJS.
   * External templates bypass Liquid and return raw content.
   */
  async render(templateId: string): Promise<RenderResult> {
    log('render', { templateId, packId: this.packId })

    if ((EXTERNAL_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
      const template = await database.getPackTemplate(this.packId, templateId)
      return { system: template?.content || '', user: '' }
    }

    const systemTemplate = await database.getPackTemplate(this.packId, templateId)
    const userTemplate = await database.getPackTemplate(this.packId, `${templateId}-user`)

    const system = systemTemplate?.content ? templateEngine.render(systemTemplate.content, this.context) : ''
    const user = userTemplate?.content ? templateEngine.render(userTemplate.content, this.context) : ''

    return { system, user }
  }

  /**
   * Get a copy of the current context. Useful for debugging.
   */
  getContext(): Record<string, any> {
    return { ...this.context }
  }

  /**
   * Get the active pack ID.
   */
  getPackId(): string {
    return this.packId
  }

  /**
   * Load custom variable defaults from the active pack.
   * Only sets variables not already in context.
   */
  private async loadCustomVariables(): Promise<void> {
    try {
      const variables = await database.getPackVariables(this.packId)
      for (const v of variables) {
        if (!(v.variableName in this.context)) {
          this.context[v.variableName] = v.defaultValue ?? ''
        }
      }
    } catch (error) {
      log('loadCustomVariables failed', { packId: this.packId, error })
    }
  }
}
