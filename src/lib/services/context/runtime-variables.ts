/**
 * Runtime Variable Registry
 *
 * Catalogs all runtime variables that services inject at render time.
 * These definitions are registered once at module load, not per-request.
 *
 * Runtime variables are distinct from system variables (auto-filled from story)
 * and custom variables (user-defined per pack). Services control when they
 * pass runtime data via ContextBuilder.add().
 */

import type { RuntimeVariableDefinition } from './types'
import { WizardStep } from './types'

/**
 * Complete catalog of runtime variables used across all services.
 * Organized by the service that primarily injects each variable.
 */
export const RUNTIME_VARIABLES: RuntimeVariableDefinition[] = [
  // ===== SuggestionsService =====
  {
    name: 'recentContent',
    description: 'Recent story entries formatted for context',
    category: 'runtime',
  },
  {
    name: 'activeThreads',
    description: 'Active story beats and quests formatted as a list',
    category: 'runtime',
  },
  {
    name: 'lorebookContext',
    description: 'Retrieved lorebook entries for world context',
    category: 'runtime',
  },

  // ===== ActionChoicesService =====
  {
    name: 'narrativeResponse',
    description: 'AI-generated narrative text to base choices on',
    category: 'runtime',
  },
  {
    name: 'recentContext',
    description: 'Recent story entries formatted as action/narrative pairs',
    category: 'runtime',
  },
  {
    name: 'npcsPresent',
    description: 'Names of non-player characters present in the scene',
    category: 'runtime',
  },
  {
    name: 'inventory',
    description: 'List of items the protagonist is carrying',
    category: 'runtime',
  },
  {
    name: 'activeQuests',
    description: 'Currently active story quests and objectives',
    category: 'runtime',
  },
  {
    name: 'protagonistDescription',
    description: 'Description of the main character',
    category: 'runtime',
  },
  {
    name: 'styleGuidance',
    description: 'Style guidance based on user action patterns or style review',
    category: 'runtime',
  },
  {
    name: 'povInstruction',
    description: 'Instruction for point-of-view consistency in generated text',
    category: 'runtime',
  },
  {
    name: 'lengthInstruction',
    description: 'Instruction for response length and conciseness',
    category: 'runtime',
  },

  // ===== ClassifierService =====
  {
    name: 'entityCounts',
    description: 'Summary of existing entity counts (characters, locations, items)',
    category: 'runtime',
  },
  {
    name: 'currentTimeInfo',
    description: 'Current in-story time formatted for the classifier',
    category: 'runtime',
  },
  {
    name: 'chatHistoryBlock',
    description: 'Formatted chat history for classification context',
    category: 'runtime',
  },
  {
    name: 'inputLabel',
    description: 'Label for the user input type (Player Action or Author Direction)',
    category: 'runtime',
  },
  {
    name: 'userAction',
    description: 'The user action or direction that triggered the response',
    category: 'runtime',
  },
  {
    name: 'existingCharacters',
    description: 'Formatted list of existing characters in the story',
    category: 'runtime',
  },
  {
    name: 'existingLocations',
    description: 'Formatted list of existing locations in the story',
    category: 'runtime',
  },
  {
    name: 'existingItems',
    description: 'Formatted list of existing items in the story',
    category: 'runtime',
  },
  {
    name: 'existingBeats',
    description: 'Formatted list of existing story beats',
    category: 'runtime',
  },
  {
    name: 'storyBeatTypes',
    description: 'Available story beat type options',
    category: 'runtime',
  },
  {
    name: 'itemLocationOptions',
    description: 'Available item location options for classification',
    category: 'runtime',
  },
  {
    name: 'defaultItemLocation',
    description: 'Default location for new items',
    category: 'runtime',
  },
  {
    name: 'sceneLocationDesc',
    description: 'Description of how to identify the current scene location',
    category: 'runtime',
  },

  // ===== MemoryService =====
  {
    name: 'chapterContent',
    description: 'Story entries formatted for chapter summarization',
    category: 'runtime',
  },
  {
    name: 'previousContext',
    description: 'Previous chapter summaries for context continuity',
    category: 'runtime',
  },
  {
    name: 'messagesInRange',
    description: 'Story entries within the analysis range for chapter detection',
    category: 'runtime',
  },
  {
    name: 'firstValidId',
    description: 'First valid entry index for chapter boundary detection',
    category: 'runtime',
  },
  {
    name: 'lastValidId',
    description: 'Last valid entry index for chapter boundary detection',
    category: 'runtime',
  },
  {
    name: 'userInput',
    description: 'User input or action text for context',
    category: 'runtime',
  },
  {
    name: 'chapterSummaries',
    description: 'Formatted chapter summaries for retrieval decisions',
    category: 'runtime',
  },
  {
    name: 'maxChaptersPerRetrieval',
    description: 'Maximum number of chapters to retrieve per request',
    category: 'runtime',
  },

  // ===== StyleReviewerService =====
  {
    name: 'passageCount',
    description: 'Number of passages being analyzed for style',
    category: 'runtime',
  },
  {
    name: 'passages',
    description: 'Formatted narration passages for style analysis',
    category: 'runtime',
  },

  // ===== NarrativeService / systemBuilder =====
  {
    name: 'tieredContextBlock',
    description: 'Pre-built tiered context block for narrative injection',
    category: 'runtime',
  },
  {
    name: 'retrievedContext',
    description: 'Retrieved chapter context from memory system',
    category: 'runtime',
  },

  // ===== TranslationService =====
  {
    name: 'targetLanguage',
    description: 'Target language name for translation',
    category: 'runtime',
  },
  {
    name: 'sourceLanguage',
    description: 'Source language name for translation',
    category: 'runtime',
  },
  {
    name: 'content',
    description: 'Content to translate',
    category: 'runtime',
  },
  {
    name: 'elementsJson',
    description: 'JSON array of UI elements for batch translation',
    category: 'runtime',
  },
  {
    name: 'suggestionsJson',
    description: 'JSON array of suggestions for translation',
    category: 'runtime',
  },
  {
    name: 'choicesJson',
    description: 'JSON array of action choices for translation',
    category: 'runtime',
  },

  // ===== ScenarioService (Wizard) =====
  {
    name: 'genreLabel',
    description: 'Display label for the story genre',
    category: 'runtime',
    availableFrom: WizardStep.SettingCreation,
  },
  {
    name: 'seed',
    description: 'User-provided seed text for setting generation',
    category: 'runtime',
    availableFrom: WizardStep.SettingCreation,
  },
  {
    name: 'customInstruction',
    description: 'Author guidance text for generation customization',
    category: 'runtime',
    availableFrom: WizardStep.SettingCreation,
  },
  {
    name: 'settingName',
    description: 'Name of the generated story setting',
    category: 'runtime',
    availableFrom: WizardStep.SettingCreation,
  },
  {
    name: 'settingContext',
    description: 'Formatted setting context for character generation',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'currentSetting',
    description: 'Formatted block of current setting details for refinement',
    category: 'runtime',
    availableFrom: WizardStep.SettingCreation,
  },
  {
    name: 'characterName',
    description: 'Name of the character being generated or refined',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'characterDescription',
    description: 'Description of the character being generated or refined',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'characterBackground',
    description: 'Background and traits of the character being generated',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'currentCharacter',
    description: 'Formatted block of current character details for refinement',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'count',
    description: 'Number of supporting characters to generate',
    category: 'runtime',
    availableFrom: WizardStep.SupportingCharacters,
  },
  {
    name: 'toneInstruction',
    description: 'Tone guidance for character/opening generation',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'settingInstruction',
    description: 'Instruction to fit character into the setting',
    category: 'runtime',
    availableFrom: WizardStep.CharacterCreation,
  },
  {
    name: 'outputFormat',
    description: 'Output format instructions for opening generation',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'tenseInstruction',
    description: 'Instruction for narrative tense in openings',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'supportingCharactersSection',
    description: 'Formatted supporting characters for opening generation',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'atmosphereSection',
    description: 'Setting atmosphere details for opening generation',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'openingInstruction',
    description: 'Specific instructions for opening scene generation',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'guidanceSection',
    description: 'Author guidance section for opening generation',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'currentOpeningBlock',
    description: 'Current opening details for refinement',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'title',
    description: 'Story title for opening generation',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'povPerspective',
    description: 'POV perspective label for opening templates',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },
  {
    name: 'povPerspectiveInstructions',
    description: 'Detailed POV perspective instructions for openings',
    category: 'runtime',
    availableFrom: WizardStep.OpeningGeneration,
  },

  // ===== Lorebook / Retrieval =====
  {
    name: 'entrySummaries',
    description: 'Summarized lorebook entries for retrieval context',
    category: 'runtime',
  },
]

/**
 * Get runtime variables available at a given wizard step.
 *
 * Runtime variables without an `availableFrom` value are always available
 * (services control when they pass data). Variables with `availableFrom`
 * are only available at or after that wizard step.
 *
 * If no step is provided, returns all runtime variables.
 *
 * @param step - Optional wizard step to filter by
 * @returns Array of runtime variable definitions available at the given step
 */
export function getAvailableVariables(step?: WizardStep): RuntimeVariableDefinition[] {
  if (step === undefined) {
    return RUNTIME_VARIABLES
  }

  return RUNTIME_VARIABLES.filter(
    (v) => v.availableFrom === undefined || v.availableFrom <= step
  )
}
