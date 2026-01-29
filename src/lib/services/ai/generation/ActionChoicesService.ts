/**
 * Action Choices Service
 *
 * Generates action choices for adventure mode gameplay.
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * Original implementation preserved in comments below for reference.
 */

import type { StoryEntry } from '$lib/types';
import { createLogger } from '../core/config';

const log = createLogger('ActionChoices');

// Type definitions preserved from original
export interface ActionChoice {
  text: string;
  type: 'action' | 'dialogue' | 'examine' | 'other';
}

export interface ActionChoicesContext {
  narrativeResponse: string;
  userAction: string;
  recentEntries: StoryEntry[];
  protagonistName: string;
  mode: string;
  pov: string;
  tense: string;
}

export interface ActionChoicesResult {
  choices: ActionChoice[];
  reasoning?: string;
}

/**
 * Service that generates action choices for adventure mode.
 * NOTE: This service has been stubbed during SDK migration.
 */
export class ActionChoicesService {
  private presetId: string;

  constructor(presetId: string = 'actionChoices') {
    this.presetId = presetId;
  }

  /**
   * Generate action choices based on current narrative context.
   * @throws Error - Service not implemented during SDK migration
   */
  async generateChoices(context: ActionChoicesContext): Promise<ActionChoice[]> {
    throw new Error('ActionChoicesService.generateChoices() not implemented - awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    const config = settings.getPresetConfig(this.presetId);

    const promptContext: PromptContext = {
      mode: context.mode as any,
      pov: context.pov as any,
      tense: context.tense as any,
      protagonistName: context.protagonistName,
    };

    const systemPrompt = promptService.renderPrompt('action-choices', promptContext);

    const recentContent = context.recentEntries
      .slice(-5)
      .map(e => `[${e.type}]: ${e.content}`)
      .join('\n\n');

    const userPrompt = promptService.renderUserPrompt('action-choices', promptContext, {
      recentContent,
      userAction: context.userAction,
      narrativeResponse: context.narrativeResponse,
    });

    const response = await this.provider.generateResponse({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      extraBody: buildExtraBody({
        manualMode: false,
        manualBody: config.manualBody,
        reasoningEffort: config.reasoningEffort,
        providerOnly: config.providerOnly,
      }),
    });

    const parsed = tryParseJsonWithHealing<ActionChoice[]>(response.content);
    if (!parsed || !Array.isArray(parsed)) {
      log('Failed to parse action choices response');
      return [];
    }

    return parsed.slice(0, 4);
    */
  }
}
