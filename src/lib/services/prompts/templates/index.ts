/**
 * Prompt Templates Registry
 *
 * Central index for all modular prompt templates.
 * Templates are organized by domain (suggestions, classification, memory, etc.)
 *
 * As templates are migrated from definitions.ts, import them here.
 */

import { SUGGESTIONS_TEMPLATES } from './suggestions';

// Combined list of all templates for PromptService
// Add more template groups as they are migrated from definitions.ts
export const PROMPT_TEMPLATES = [
  ...SUGGESTIONS_TEMPLATES,
  // Future migrations:
  // ...CLASSIFICATION_TEMPLATES,
  // ...MEMORY_TEMPLATES,
  // ...RETRIEVAL_TEMPLATES,
  // ...NARRATIVE_TEMPLATES,
  // etc.
];

// Re-export all templates for direct access
export * from './suggestions';
