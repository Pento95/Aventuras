/**
 * Translation Service
 *
 * Handles translation of narrative content, user input, and UI elements.
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * Original implementation preserved in comments below for reference.
 */

import type { TranslationSettings } from '$lib/types';
import { createLogger } from '../core/config';

const log = createLogger('Translation');

// Use Intl.DisplayNames for proper language name resolution
const languageDisplayNames = new Intl.DisplayNames(['en'], { type: 'language' });

// Common language codes for the UI dropdown
const SUPPORTED_LANGUAGE_CODES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru',
  'ar', 'hi', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'sv', 'da',
  'no', 'fi', 'cs', 'el', 'he', 'uk', 'ro', 'hu', 'bg', 'hr',
  'sk', 'sl', 'et', 'lv', 'lt', 'ms', 'fil', 'bn', 'ta', 'te',
];

export interface TranslationResult {
  translatedContent: string;
  detectedLanguage?: string;
}

export interface UITranslationItem {
  id: string;
  text: string;
  type: 'name' | 'description' | 'title';
}

/**
 * Service that handles translation of narrative and UI content.
 * NOTE: This service has been stubbed during SDK migration.
 */
export class TranslationService {
  private presetId: string;

  constructor(presetId: string = 'translation') {
    this.presetId = presetId;
  }

  /**
   * Get the human-readable name for a language code using Intl API
   */
  private getLanguageName(code: string): string {
    if (code === 'auto') return 'auto-detect';
    try {
      return languageDisplayNames.of(code) || code;
    } catch {
      return code;
    }
  }

  /**
   * Translate narration (post-generation).
   * @throws Error - Service not implemented during SDK migration
   */
  async translateNarration(
    content: string,
    targetLanguage: string,
    isVisualProse: boolean = false
  ): Promise<TranslationResult> {
    // Skip if target is English
    if (targetLanguage === 'en') {
      return { translatedContent: content };
    }

    throw new Error('TranslationService.translateNarration() not implemented - awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    const promptContext: PromptContext = { ... };
    const systemPrompt = promptService.renderPrompt('translate-narration', promptContext, {
      targetLanguage: this.getLanguageName(targetLanguage),
    });
    const response = await this.provider.generateResponse({ ... });
    return { translatedContent: response.content.trim() };
    */
  }

  /**
   * Translate user input to English.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateInput(
    content: string,
    sourceLanguage: string
  ): Promise<TranslationResult> {
    throw new Error('TranslationService.translateInput() not implemented - awaiting SDK migration');
  }

  /**
   * Batch translate UI elements.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateUIElements(
    items: UITranslationItem[],
    targetLanguage: string
  ): Promise<UITranslationItem[]> {
    if (items.length === 0) return [];
    if (targetLanguage === 'en') return items;

    throw new Error('TranslationService.translateUIElements() not implemented - awaiting SDK migration');
  }

  /**
   * Translate suggestions.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateSuggestions<T extends { text: string; type?: string }>(
    suggestions: T[],
    targetLanguage: string
  ): Promise<T[]> {
    if (suggestions.length === 0) return [];
    if (targetLanguage === 'en') return suggestions;

    throw new Error('TranslationService.translateSuggestions() not implemented - awaiting SDK migration');
  }

  /**
   * Translate action choices.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateActionChoices<T extends { text: string; type?: string }>(
    choices: T[],
    targetLanguage: string
  ): Promise<T[]> {
    if (choices.length === 0) return [];
    if (targetLanguage === 'en') return choices;

    throw new Error('TranslationService.translateActionChoices() not implemented - awaiting SDK migration');
  }

  /**
   * Translate wizard content.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateWizardContent(
    content: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    if (targetLanguage === 'en') {
      return { translatedContent: content };
    }

    throw new Error('TranslationService.translateWizardContent() not implemented - awaiting SDK migration');
  }

  /**
   * Batch translate wizard content.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateWizardBatch(
    fields: Record<string, string>,
    targetLanguage: string
  ): Promise<Record<string, string>> {
    if (targetLanguage === 'en') {
      return fields;
    }

    throw new Error('TranslationService.translateWizardBatch() not implemented - awaiting SDK migration');
  }

  /**
   * Check if translation should be performed based on settings
   */
  static shouldTranslate(translationSettings: TranslationSettings): boolean {
    return translationSettings.enabled && translationSettings.targetLanguage !== 'en';
  }

  /**
   * Check if user input translation should be performed
   */
  static shouldTranslateInput(translationSettings: TranslationSettings): boolean {
    return translationSettings.enabled && translationSettings.translateUserInput;
  }

  /**
   * Check if narration translation should be performed
   */
  static shouldTranslateNarration(translationSettings: TranslationSettings): boolean {
    return translationSettings.enabled && translationSettings.translateNarration && translationSettings.targetLanguage !== 'en';
  }

  /**
   * Check if world state UI translation should be performed
   */
  static shouldTranslateWorldState(translationSettings: TranslationSettings): boolean {
    return translationSettings.enabled && translationSettings.translateWorldState && translationSettings.targetLanguage !== 'en';
  }
}

/**
 * Get all supported language codes with their display names
 */
export function getSupportedLanguages(): { code: string; name: string }[] {
  return SUPPORTED_LANGUAGE_CODES
    .map(code => {
      try {
        return { code, name: languageDisplayNames.of(code) || code };
      } catch {
        return { code, name: code };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get language name for display using Intl API
 */
export function getLanguageDisplayName(code: string): string {
  if (code === 'auto') return 'Auto-detect';
  try {
    return languageDisplayNames.of(code) || code;
  } catch {
    return code;
  }
}
