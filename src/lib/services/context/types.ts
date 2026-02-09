/**
 * Context System - Type Definitions
 */

/**
 * Render result from ContextBuilder.render()
 * A single render call returns both system and user prompts.
 */
export interface RenderResult {
  system: string
  user: string
}

/**
 * Wizard steps in order.
 * Used by wizard services to track progressive context building.
 * Integer values allow comparison: step >= WizardStep.CharacterCreation
 */
export enum WizardStep {
  PackSelection = 1,
  SettingCreation = 2,
  WritingStyle = 3,
  CharacterCreation = 4,
  SupportingCharacters = 5,
  OpeningGeneration = 6,
}

/**
 * External template IDs.
 * These templates bypass Liquid rendering -- they contain raw text only,
 * and services append data programmatically outside the template.
 */
export const EXTERNAL_TEMPLATE_IDS = [
  'image-style-soft-anime',
  'image-style-semi-realistic',
  'image-style-photorealistic',
  'interactive-lorebook',
  'lorebook-classifier',
  'vault-character-import',
] as const

export type ExternalTemplateId = typeof EXTERNAL_TEMPLATE_IDS[number]
