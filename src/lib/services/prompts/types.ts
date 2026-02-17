/**
 * Prompt System - Type Definitions
 *
 * PromptTemplate is the core type for the Liquid template system.
 * Templates contain prompt text with Liquid syntax, resolved at runtime via ContextBuilder.
 */

/**
 * Prompt template category
 * - story: Main narrative prompts (adventure, creative-writing)
 * - service: Supporting service prompts (classifier, suggestions, etc.)
 * - wizard: Story wizard prompts (setting expansion, character generation, etc.)
 * - image-style: Image generation style prompts (soft anime, semi-realistic, etc.)
 */
export type PromptCategory = 'story' | 'service' | 'wizard' | 'image-style'

/**
 * Prompt template definition
 * Templates contain the base prompt text with Liquid template syntax.
 */
export interface PromptTemplate {
  id: string
  name: string
  category: PromptCategory
  description: string
  /**
   * The system prompt content with Liquid template syntax.
   * Variables are resolved at runtime via ContextBuilder.
   */
  content: string
  /**
   * Optional user message template with Liquid template syntax.
   * For services that send a structured user message alongside the system prompt.
   */
  userContent?: string
}
