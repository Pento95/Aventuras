// Prompt System - Template definitions and types

// Re-export types
export type { PromptTemplate, PromptCategory } from './types'

// Re-export template definitions and utilities
export {
  PROMPT_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  getImageStyleTemplates,
  hasUserContent,
} from './definitions'
