/**
 * Image Prompt Service
 *
 * Analyzes narrative text to identify visually striking moments for image generation.
 * Returns structured data including image prompts and source text for embedding.
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * Original implementation preserved in comments below for reference.
 */

import { createLogger } from '../core/config';

const log = createLogger('ImagePrompt');

/**
 * Represents a scene identified as suitable for image generation.
 */
export interface ImageableScene {
  /** The detailed prompt for image generation */
  prompt: string;
  /** Verbatim quote from narrative (for text matching) */
  sourceText: string;
  /** Type of scene */
  sceneType: 'action' | 'item' | 'character' | 'environment';
  /** Priority 1-10, higher = more important */
  priority: number;
  /** Character names depicted in this scene (up to 3). First character is primary. Empty array for environment-only scenes. */
  characters: string[];
  /** If true, generate a portrait for the first character (portrait mode only) */
  generatePortrait: boolean;
}

/**
 * Context needed to analyze narrative for imageable scenes.
 */
export interface ImagePromptContext {
  /** The narrative text to analyze (English original) */
  narrativeResponse: string;
  /** The user action that triggered this narrative */
  userAction: string;
  /** Characters present in the scene with their visual descriptors */
  presentCharacters: Array<{
    name: string;
    visualDescriptors: string[];
  }>;
  /** Current location name */
  currentLocation?: string;
  /** The image style prompt to include */
  stylePrompt: string;
  /** Maximum number of images (0 = unlimited) */
  maxImages: number;
  /** Full chat history for comprehensive context */
  chatHistory?: string;
  /** Activated lorebook entries for world context */
  lorebookContext?: string;
  /** Names of characters that have portrait images available */
  charactersWithPortraits: string[];
  /** Names of characters that need portrait generation before appearing in scene images */
  charactersWithoutPortraits: string[];
  /** Whether to use portrait reference mode */
  portraitMode: boolean;
  /** Translated narrative text - use this for sourceText extraction when available */
  translatedNarrative?: string;
  /** Target language for translation */
  translationLanguage?: string;
}

/**
 * Service settings for image prompt generation.
 */
export interface ImagePromptSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
}

const DEFAULT_SETTINGS: ImagePromptSettings = {
  model: 'deepseek/deepseek-v3.2',
  temperature: 0.3,
  maxTokens: 2048,
  reasoningEffort: 'off',
};

/**
 * Service that identifies imageable scenes in narrative text.
 * NOTE: This service has been stubbed during SDK migration.
 */
export class ImagePromptService {
  private settings: ImagePromptSettings;
  private debug: boolean;

  constructor(
    settings: Partial<ImagePromptSettings> = {},
    debug = false
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.debug = debug;
  }

  /**
   * Analyze narrative text to identify visually striking moments.
   * @throws Error - Service not implemented during SDK migration
   */
  async identifyScenes(context: ImagePromptContext): Promise<ImageableScene[]> {
    if (this.debug) {
      log('Analyzing narrative for imageable scenes', {
        portraitMode: context.portraitMode,
        charactersWithPortraits: context.charactersWithPortraits,
      });
    }

    throw new Error('ImagePromptService.identifyScenes() not implemented - awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    const characterDescriptors = this.buildCharacterDescriptors(context.presentCharacters);

    const charactersWithPortraitsStr = context.charactersWithPortraits.length > 0
      ? context.charactersWithPortraits.join(', ')
      : 'None';
    const charactersWithoutPortraitsStr = context.charactersWithoutPortraits.length > 0
      ? context.charactersWithoutPortraits.join(', ')
      : 'None';

    const promptContext = {
      mode: 'adventure' as const,
      pov: 'second' as const,
      tense: 'present' as const,
      protagonistName: '',
    };

    const templateId = context.portraitMode
      ? 'image-prompt-analysis-reference'
      : 'image-prompt-analysis';

    const systemPrompt = promptService.renderPrompt(templateId, promptContext, {
      imageStylePrompt: context.stylePrompt,
      characterDescriptors: characterDescriptors || 'No character visual descriptors available.',
      charactersWithPortraits: charactersWithPortraitsStr,
      charactersWithoutPortraits: charactersWithoutPortraitsStr,
      maxImages: context.maxImages === 0 ? '0 (unlimited)' : String(context.maxImages),
    });

    const userPrompt = promptService.renderUserPrompt(templateId, promptContext, {
      narrativeResponse: context.narrativeResponse,
      userAction: context.userAction,
      chatHistory: context.chatHistory || '',
      lorebookContext: context.lorebookContext || '',
      translatedNarrativeBlock,
    });

    const response = await this.provider.generateResponse({
      model: this.settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens,
      extraBody,
    });

    const scenes = this.parseResponse(response.content);
    return scenes.sort((a, b) => b.priority - a.priority);
    */
  }
}

/**
 * Create an ImagePromptService instance.
 */
export function createImagePromptService(
  settings?: Partial<ImagePromptSettings>,
  debug?: boolean
): ImagePromptService {
  return new ImagePromptService(settings, debug);
}
