/**
 * Vercel AI SDK Integration
 *
 * Central module for all AI SDK functionality.
 *
 * Usage:
 * ```typescript
 * import { generateStructured, suggestionsResultSchema } from '$lib/services/ai/sdk';
 *
 * const result = await generateStructured({
 *   presetId: 'suggestions',
 *   schema: suggestionsResultSchema,
 *   system: systemPrompt,
 *   prompt: userPrompt,
 * });
 * ```
 */

// Generate functions
export {
  generateStructured,
  generatePlainText,
  streamPlainText,
  streamStructured,
  buildProviderOptions,
} from './generate';

// Provider registry
export { createProviderFromProfile, PROVIDER_DEFAULTS } from './providers';

// Types
export type { ProviderType, APIProfile } from '$lib/types';
export type { ProviderDefaults, ServiceModelDefaults } from './providers';

// Schemas
export * from './schemas';
