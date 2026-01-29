/**
 * Image Generation Service
 *
 * Coordinates the full image generation pipeline:
 * 1. Identify imageable scenes from narrative using ImagePromptService
 * 2. Create pending EmbeddedImage records
 * 3. Queue async image generation for each scene
 *
 * STATUS: STUBBED - Awaiting SDK migration for scene analysis
 * Image providers (NanoGPT, Chutes, Pollinations) work without SDK.
 */

import type { EmbeddedImage, Character } from '$lib/types';
import type { ImageProvider, ImageModelInfo } from './providers/base';
import { ImagePromptService, type ImagePromptContext, type ImageableScene } from './ImagePromptService';
import { NanoGPTImageProvider } from './providers/NanoGPTProvider';
import { ChutesImageProvider } from './providers/ChutesProvider';
import { PollinationsImageProvider } from './providers/PollinationsProvider';
import { database } from '$lib/services/database';
import { promptService } from '$lib/services/prompts';
import { settings } from '$lib/stores/settings.svelte';
import { story } from '$lib/stores/story.svelte';
import { emitImageQueued, emitImageReady, emitImageAnalysisStarted, emitImageAnalysisComplete, emitImageAnalysisFailed } from '$lib/services/events';
import { normalizeImageDataUrl } from '$lib/utils/image';
import { createLogger, DEBUG } from '../core/config';
import { DEFAULT_FALLBACK_STYLE_PROMPT } from './constants';

const log = createLogger('ImageGeneration');

export interface ImageGenerationContext {
  storyId: string;
  entryId: string;
  narrativeResponse: string;
  userAction: string;
  presentCharacters: Character[];
  currentLocation?: string;
  chatHistory?: string;
  lorebookContext?: string;
  translatedNarrative?: string;
  translationLanguage?: string;
}

/**
 * Service that coordinates image generation for narratives.
 * NOTE: Scene analysis (identifyScenes) is stubbed during SDK migration.
 *       Direct image generation methods still work.
 */
export class ImageGenerationService {
  private promptService: ImagePromptService;
  private imageProvider: ImageProvider | null = null;
  private presetId: string;

  constructor(presetId: string) {
    this.presetId = presetId;
    const preset = settings.getPresetConfig(presetId);
    const promptSettings = {
      model: preset.model,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      reasoningEffort: preset.reasoningEffort,
    };
    this.promptService = new ImagePromptService(promptSettings);
  }

  /**
   * Check if image generation is enabled and configured
   */
  static isEnabled(): boolean {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings?.enabled) return false;

