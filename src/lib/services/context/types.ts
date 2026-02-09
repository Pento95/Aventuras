/**
 * Context System - Type Definitions
 */

/**
 * Result from ContextBuilder.render().
 * Single render call returns both system and user prompts.
 */
export interface RenderResult {
  system: string
  user: string
}

/**
 * Configuration options for ContextBuilder.
 */
export interface ContextBuilderConfig {
  /** Override the pack ID (defaults to story's active pack or default pack) */
  packId?: string
  /** Skip loading custom variables from the pack */
  skipCustomVariables?: boolean
}

/**
 * Wizard steps in order. Used by services (ScenarioService) and
 * for editor validation to know which variables are available at each step.
 * Not used by ContextBuilder itself — progressive context is managed by
 * the wizard service via add().
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
 * Runtime variable definition.
 * Describes a variable that services inject at render time.
 * Registered once at module load for editor validation and autocomplete.
 */
export interface RuntimeVariableDefinition {
  name: string
  description: string
  category: 'runtime'
  /** For wizard context: earliest step where this variable is available */
  availableFrom?: WizardStep
}

/**
 * External template IDs.
 * These templates contain raw text only — no Liquid syntax.
 * Services load them directly from the database and concatenate data
 * programmatically. They do NOT go through ContextBuilder.render().
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
