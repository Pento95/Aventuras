/**
 * Scenario Service
 *
 * Provides AI-powered scenario generation for the story wizard.
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * All generation methods throw errors. Non-LLM utility methods preserved.
 */

import { settings, getPresetDefaults } from '$lib/stores/settings.svelte';
import type { ProviderType } from '$lib/types';
import type { ReasoningEffort, GenerationPreset } from '$lib/types';
import type { StoryMode, POV, Character, Location, Item } from '$lib/types';
import { promptService, type PromptContext } from '$lib/services/prompts';
import { createLogger } from '../core/config';

const log = createLogger('ScenarioService');

// Default model for scenario generation - fast and capable
export const SCENARIO_MODEL = 'deepseek/deepseek-v3.2';

// Provider preference - prioritize Deepseek with fallbacks, require all parameters
export const SCENARIO_PROVIDER = { order: ['deepseek'], require_parameters: false };

export type Genre = 'fantasy' | 'scifi' | 'modern' | 'horror' | 'mystery' | 'romance' | 'custom';
export type Tense = 'past' | 'present';

// Advanced settings for customizing generation processes
export interface ProcessSettings {
  profileId?: string | null;
  presetId?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  providerOnly?: string[];
  manualBody?: string;
}

export interface AdvancedWizardSettings {
  settingExpansion: ProcessSettings;
  settingRefinement: ProcessSettings;
  protagonistGeneration: ProcessSettings;
  characterElaboration: ProcessSettings;
  characterRefinement: ProcessSettings;
  supportingCharacters: ProcessSettings;
  openingGeneration: ProcessSettings;
  openingRefinement: ProcessSettings;
}

export function getDefaultAdvancedSettings(): AdvancedWizardSettings {
  return getDefaultAdvancedSettingsForProvider('openrouter');
}

