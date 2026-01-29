/**
 * Interactive Lorebook Service
 *
 * Provides an interactive chat interface for creating and managing lorebook entries.
 * Uses agentic tool calling to manipulate entries.
 *
 * STATUS: STUBBED - Awaiting SDK migration
 * Original implementation preserved in comments below for reference.
 */

import type { VaultLorebookEntry, EntryType, EntryInjectionMode } from '$lib/types';
import { settings, getDefaultInteractiveLorebookSettings, type InteractiveLorebookSettings } from '$lib/stores/settings.svelte';
import { createLogger } from '../core/config';
import { FandomService } from '../../fandom';

const log = createLogger('InteractiveLorebook');

// Event types for progress updates
export type StreamEvent =
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCall: ToolCallDisplay }
  | { type: 'thinking' }
  | { type: 'message'; message: ChatMessage }
  | { type: 'done'; result: SendMessageResult }
  | { type: 'error'; error: string };

// Types for pending changes and chat messages
export interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete' | 'merge';
  toolCallId: string;
  entry?: VaultLorebookEntry;
  index?: number;
  indices?: number[];
  updates?: Partial<VaultLorebookEntry>;
  previous?: VaultLorebookEntry;
  previousEntries?: VaultLorebookEntry[];
  status: 'pending' | 'approved' | 'rejected';
}

// Tool call info for display in chat
export interface ToolCallDisplay {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: string;
  pendingChange?: PendingChange;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  pendingChanges?: PendingChange[];
  toolCalls?: ToolCallDisplay[];
  reasoning?: string;
  isGreeting?: boolean;
}

export interface SendMessageResult {
  response: string;
  pendingChanges: PendingChange[];
  toolCalls: ToolCallDisplay[];
  reasoning?: string;
}

/**
 * Service that provides interactive lorebook management via chat.
 * NOTE: This service has been stubbed during SDK migration.
 */
export class InteractiveLorebookService {
  private lorebookName: string = '';
  private initialized: boolean = false;
  private presetId: string;
  private fandomService: FandomService;

  constructor(presetId: string) {
    this.presetId = presetId;
    this.fandomService = new FandomService();
  }

  /**
   * Get the preset configuration.
   */
  private get preset() {
    return settings.getPresetConfig(this.presetId);
  }

  /**
   * Get the interactive lorebook settings from the settings store.
   */
  private getSettings(): InteractiveLorebookSettings {
    return settings.systemServicesSettings.interactiveLorebook ?? getDefaultInteractiveLorebookSettings();
  }

  /**
   * Initialize the conversation.
   */
  initialize(lorebookName: string, entryCount: number): void {
    this.lorebookName = lorebookName;
    this.initialized = true;
    log('Initialized conversation', { lorebookName, entryCount, model: this.preset.model });
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Send a user message and get the AI response.
   * @throws Error - Service not implemented during SDK migration
   */
  async sendMessage(
    userMessage: string,
    entries: VaultLorebookEntry[]
  ): Promise<SendMessageResult> {
    throw new Error('InteractiveLorebookService.sendMessage() not implemented - awaiting SDK migration');

    /* COMMENTED OUT - Original implementation for reference:
    if (!this.initialized) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    this.messages.push({ role: 'user', content: userMessage });

    const pendingChanges: PendingChange[] = [];
    const toolCalls: ToolCallDisplay[] = [];
    let responseContent = '';
    let reasoning: string | undefined;

    let iterations = 0;
    let continueLoop = true;

    while (continueLoop) {
      iterations++;

      const response = await this.provider.generateWithTools({
        messages: this.messages,
        model: this.preset.model,
        temperature: this.preset.temperature,
        maxTokens: this.preset.maxTokens,
        tools: INTERACTIVE_LOREBOOK_TOOLS,
        tool_choice: 'auto',
        extraBody: buildExtraBody({...}),
      });

      // Process tool calls...
      // (implementation details)
    }

    return { response: responseContent, pendingChanges, toolCalls, reasoning };
    */
  }

  /**
   * Streaming version of sendMessage.
   * @throws Error - Service not implemented during SDK migration
   */
  async *sendMessageStreaming(
    userMessage: string,
    entries: VaultLorebookEntry[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    yield { type: 'error', error: 'InteractiveLorebookService.sendMessageStreaming() not implemented - awaiting SDK migration' };
  }

  /**
   * Handle approval or rejection of a pending change.
   */
  handleApproval(change: PendingChange, approved: boolean, rejectionReason?: string): void {
    log('Handled approval', { changeId: change.id, approved });
  }

  /**
   * Apply a pending change to the entries array.
   */
  applyChange(change: PendingChange, entries: VaultLorebookEntry[]): VaultLorebookEntry[] {
    const newEntries = [...entries];

    switch (change.type) {
      case 'create':
        if (change.entry) {
          newEntries.push(change.entry);
        }
        break;

      case 'update':
        if (change.updates && change.index !== undefined && change.index >= 0 && change.index < newEntries.length) {
          newEntries[change.index] = { ...newEntries[change.index], ...change.updates };
        }
        break;

      case 'delete':
        if (change.index !== undefined && change.index >= 0 && change.index < newEntries.length) {
          newEntries.splice(change.index, 1);
        }
        break;

      case 'merge':
        if (change.indices && change.entry) {
          // Remove source entries (in reverse order to preserve indices)
          const sortedIndices = [...change.indices].sort((a, b) => b - a);
          for (const index of sortedIndices) {
            if (index >= 0 && index < newEntries.length) {
              newEntries.splice(index, 1);
            }
          }
          // Add merged entry
          newEntries.push(change.entry);
        }
        break;
    }

    return newEntries;
  }

  /**
   * Reset the conversation.
   */
  reset(lorebookName: string, entryCount: number): void {
    this.initialize(lorebookName, entryCount);
  }
}
