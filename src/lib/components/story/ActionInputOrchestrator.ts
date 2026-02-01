/**
 * ActionInputOrchestrator
 *
 * Contains helper functions and utilities for ActionInput that don't need direct store access.
 * Keeps ActionInput.svelte focused on UI concerns while providing reusable orchestration helpers.
 */

import { aiService } from '$lib/services/ai';
import { database } from '$lib/services/database';
import { TranslationService } from '$lib/services/ai/utils/TranslationService';
import {
  SuggestionsRefreshService,
  type SuggestionsRefreshDependencies,
  type SuggestionsRefreshInput,
} from '$lib/services/generation';
import { emitSuggestionsReady } from '$lib/services/events';
import type { TranslationSettings, StoryEntry, StoryMode, POV, Tense, StoryBeat } from '$lib/types';
import type { Suggestion } from '$lib/services/ai/sdk/schemas/suggestions';
import type { RetrievedEntry } from '$lib/services/ai/retrieval/EntryRetrievalService';

function log(...args: unknown[]) {
  console.log('[ActionInputOrchestrator]', ...args);
}

// ============================================================================
// Suggestions Helpers
// ============================================================================

export function buildSuggestionsRefreshDependencies(): SuggestionsRefreshDependencies {
  return {
    generateSuggestions: aiService.generateSuggestions.bind(aiService),
    translateSuggestions: aiService.translateSuggestions.bind(aiService),
  };
}

export interface SuggestionsRefreshState {
  storyId: string;
  entries: StoryEntry[];
  pendingQuests: StoryBeat[];
  storyMode: StoryMode;
  pov: POV;
  tense: Tense;
  protagonistName: string;
  genre?: string;
  settingDescription?: string;
  tone?: string;
  themes?: string[];
  lastLorebookRetrieval: RetrievedEntry[] | null;
  translationSettings: TranslationSettings;
}

export function buildSuggestionsRefreshInput(state: SuggestionsRefreshState): SuggestionsRefreshInput {
  return {
    storyId: state.storyId,
    entries: state.entries,
    pendingQuests: state.pendingQuests,
    storyMode: state.storyMode,
    pov: state.pov,
    tense: state.tense,
    protagonistName: state.protagonistName,
    genre: state.genre,
    settingDescription: state.settingDescription,
    tone: state.tone,
    themes: state.themes,
    lastLorebookRetrieval: state.lastLorebookRetrieval,
    translationSettings: state.translationSettings,
  };
}

/**
 * Refresh suggestions using SuggestionsRefreshService.
 */
export async function refreshSuggestions(
  state: SuggestionsRefreshState,
  callbacks: {
    onLoading: (loading: boolean) => void;
    onSuggestions: (suggestions: Suggestion[], storyId: string | undefined) => void;
    onClear: (storyId: string | undefined) => void;
  },
): Promise<void> {
  if (state.storyMode !== 'creative-writing' || state.entries.length === 0) {
    callbacks.onClear(state.storyId);
    return;
  }

  callbacks.onLoading(true);
  try {
    const service = new SuggestionsRefreshService(buildSuggestionsRefreshDependencies());
    const result = await service.refresh(buildSuggestionsRefreshInput(state));
    callbacks.onSuggestions(result.suggestions, state.storyId);
    emitSuggestionsReady(result.suggestions.map((s) => ({ text: s.text, type: s.type })));
  } catch (error) {
    log('Failed to generate suggestions:', error);
    callbacks.onClear(state.storyId);
  } finally {
    callbacks.onLoading(false);
  }
}

// ============================================================================
// Translation Helpers
// ============================================================================

/**
 * Translate user input if translation is enabled.
 */
export async function translateUserInput(
  content: string,
  translationSettings: TranslationSettings,
): Promise<{ promptContent: string; originalInput: string | undefined }> {
  if (!TranslationService.shouldTranslateInput(translationSettings)) {
    return { promptContent: content, originalInput: undefined };
  }

  try {
    log('Translating user input', { sourceLanguage: translationSettings.sourceLanguage });
    const result = await aiService.translateInput(content, translationSettings.sourceLanguage);
    log('Input translated', { originalLength: content.length, translatedLength: result.translatedContent.length });
    return { promptContent: result.translatedContent, originalInput: content };
  } catch (error) {
    log('Input translation failed (non-fatal), using original', error);
    return { promptContent: content, originalInput: undefined };
  }
}