export function getDefaultAdvancedSettingsForProvider(provider: ProviderType): AdvancedWizardSettings {
  const preset = getPresetDefaults(provider, 'wizard');

  return {
    settingExpansion: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    settingRefinement: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    protagonistGeneration: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    characterElaboration: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    characterRefinement: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    supportingCharacters: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    openingGeneration: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    openingRefinement: {
      presetId: 'wizard',
      profileId: null,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
  };
}

export interface WizardData {
  mode: StoryMode;
  genre: Genre;
  customGenre?: string;
  settingSeed: string;
  expandedSetting?: ExpandedSetting;
  protagonist?: GeneratedProtagonist;
  characters?: GeneratedCharacter[];
  writingStyle: {
    pov: POV;
    tense: Tense;
    tone: string;
    visualProseMode?: boolean;
    inlineImageMode?: boolean;
    imageGenerationMode?: 'none' | 'auto' | 'inline';
  };
  title: string;
  openingGuidance?: string;
}

export interface ExpandedSetting {
  name: string;
  description: string;
  keyLocations: {
    name: string;
    description: string;
  }[];
  atmosphere: string;
  themes: string[];
  potentialConflicts: string[];
}

export interface GeneratedProtagonist {
  name: string;
  description: string;
  background: string;
  motivation: string;
  traits: string[];
  appearance?: string;
}

export interface GeneratedCharacter {
  name: string;
  role: string;
  description: string;
  relationship: string;
  traits: string[];
  vaultId?: string;
}

export interface GeneratedOpening {
  scene: string;
  title: string;
  initialLocation: {
    name: string;
    description: string;
  };
}

class ScenarioService {
  /**
   * Expand a user's seed prompt into a full setting description.
   * @throws Error - Service not implemented during SDK migration
   */
  async expandSetting(
    seed: string,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[],
    customInstruction?: string
  ): Promise<ExpandedSetting> {
    throw new Error('ScenarioService.expandSetting() not implemented - awaiting SDK migration');
  }

  /**
   * Refine an existing setting using the current expanded data.
   * @throws Error - Service not implemented during SDK migration
   */
  async refineSetting(
    currentSetting: ExpandedSetting,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[],
    customInstruction?: string
  ): Promise<ExpandedSetting> {
    throw new Error('ScenarioService.refineSetting() not implemented - awaiting SDK migration');
  }

  /**
   * Elaborate on user-provided character details using AI.
   * @throws Error - Service not implemented during SDK migration
   */
  async elaborateCharacter(
    userInput: {
      name?: string;
      description?: string;
      background?: string;
      motivation?: string;
      traits?: string[];
    },
    setting: ExpandedSetting | null,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    customInstruction?: string
  ): Promise<GeneratedProtagonist> {
    throw new Error('ScenarioService.elaborateCharacter() not implemented - awaiting SDK migration');
  }

  /**
   * Refine an existing character using the current expanded data.
   * @throws Error - Service not implemented during SDK migration
   */
  async refineCharacter(
    currentCharacter: GeneratedProtagonist,
    setting: ExpandedSetting | null,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    customInstruction?: string
  ): Promise<GeneratedProtagonist> {
    throw new Error('ScenarioService.refineCharacter() not implemented - awaiting SDK migration');
  }

  /**
   * Generate a protagonist character based on setting and mode.
   * @throws Error - Service not implemented during SDK migration
   */
  async generateProtagonist(
    setting: ExpandedSetting,
    genre: Genre,
    mode: StoryMode,
    pov: POV,
    customGenre?: string,
    presetId?: string
  ): Promise<GeneratedProtagonist> {
    throw new Error('ScenarioService.generateProtagonist() not implemented - awaiting SDK migration');
  }

  /**
   * Generate supporting characters for creative writing mode.
   * @throws Error - Service not implemented during SDK migration
   */
  async generateCharacters(
    setting: ExpandedSetting,
    protagonist: GeneratedProtagonist,
    genre: Genre,
    count: number = 3,
    customGenre?: string,
    presetId?: string
  ): Promise<GeneratedCharacter[]> {
    throw new Error('ScenarioService.generateCharacters() not implemented - awaiting SDK migration');
  }

  /**
   * Generate an opening scene based on all of setup data.
   * @throws Error - Service not implemented during SDK migration
   */
  async generateOpening(
    wizardData: WizardData,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): Promise<GeneratedOpening> {
    throw new Error('ScenarioService.generateOpening() not implemented - awaiting SDK migration');
  }

  /**
   * Refine an existing opening scene based on current setup data.
   * @throws Error - Service not implemented during SDK migration
   */
  async refineOpening(
    wizardData: WizardData,
    currentOpening: GeneratedOpening,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): Promise<GeneratedOpening> {
    throw new Error('ScenarioService.refineOpening() not implemented - awaiting SDK migration');
  }

  /**
   * Stream opening scene generation for real-time display.
   * @throws Error - Service not implemented during SDK migration
   */
  async *streamOpening(
    wizardData: WizardData,
    presetId?: string
  ): AsyncIterable<{ content: string; done: boolean }> {
    throw new Error('ScenarioService.streamOpening() not implemented - awaiting SDK migration');
  }

  private getWizardPromptContext(
    mode: StoryMode = 'adventure',
    pov: POV = 'second',
    tense: Tense = 'present',
    protagonistName: string = 'the protagonist'
  ): PromptContext {
    return {
      mode,
      pov,
      tense,
      protagonistName,
    };
  }

  /**
   * Convert wizard data to story creation parameters.
   * NOTE: This method works - it's just data transformation.
   */
  prepareStoryData(wizardData: WizardData, opening: GeneratedOpening): {
    title: string;
    genre: string;
    description?: string;
    mode: StoryMode;
    settings: { pov: POV; tense: Tense; tone?: string; themes?: string[]; visualProseMode?: boolean; inlineImageMode?: boolean; imageGenerationMode?: 'none' | 'auto' | 'inline' };
    protagonist: Partial<Character>;
    startingLocation: Partial<Location>;
    initialItems: Partial<Item>[];
    openingScene: string;
    systemPrompt: string;
    characters: Partial<Character>[];
  } {
    const { mode, genre, customGenre, expandedSetting, protagonist, characters, writingStyle } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : this.capitalizeGenre(genre);

    // Build a custom system prompt based on the setting
    const systemPrompt = this.buildSystemPrompt(wizardData, expandedSetting);

    return {
      title: opening.title || wizardData.title,
      genre: genreLabel,
      description: expandedSetting?.description,
      mode,
      settings: {
        pov: writingStyle.pov,
        tense: writingStyle.tense,
        tone: writingStyle.tone,
        themes: expandedSetting?.themes,
        visualProseMode: writingStyle.visualProseMode,
        inlineImageMode: writingStyle.inlineImageMode,
        imageGenerationMode: writingStyle.imageGenerationMode,
      },
      protagonist: {
        name: protagonist?.name || (writingStyle.pov === 'second' ? 'You' : 'The Protagonist'),
        description: protagonist?.description,
        relationship: 'self',
        traits: protagonist?.traits || [],
        status: 'active',
      },
      startingLocation: {
        name: opening.initialLocation.name,
        description: opening.initialLocation.description,
        visited: true,
        current: true,
        connections: [],
      },
      initialItems: [],
      openingScene: opening.scene,
      systemPrompt,
      characters: (characters || []).map(c => ({
        name: c.name,
        description: c.description,
        relationship: c.relationship,
        traits: c.traits,
        status: 'active' as const,
      })),
    };
  }

  private buildSystemPrompt(wizardData: WizardData, setting?: ExpandedSetting): string {
    const { mode, genre, customGenre, writingStyle, protagonist } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : this.capitalizeGenre(genre);

    const settingDescription = setting
      ? `${setting.name || 'A unique world'}\n${setting.description || ''}`
      : undefined;

    const promptContext: PromptContext = {
      mode,
      pov: writingStyle.pov,
      tense: writingStyle.tense,
      protagonistName: protagonist?.name || (writingStyle.pov === 'second' ? 'You' : 'The Protagonist'),
      genre: genreLabel,
      tone: writingStyle.tone || (mode === 'creative-writing' ? 'engaging and immersive' : 'immersive and engaging'),
      settingDescription,
      themes: setting?.themes,
      visualProseMode: writingStyle.visualProseMode,
      inlineImageMode: writingStyle.inlineImageMode,
    };

    const templateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure';
    return promptService.renderPrompt(templateId, promptContext);
  }

  private capitalizeGenre(genre: Genre): string {
    const genreMap: Record<Genre, string> = {
      fantasy: 'Fantasy',
      scifi: 'Sci-Fi',
      modern: 'Modern',
      horror: 'Horror',
      mystery: 'Mystery',
      romance: 'Romance',
      custom: 'Custom',
    };
    return genreMap[genre] || genre;
  }
}

export const scenarioService = new ScenarioService();
