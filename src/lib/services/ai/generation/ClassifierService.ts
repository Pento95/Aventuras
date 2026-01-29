/**
 * Classifier Service
 *
 * Extracts world state from narrative responses (characters, locations, items, story beats).
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * Original implementation preserved in comments below for reference.
 */

import type { Character, Location, Item, StoryBeat, Story, TimeTracker } from '$lib/types';
import { createLogger } from '../core/config';

const log = createLogger('Classifier');

// Type definitions preserved from original

// Entry update types (used by applyClassificationResult in story store)
export interface CharacterUpdateEntry {
  name: string;
  changes: {
    status?: 'active' | 'inactive' | 'deceased';
    relationship?: string;
    newTraits?: string[];
    removeTraits?: string[];
    replaceVisualDescriptors?: string[];
    addVisualDescriptors?: string[];
    removeVisualDescriptors?: string[];
  };
}

export interface LocationUpdateEntry {
  name: string;
  changes: {
    visited?: boolean;
    current?: boolean;
    description?: string;
    descriptionAddition?: string;
  };
}

export interface ItemUpdateEntry {
  name: string;
  changes: {
    quantity?: number;
    location?: string;
    equipped?: boolean;
  };
}

export interface StoryBeatUpdateEntry {
  title: string;
  changes: {
    status?: 'pending' | 'active' | 'completed' | 'failed';
    description?: string;
  };
}

export interface NewCharacterEntry {
  name: string;
  description?: string;
  relationship?: string;
  traits?: string[];
  visualDescriptors?: string[];
  status?: 'active' | 'inactive' | 'deceased';
}

export interface NewLocationEntry {
  name: string;
  description?: string;
  visited?: boolean;
  current?: boolean;
}

export interface NewItemEntry {
  name: string;
  description?: string;
  quantity?: number;
  location?: string;
  equipped?: boolean;
}

export interface NewStoryBeatEntry {
  title: string;
  description?: string;
  type?: 'milestone' | 'quest' | 'revelation' | 'event' | 'plot_point';
  status?: 'pending' | 'active' | 'completed' | 'failed';
}

export interface EntryUpdates {
  characterUpdates: CharacterUpdateEntry[];
  locationUpdates: LocationUpdateEntry[];
  itemUpdates: ItemUpdateEntry[];
  storyBeatUpdates: StoryBeatUpdateEntry[];
  newCharacters: NewCharacterEntry[];
  newLocations: NewLocationEntry[];
  newItems: NewItemEntry[];
  newStoryBeats: NewStoryBeatEntry[];
}

export interface ClassificationResult {
  characters: Character[];
  locations: Location[];
  items: Item[];
  storyBeats: StoryBeat[];
  timeAdvancement?: TimeTracker;
  entryUpdates: EntryUpdates;
  scene?: {
    location?: string;
    presentCharacters?: string[];
    mood?: string;
    currentLocationName?: string;
    timeProgression?: 'none' | 'minutes' | 'hours' | 'days';
  };
}

export interface ClassificationContext {
  storyId: string;
  story: Story;
  narrativeResponse: string;
  userAction: string;
  existingCharacters: Character[];
  existingLocations: Location[];
  existingItems: Item[];
  existingStoryBeats: StoryBeat[];
}

// Additional type exports for compatibility
export interface ClassificationChatEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface CharacterUpdate {
  id: string;
  name?: string;
  description?: string;
  relationship?: string;
  traits?: string[];
  status?: 'active' | 'inactive' | 'unknown';
}

export interface LocationUpdate {
  id: string;
  name?: string;
  description?: string;
  visited?: boolean;
  current?: boolean;
}

export interface ItemUpdate {
  id: string;
  name?: string;
  description?: string;
  quantity?: number;
  location?: string;
  equipped?: boolean;
}

export interface StoryBeatUpdate {
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'active' | 'completed' | 'failed';
}

export interface NewCharacter {
  name: string;
  description?: string;
  relationship?: string;
  traits?: string[];
  status?: 'active' | 'inactive' | 'unknown';
}

export interface NewLocation {
  name: string;
  description?: string;
  visited?: boolean;
  current?: boolean;
}

export interface NewItem {
  name: string;
  description?: string;
  quantity?: number;
  location?: string;
  equipped?: boolean;
}

export interface NewStoryBeat {
  title: string;
  description?: string;
  type?: 'quest' | 'event' | 'discovery' | 'milestone';
  status?: 'pending' | 'active' | 'completed' | 'failed';
}

/**
 * Service that classifies narrative responses to extract world state.
 * NOTE: This service has been stubbed during SDK migration.
 */
export class ClassifierService {
  private presetId: string;
  private chatHistoryTruncation: number;

  constructor(presetId: string = 'classification', chatHistoryTruncation: number = 100) {
    this.presetId = presetId;
    this.chatHistoryTruncation = chatHistoryTruncation;
  }

  /**
   * Classify a narrative response to extract world state changes.
   * @throws Error - Service not implemented during SDK migration
   */
  async classify(context: ClassificationContext): Promise<ClassificationResult> {
    throw new Error('ClassifierService.classify() not implemented - awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    const config = settings.getPresetConfig(this.presetId);

    // Build system prompt using prompt service
    const promptContext: PromptContext = {
      mode: context.story.settings.mode,
      pov: context.story.settings.pov,
      tense: context.story.settings.tense,
      protagonistName: context.story.settings.protagonistName,
    };

    const systemPrompt = promptService.renderPrompt('classifier', promptContext, {
      existingCharacters: JSON.stringify(context.existingCharacters.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        relationship: c.relationship,
      }))),
      existingLocations: JSON.stringify(context.existingLocations.map(l => ({
        id: l.id,
        name: l.name,
        visited: l.visited,
      }))),
      existingItems: JSON.stringify(context.existingItems.map(i => ({
        id: i.id,
        name: i.name,
        location: i.location,
      }))),
      existingStoryBeats: JSON.stringify(context.existingStoryBeats.map(b => ({
        id: b.id,
        title: b.title,
        status: b.status,
      }))),
    });

    const userPrompt = promptService.renderUserPrompt('classifier', promptContext, {
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

    const parsed = tryParseJsonWithHealing<ClassificationResult>(response.content);
    if (!parsed) {
      log('Failed to parse classification response');
      return { characters: [], locations: [], items: [], storyBeats: [] };
    }

    return this.normalizeResult(parsed, context);
    */
  }
}
