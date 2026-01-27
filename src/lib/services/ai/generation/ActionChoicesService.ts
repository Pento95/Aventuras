import { BaseAIService, type OpenAIProvider } from '../core/BaseAIService';
import type { StoryEntry, Character, Location, Item, StoryBeat, Entry, GenerationPreset } from '$lib/types';
import { promptService, type PromptContext } from '$lib/services/prompts';
import { tryParseJsonWithHealing } from '../utils/jsonHealing';
import { createLogger, getContextConfig, getLorebookConfig } from '../core/config';

const log = createLogger('ActionChoices');

export interface ActionChoice {
  text: string;           // The action text (what the player would do)
  type: 'action' | 'dialogue' | 'examine' | 'move';
  icon?: string;          // Optional icon hint for UI
}

export interface ActionChoicesResult {
  choices: ActionChoice[];
}

interface WorldStateContext {
  characters: Character[];
  locations: Location[];
  items: Item[];
  storyBeats: StoryBeat[];
  currentLocation?: Location;
}

export class ActionChoicesService extends BaseAIService {
  constructor(provider: OpenAIProvider, presetId: string = 'suggestions', settingsOverride?: Partial<GenerationPreset>) {
    super(provider, presetId, settingsOverride);
  }

  /**
   * Generate RPG-style action choices based on the current narrative moment.
   * These are presented as multiple choice options like in classic RPGs.
   * @param promptContext - Complete story context for macro expansion (preferred)
   * @param pov - Point of view (deprecated, use promptContext)
   */
  async generateChoices(
    recentEntries: StoryEntry[],
    worldState: WorldStateContext,
    narrativeResponse: string,
    lorebookEntries?: Entry[],
    promptContext?: PromptContext,
    pov?: 'first' | 'second' | 'third'
  ): Promise<ActionChoicesResult> {
    log('generateChoices called', {
      recentEntriesCount: recentEntries.length,
      narrativeLength: narrativeResponse.length,
      currentLocation: worldState.currentLocation?.name,
      presentCharacters: worldState.characters.filter(c => c.status === 'active').length,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    // Build context from world state
    const currentLoc = worldState.currentLocation;
    // Get the protagonist (user's character) - the one with relationship === 'self'
    const protagonist = worldState.characters.find(c => c.relationship === 'self');
    // Get NPCs (other characters, not the user's character)
    const activeCharacters = worldState.characters.filter(c => c.status === 'active' && c.relationship !== 'self');
    const inventoryItems = worldState.items.filter(i => i.location === 'inventory');
    const activeQuests = worldState.storyBeats.filter(b => b.status === 'active' || b.status === 'pending');

    // Get last few entries for immediate context
    const contextConfig = getContextConfig();
    const lastEntries = recentEntries.slice(-contextConfig.recentEntriesForChoices);
    const recentContext = lastEntries.map(e => {
      const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATIVE]';
      return `${prefix} ${e.content}`;
    }).join('\n');

    // Extract user's action examples to learn their style
    const userActions = recentEntries
      .filter(e => e.type === 'user_action')
      .slice(-contextConfig.userActionsForStyle)
      .map(e => e.content.trim());

    // Build style guidance based on user's actual writing
    let styleGuidance = '';
    if (userActions.length > 0) {
      const avgLength = Math.round(userActions.reduce((sum, a) => sum + a.split(' ').length, 0) / userActions.length);
      const usesFirstPerson = userActions.some(a => /^I\s/i.test(a) || /\sI\s/i.test(a));
      const usesQuotes = userActions.some(a => a.includes('"'));
      const isVerbose = avgLength > 15;
      const isTerse = avgLength < 6;

      styleGuidance = `
## User's Writing Style (MATCH THIS)
Here are the user's recent actions - mimic their style:
${userActions.slice(-4).map(a => `- "${a}"`).join('\n')}

Style observations to follow:
- Length: ${isTerse ? 'Very short and punchy' : isVerbose ? 'Detailed and descriptive' : 'Moderate length'} (~${avgLength} words average)
- Person: ${usesFirstPerson ? 'Uses "I" statements' : 'Uses commands/third person'}
- Format: ${usesQuotes ? 'Sometimes includes dialogue in quotes' : 'Primarily action descriptions'}
Match their vocabulary, tone, and phrasing patterns.`;
    }

    // Determine POV instruction for action phrasing (fallback if no user examples)
    let povInstruction: string;
    if (userActions.length > 0) {
      povInstruction = 'Write actions in the SAME STYLE as the user examples above. Match their phrasing exactly.';
    } else if (pov === 'third') {
      povInstruction = 'Write actions as commands/intentions (e.g., "Examine the door", "Ask the merchant about...")';
    } else {
      povInstruction = 'Write actions in first person (e.g., "I examine the door", "I ask the merchant about...")';
    }

    // Format lorebook entries for context
    const lorebookConfig = getLorebookConfig();
    let lorebookContext = '';
    if (lorebookEntries && lorebookEntries.length > 0) {
      const entryDescriptions = lorebookEntries.slice(0, lorebookConfig.maxForActionChoices).map(e => {
        let desc = `• ${e.name} (${e.type})`;
        if (e.description) {
          desc += `: ${e.description}`;
        }
        return desc;
      }).join('\n');
      lorebookContext = `\n## Active World Elements\nThese characters, locations, items, and concepts are currently relevant and can be referenced in action choices:\n${entryDescriptions}\n`;
    }

    // Get protagonist name for the prompt
    const protagonistName = protagonist?.name || 'the player';
    const protagonistDesc = protagonist?.description ? ` (${protagonist.description})` : '';

    // Build length instruction
    const lengthInstruction = userActions.length > 0
      ? `Match the length of the user's actions (~${Math.round(userActions.reduce((sum, a) => sum + a.split(' ').length, 0) / userActions.length)} words). They should feel like something the user would actually write.`
      : 'Keep each choice SHORT (under 10 words ideally, max 15). They should be clear, specific actions the USER can take.';

    // Use provided context or build fallback
    const context: PromptContext = promptContext ?? {
      mode: 'adventure',
      pov: pov || 'second',
      tense: 'present',
      protagonistName,
    };

    // Use centralized prompt system
    const prompt = promptService.renderUserPrompt('action-choices', context, {
      protagonistName,
      protagonistDescription: protagonistDesc,
      styleGuidance,
      narrativeResponse,
      recentContext,
      currentLocation: `${currentLoc?.name || 'Unknown'}${currentLoc?.description ? ` - ${currentLoc.description}` : ''}`,
      npcsPresent: activeCharacters.length > 0 ? activeCharacters.map(c => c.name).join(', ') : 'None',
      inventory: inventoryItems.length > 0 ? inventoryItems.map(i => i.name).join(', ') : 'Empty',
      activeQuests: activeQuests.length > 0 ? activeQuests.map(q => q.title).join(', ') : 'None',
      lorebookContext,
      povInstruction,
      lengthInstruction,
    });

    try {
      const response = await this.provider.generateResponse({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: promptService.renderPrompt('action-choices', context),
          },
          { role: 'user', content: prompt },
        ],
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        extraBody: this.extraBody,
      });

      const result = this.parseChoices(response.content);
      log('Choices generated:', result.choices.length);
      return result;
    } catch (error) {
      log('Choices generation failed:', error);
      return { choices: [] };
    }
  }

  private parseChoices(content: string): ActionChoicesResult {
    const parsed = tryParseJsonWithHealing<Record<string, any>>(content);
    if (!parsed) {
      log('Failed to parse choices');
      return { choices: [] };
    }

    const choices: ActionChoice[] = [];
    if (Array.isArray(parsed.choices)) {
      for (const c of parsed.choices.slice(0, 4)) {
        if (c.text) {
          choices.push({
            text: c.text,
            type: ['action', 'dialogue', 'examine', 'move'].includes(c.type)
              ? c.type
              : 'action',
          });
        }
      }
    }

    return { choices };
  }
}
