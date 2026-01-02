import type { OpenRouterProvider } from './openrouter';
import type { StoryEntry, StoryBeat, Entry } from '$lib/types';
import { settings, type SuggestionsSettings } from '$lib/stores/settings.svelte';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[Suggestions]', ...args);
  }
}

export interface StorySuggestion {
  text: string;
  type: 'action' | 'dialogue' | 'revelation' | 'twist';
}

export interface SuggestionsResult {
  suggestions: StorySuggestion[];
}

export class SuggestionsService {
  private provider: OpenRouterProvider;
  private settingsOverride?: Partial<SuggestionsSettings>;

  constructor(provider: OpenRouterProvider, settingsOverride?: Partial<SuggestionsSettings>) {
    this.provider = provider;
    this.settingsOverride = settingsOverride;
  }

  private get model(): string {
    return this.settingsOverride?.model ?? settings.systemServicesSettings.suggestions.model;
  }

  private get temperature(): number {
    return this.settingsOverride?.temperature ?? settings.systemServicesSettings.suggestions.temperature;
  }

  private get maxTokens(): number {
    return this.settingsOverride?.maxTokens ?? settings.systemServicesSettings.suggestions.maxTokens;
  }

  private get systemPrompt(): string {
    return this.settingsOverride?.systemPrompt ?? settings.systemServicesSettings.suggestions.systemPrompt;
  }

  /**
   * Generate story direction suggestions for creative writing mode.
   * Per design doc section 4.2: Suggestions System
   */
  async generateSuggestions(
    recentEntries: StoryEntry[],
    activeThreads: StoryBeat[],
    genre?: string | null,
    lorebookEntries?: Entry[]
  ): Promise<SuggestionsResult> {
    log('generateSuggestions called', {
      recentEntriesCount: recentEntries.length,
      activeThreadsCount: activeThreads.length,
      genre,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    // Get the last few entries for context
    const lastEntries = recentEntries.slice(-5);
    const lastContent = lastEntries.map(e => {
      const prefix = e.type === 'user_action' ? '[DIRECTION]' : '[NARRATIVE]';
      return `${prefix} ${e.content}`;
    }).join('\n\n');

    // Format active threads
    const threadsContext = activeThreads.length > 0
      ? activeThreads.map(t => `• ${t.title}${t.description ? `: ${t.description}` : ''}`).join('\n')
      : '(none)';

    // Format lorebook entries for context
    let lorebookContext = '';
    if (lorebookEntries && lorebookEntries.length > 0) {
      const entryDescriptions = lorebookEntries.slice(0, 15).map(e => {
        let desc = `• ${e.name} (${e.type})`;
        if (e.description) {
          // Truncate long descriptions
          const shortDesc = e.description.length > 150
            ? e.description.slice(0, 150) + '...'
            : e.description;
          desc += `: ${shortDesc}`;
        }
        return desc;
      }).join('\n');
      lorebookContext = `\n\n## Lorebook/World Elements\nThe following characters, locations, and concepts exist in this world and can be incorporated into suggestions:\n${entryDescriptions}`;
    }

    const prompt = `Based on the current story moment, suggest 3 distinct directions the story could go next.

## Recent Story Content
"""
${lastContent}
"""

## Active Story Threads
${threadsContext}

${genre ? `## Genre: ${genre}` : ''}${lorebookContext}

## Your Task
Generate 3 diverse story direction suggestions. Each should be:
- A single sentence describing what happens next
- Varied in approach (don't give 3 similar options)
- Specific enough to write toward, vague enough to allow creativity
- Appropriate to the established tone and genre
- May reference lorebook elements if they fit naturally

Consider including:
- An action/plot progression option
- A character/dialogue-focused option
- A twist or revelation option

Respond with JSON only:
{
  "suggestions": [
    {"text": "Direction 1...", "type": "action|dialogue|revelation|twist"},
    {"text": "Direction 2...", "type": "action|dialogue|revelation|twist"},
    {"text": "Direction 3...", "type": "action|dialogue|revelation|twist"}
  ]
}`;

    try {
      const response = await this.provider.generateResponse({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });

      const result = this.parseSuggestions(response.content);
      log('Suggestions generated:', result.suggestions.length);
      return result;
    } catch (error) {
      log('Suggestions generation failed:', error);
      return { suggestions: [] };
    }
  }

  private parseSuggestions(content: string): SuggestionsResult {
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      const suggestions: StorySuggestion[] = [];

      if (Array.isArray(parsed.suggestions)) {
        for (const s of parsed.suggestions.slice(0, 3)) {
          if (s.text) {
            suggestions.push({
              text: s.text,
              type: ['action', 'dialogue', 'revelation', 'twist'].includes(s.type)
                ? s.type
                : 'action',
            });
          }
        }
      }

      return { suggestions };
    } catch (e) {
      log('Failed to parse suggestions:', e);
      return { suggestions: [] };
    }
  }
}
