/**
 * Style Reviewer Service
 *
 * Analyzes text for repetitive phrases and style issues.
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * Original implementation preserved in comments below for reference.
 */

import { createLogger } from '../core/config';

const log = createLogger('StyleReviewer');

// Type definitions preserved from original

// PhraseAnalysis matches PersistentPhraseAnalysis from $lib/types
export interface PhraseAnalysis {
  phrase: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high';
  alternatives: string[];
  contexts: string[];
}

// StyleReviewResult matches PersistentStyleReviewResult from $lib/types
export interface StyleReviewResult {
  phrases: PhraseAnalysis[];
  overallAssessment: string;
  reviewedEntryCount: number;
  timestamp: number;
}

// Legacy aliases for backward compatibility
export interface RepetitivePhrase {
  phrase: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
  suggestions: string[];
}

export interface StyleAnalysis {
  repetitivePhrases: RepetitivePhrase[];
  overallScore: number;
  summary: string;
}

/**
 * Service that analyzes text for style issues.
 * NOTE: This service has been stubbed during SDK migration.
 */
export class StyleReviewerService {
  private presetId: string;

  constructor(presetId: string = 'styleReviewer') {
    this.presetId = presetId;
  }

  /**
   * Format style review results for injection into the system prompt.
   * This is a static method used by systemBuilder.
   */
  static formatForPromptInjection(review: StyleReviewResult): string {
    if (!review.phrases || review.phrases.length === 0) {
      return '';
    }

    let block = '\n\n<style_guidance>\n';
    block += '## Writing Style Feedback\n';
    block += `Based on analysis of ${review.reviewedEntryCount} recent entries:\n\n`;

    for (const phrase of review.phrases) {
      block += `- **"${phrase.phrase}"** (used ${phrase.frequency} times, ${phrase.severity} severity)\n`;
      if (phrase.alternatives.length > 0) {
        block += `  Alternatives: ${phrase.alternatives.join(', ')}\n`;
      }
    }

    block += `\nOverall: ${review.overallAssessment}\n`;
    block += '</style_guidance>';

    return block;
  }

  /**
   * Analyze text for repetitive phrases and style issues.
   * @throws Error - Service not implemented during SDK migration
   */
  async analyzeStyle(text: string): Promise<StyleAnalysis> {
    throw new Error('StyleReviewerService.analyzeStyle() not implemented - awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    const config = settings.getPresetConfig(this.presetId);

    const promptContext: PromptContext = {
      mode: 'adventure',
      pov: 'second',
      tense: 'present',
      protagonistName: '',
    };

    const systemPrompt = promptService.renderPrompt('style-analysis', promptContext);
    const userPrompt = promptService.renderUserPrompt('style-analysis', promptContext, {
      text,
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

    const parsed = tryParseJsonWithHealing<StyleAnalysis>(response.content);
    if (!parsed) {
      log('Failed to parse style analysis response');
      return {
        repetitivePhrases: [],
        overallScore: 100,
        summary: 'Unable to analyze style',
      };
    }

    return parsed;
    */
  }
}
