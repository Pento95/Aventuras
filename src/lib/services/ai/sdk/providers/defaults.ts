/**
 * Provider Defaults Configuration
 *
 * Defines default models and settings for each provider type.
 * Used when creating presets, resetting to defaults, or first-time setup.
 */

import type { ProviderType, ReasoningEffort } from '$lib/types';

/**
 * OpenRouter API URL constant.
 * Used throughout the app for OpenRouter-based profiles.
 */
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

/**
 * Default model configuration for a service category.
 */
export interface ServiceModelDefaults {
  model: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort: ReasoningEffort;
}

/**
 * All service defaults for a provider.
 */
export interface ProviderDefaults {
  /** Provider display name */
  name: string;
  /** Default base URL (empty = use SDK default) */
  baseUrl: string;
  /** Default model for main narrative generation */
  narrative: ServiceModelDefaults;
  /** Default model for classification tasks (world state, entity extraction) */
  classification: ServiceModelDefaults;
  /** Default model for memory/context tasks (summarization, retrieval) */
  memory: ServiceModelDefaults;
  /** Default model for suggestions/creative tasks */
  suggestions: ServiceModelDefaults;
  /** Default model for agentic tasks (tool-calling, autonomous) */
  agentic: ServiceModelDefaults;
  /** Default model for wizard/generation tasks */
  wizard: ServiceModelDefaults;
  /** Default model for translation */
  translation: ServiceModelDefaults;
}

/**
 * Provider-specific default configurations.
 */
export const PROVIDER_DEFAULTS: Record<ProviderType, ProviderDefaults> = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    narrative: {
      model: 'anthropic/claude-sonnet-4',
      temperature: 0.8,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    classification: {
      model: 'x-ai/grok-4.1-fast',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'high',
    },
    memory: {
      model: 'x-ai/grok-4.1-fast',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'high',
    },
    suggestions: {
      model: 'deepseek/deepseek-chat',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    agentic: {
      model: 'anthropic/claude-sonnet-4',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'high',
    },
    wizard: {
      model: 'deepseek/deepseek-chat',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    translation: {
      model: 'deepseek/deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      reasoningEffort: 'off',
    },
  },

  openai: {
    name: 'OpenAI',
    baseUrl: '', // SDK default
    narrative: {
      model: 'gpt-4o',
      temperature: 0.8,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    classification: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    memory: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    suggestions: {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    agentic: {
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    wizard: {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    translation: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 4096,
      reasoningEffort: 'off',
    },
  },

  anthropic: {
    name: 'Anthropic',
    baseUrl: '', // SDK default
    narrative: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.8,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    classification: {
      model: 'claude-haiku-4-20250514',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    memory: {
      model: 'claude-haiku-4-20250514',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    suggestions: {
      model: 'claude-haiku-4-20250514',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    agentic: {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    wizard: {
      model: 'claude-haiku-4-20250514',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    translation: {
      model: 'claude-haiku-4-20250514',
      temperature: 0.3,
      maxTokens: 4096,
      reasoningEffort: 'off',
    },
  },

  google: {
    name: 'Google AI',
    baseUrl: '', // SDK default
    narrative: {
      model: 'gemini-2.0-flash',
      temperature: 0.8,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    classification: {
      model: 'gemini-2.0-flash',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    memory: {
      model: 'gemini-2.0-flash',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    suggestions: {
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    agentic: {
      model: 'gemini-2.0-flash',
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    wizard: {
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxTokens: 8192,
      reasoningEffort: 'off',
    },
    translation: {
      model: 'gemini-2.0-flash',
      temperature: 0.3,
      maxTokens: 4096,
      reasoningEffort: 'off',
    },
  },
};
