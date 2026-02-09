/**
 * Context System - Type Definitions
 *
 * Types for the ContextBuilder and its supporting infrastructure.
 * The ContextBuilder replaces the old two-phase prompt expansion
 * (MacroEngine + placeholder injection) with a single LiquidJS render pass
 * over a flat context object.
 */

/**
 * Render result from ContextBuilder.render()
 * A single render call returns both system and user prompts.
 */
export interface RenderResult {
  /** Rendered system prompt */
  system: string
  /** Rendered user prompt */
  user: string
}

/**
 * Wizard steps in order.
 * Used to determine which system variables are available at each step
 * during progressive wizard context building.
 *
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
 * Configuration options for ContextBuilder instances.
 */
export interface ContextBuilderConfig {
  /** Override the pack ID (defaults to story's active pack or default pack) */
  packId?: string
  /** Skip loading custom variables from the pack */
  skipCustomVariables?: boolean
}

/**
 * Runtime variable definition.
 * Describes a variable that services inject at render time.
 * These are registered once at module load, not per-request.
 */
export interface RuntimeVariableDefinition {
  /** Variable name used in templates (e.g., 'recentContent') */
  name: string
  /** Human-readable description */
  description: string
  /** Always 'runtime' for runtime variables */
  category: 'runtime'
  /** For wizard context: earliest step where this variable is available */
  availableFrom?: WizardStep
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

/** Type for external template ID values */
export type ExternalTemplateId = typeof EXTERNAL_TEMPLATE_IDS[number]