    const provider = imageSettings.imageProvider ?? 'nanogpt';
    if (provider === 'chutes') {
      return !!imageSettings.chutesApiKey;
    }
    if (provider === 'pollinations') {
      return true;
    }
    return !!imageSettings.nanoGptApiKey;
  }

  /**
   * Get the API key for the currently selected provider
   */
  private static getApiKey(): string {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const provider = imageSettings.imageProvider ?? 'nanogpt';
    if (provider === 'chutes') {
      return imageSettings.chutesApiKey;
    }
    if (provider === 'pollinations') {
      return imageSettings.pollinationsApiKey;
    }
    return imageSettings.nanoGptApiKey;
  }

  /**
   * Check if API key is available for the currently selected provider
   */
  static hasRequiredCredentials(): boolean {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const provider = imageSettings.imageProvider ?? 'nanogpt';

    switch (provider) {
      case 'chutes':
        return !!imageSettings.chutesApiKey;
      case 'pollinations':
        return true;
      default:
        return !!imageSettings.nanoGptApiKey;
    }
  }

  /**
   * Get display name for the currently selected provider
   */
  static getProviderDisplayName(): string {
    const provider = settings.systemServicesSettings.imageGeneration.imageProvider ?? 'nanogpt';
    switch (provider) {
      case 'chutes':
        return 'Chutes';
      case 'pollinations':
        return 'Pollinations.ai';
      default:
        return 'NanoGPT';
    }
  }

  /**
   * Create the appropriate image provider based on settings
   */
  static createProviderInstance(provider?: string, apiKey?: string): ImageProvider {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const effectiveProvider = provider ?? imageSettings.imageProvider ?? 'nanogpt';
    const effectiveApiKey = apiKey ?? ImageGenerationService.getApiKey();

    if (effectiveProvider === 'chutes') {
      return new ChutesImageProvider(effectiveApiKey, DEBUG.enabled);
    }
    if (effectiveProvider === 'pollinations') {
      return new PollinationsImageProvider(effectiveApiKey, DEBUG.enabled);
    }
    return new NanoGPTImageProvider(effectiveApiKey, DEBUG.enabled);
  }

  /**
   * List available models for a given provider.
   */
  static async listModels(providerId: string, apiKey?: string): Promise<ImageModelInfo[]> {
    try {
      const provider = this.createProviderInstance(providerId, apiKey);
      return await provider.listModels();
    } catch (error) {
      log(`Failed to list models for provider ${providerId}:`, error);
      return [];
    }
  }

  /**
   * Clear the models cache for a provider to force a fresh fetch.
   */
  static clearModelsCache(providerId: string): void {
    if (providerId === 'nanogpt') {
      NanoGPTImageProvider.clearModelsCache();
    } else if (providerId === 'chutes') {
      ChutesImageProvider.clearModelsCache();
    } else if (providerId === 'pollinations') {
      PollinationsImageProvider.clearModelsCache();
    }
  }

  /**
   * Create the instance-level provider using current settings
   */
  private getOrCreateImageProvider(): ImageProvider {
    if (!this.imageProvider) {
      this.imageProvider = ImageGenerationService.createProviderInstance();
    }
    return this.imageProvider;
  }

  /**
   * Generate images for a narrative response.
   * @throws Error - Scene analysis not implemented during SDK migration
   */
  async generateForNarrative(context: ImageGenerationContext): Promise<void> {
    const imageSettings = settings.systemServicesSettings.imageGeneration;

    // Determine effective mode
    const storySettings = story.currentStory?.settings;
    let mode = storySettings?.imageGenerationMode;

    if (!mode) {
      if (storySettings?.inlineImageMode) mode = 'inline';
      else if (imageSettings?.enabled) mode = 'auto';
      else mode = 'none';
    }

    if (mode !== 'auto') {
      log('Image generation skipped', { mode });
      return;
    }

    // Emit analysis started, then immediately emit failure
    emitImageAnalysisStarted(context.entryId);
    emitImageAnalysisFailed(context.entryId, 'Scene analysis not implemented - awaiting SDK migration');

    throw new Error('ImageGenerationService.generateForNarrative() not implemented - scene analysis awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    const portraitMode = imageSettings.portraitMode ?? false;
    const presentCharacterNames = context.presentCharacters.map(c => c.name.toLowerCase());
    const charactersWithPortraits = story.characters
      .filter(c => presentCharacterNames.includes(c.name.toLowerCase()) && c.portrait)
      .map(c => c.name);
    const charactersWithoutPortraits = story.characters
      .filter(c => presentCharacterNames.includes(c.name.toLowerCase()) && !c.portrait)
      .map(c => c.name);

    const stylePrompt = this.getStylePrompt(imageSettings.styleId);
    const characterDescriptors = context.presentCharacters
      .filter(c => c.visualDescriptors && c.visualDescriptors.length > 0)
      .map(c => ({ name: c.name, visualDescriptors: c.visualDescriptors ?? [] }));

    const promptContext: ImagePromptContext = { ... };

    emitImageAnalysisStarted(context.entryId);
    const scenes = await this.promptService.identifyScenes(promptContext);
    emitImageAnalysisComplete(context.entryId, scenes.length, 0);

    for (const scene of scenes) {
      await this.queueImageGeneration(context.storyId, context.entryId, scene, imageSettings, context.presentCharacters);
    }
    */
  }

  /**
   * Get the style prompt for the selected style ID
   */
  private getStylePrompt(styleId: string): string {
    try {
      const promptContext = {
        mode: 'adventure' as const,
        pov: 'second' as const,
        tense: 'present' as const,
        protagonistName: '',
      };
      const customized = promptService.getPrompt(styleId, promptContext);
      if (customized) {
        return customized;
      }
    } catch {
      // Template not found, use fallback
    }

    const defaultStyles: Record<string, string> = {
      'image-style-soft-anime': DEFAULT_FALLBACK_STYLE_PROMPT,
      'image-style-semi-realistic': `Semi-realistic anime art with refined, detailed rendering. Realistic proportions with anime influence. Detailed hair strands, subtle skin tones, fabric folds. Naturalistic lighting with clear direction and soft falloff. Cinematic composition with depth of field. Rich, slightly desaturated colors with intentional color grading. Painterly quality with polished edges. Atmospheric and grounded mood.`,
      'image-style-photorealistic': `Photorealistic digital art. True-to-life rendering with natural lighting. Detailed textures, accurate proportions. Professional photography aesthetic. Cinematic depth of field. High dynamic range. Realistic materials and surfaces.`,
    };

    return defaultStyles[styleId] || defaultStyles['image-style-soft-anime'];
  }

  /**
   * Centralized image generation logic.
   * NOTE: This method still works - it doesn't require LLM.
   */
  private static async performImageGeneration(
    imageId: string,
    entryId: string,
    prompt: string,
    model: string,
    size: string,
    provider: ImageProvider,
    referenceImageUrls?: string[]
  ): Promise<void> {
    try {
      const response = await provider.generateImage({
        prompt,
        model,
        size,
        response_format: 'b64_json',
        imageDataUrls: referenceImageUrls,
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      await database.updateEmbeddedImage(imageId, {
        imageData: response.images[0].b64_json,
        status: 'complete',
      });

      log('Image generation successful', { imageId, hasReference: !!referenceImageUrls });
      emitImageReady(imageId, entryId, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('Image generation failed', { imageId, error: errorMessage });

      await database.updateEmbeddedImage(imageId, {
        status: 'failed',
        errorMessage,
      });

      emitImageReady(imageId, entryId, false);
      emitImageAnalysisFailed(entryId, errorMessage);
    }
  }

  /**
   * Retry image generation for a failed/existing image using CURRENT settings.
   * NOTE: This method still works - it doesn't require LLM.
   */
  static async retryImageGeneration(imageId: string, prompt: string): Promise<void> {
    if (!this.isEnabled()) {
      log('Cannot retry - image generation not enabled');
      return;
    }

    const image = await database.getEmbeddedImage(imageId);
    if (!image) {
      log('Cannot retry - image not found', { imageId });
      return;
    }

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const provider = imageSettings.imageProvider ?? 'nanogpt';
    const model = imageSettings.model;
    const size = imageSettings.size;

    await database.updateEmbeddedImage(imageId, {
      model,
      status: 'generating',
      errorMessage: undefined,
      width: size === '2048x2048' ? 2048 : (size === '1024x1024' ? 1024 : 512),
      height: size === '2048x2048' ? 2048 : (size === '1024x1024' ? 1024 : 512),
    });

    log('Retrying image generation with current settings', {
      imageId,
      provider,
      model,
      size,
    });

    const apiKey = this.getApiKey();
    const imageProvider = this.createProviderInstance(provider, apiKey);

    await this.performImageGeneration(
      imageId,
      image.entryId,
      prompt,
      model,
      size,
      imageProvider
    );
  }
}
