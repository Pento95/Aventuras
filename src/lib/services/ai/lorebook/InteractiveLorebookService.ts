import type { OpenAIProvider } from '../core/OpenAIProvider';
import type {
  Tool,
  ToolCall,
  AgenticMessage,
} from '../core/types';
import type { VaultLorebookEntry, EntryType, EntryInjectionMode } from '$lib/types';
import { settings, getDefaultInteractiveLorebookSettings, type InteractiveLorebookSettings } from '$lib/stores/settings.svelte';
import { buildExtraBody } from '../core/requestOverrides';
import { promptService } from '$lib/services/prompts';
import { tryParseJsonWithHealing } from '../utils/jsonHealing';
import { createLogger } from '../core/config';

// Event types for progress updates
export type StreamEvent =
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCall: ToolCallDisplay }
  | { type: 'thinking' }
  | { type: 'message'; message: ChatMessage } // Intermediate message (after tool calls)
  | { type: 'done'; result: SendMessageResult }
  | { type: 'error'; error: string };

const log = createLogger('InteractiveLorebook');

// Tool definitions for Interactive Lorebook Creation
const INTERACTIVE_LOREBOOK_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'list_entries',
      description: 'List all entries in the lorebook, optionally filtered by type',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Optional filter by entry type',
            enum: ['character', 'location', 'item', 'faction', 'concept', 'event'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entry',
      description: 'Get full details of a specific entry by index',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'The index of the entry (0-based)',
          },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_entry',
      description: 'Create a new lorebook entry. Requires user approval before being added.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the entry',
          },
          type: {
            type: 'string',
            description: 'Type of entry',
            enum: ['character', 'location', 'item', 'faction', 'concept', 'event'],
          },
          description: {
            type: 'string',
            description: 'Description of the entry',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords that trigger this entry (optional)',
          },
          injectionMode: {
            type: 'string',
            description: 'When to inject this entry into context',
            enum: ['always', 'keyword', 'relevant', 'never'],
          },
          priority: {
            type: 'number',
            description: 'Priority for injection ordering (higher = more important)',
          },
          group: {
            type: 'string',
            description: 'Optional group to organize entries',
          },
        },
        required: ['name', 'type', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_entry',
      description: 'Update an existing lorebook entry. Requires user approval before changes are applied.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'The index of the entry to update (0-based)',
          },
          name: {
            type: 'string',
            description: 'New name (optional)',
          },
          type: {
            type: 'string',
            description: 'New type (optional)',
            enum: ['character', 'location', 'item', 'faction', 'concept', 'event'],
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'New keywords (optional)',
          },
          injectionMode: {
            type: 'string',
            description: 'New injection mode (optional)',
            enum: ['always', 'keyword', 'relevant', 'never'],
          },
          priority: {
            type: 'number',
            description: 'New priority (optional)',
          },
          disabled: {
            type: 'boolean',
            description: 'Whether the entry is disabled (optional)',
          },
          group: {
            type: 'string',
            description: 'New group (optional, null to remove)',
          },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_entry',
      description: 'Delete an entry from the lorebook. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'The index of the entry to delete (0-based)',
          },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'merge_entries',
      description: 'Merge multiple entries into one. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          indices: {
            type: 'array',
            items: { type: 'number' },
            description: 'Indices of entries to merge (0-based)',
          },
          merged_name: {
            type: 'string',
            description: 'Name for the merged entry',
          },
          merged_type: {
            type: 'string',
            description: 'Type for the merged entry',
            enum: ['character', 'location', 'item', 'faction', 'concept', 'event'],
          },
          merged_description: {
            type: 'string',
            description: 'Description for the merged entry',
          },
          merged_keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords for the merged entry (optional)',
          },
        },
        required: ['indices', 'merged_name', 'merged_type', 'merged_description'],
      },
    },
  },
];

// Types for pending changes and chat messages
export interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete' | 'merge';
  toolCallId: string;
  entry?: VaultLorebookEntry;           // For create: the new entry
  index?: number;                        // For update/delete: target index
  indices?: number[];                    // For merge: source indices
  updates?: Partial<VaultLorebookEntry>; // For update: the changes
  previous?: VaultLorebookEntry;         // For update: original entry (for diff)
  previousEntries?: VaultLorebookEntry[]; // For merge: original entries
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
  isGreeting?: boolean; // Display-only message, not sent to API
}

export interface SendMessageResult {
  response: string;
  pendingChanges: PendingChange[];
  toolCalls: ToolCallDisplay[];
  reasoning?: string;
}

export class InteractiveLorebookService {
  private provider: OpenAIProvider;
  private messages: AgenticMessage[] = [];
  private lorebookName: string = '';
  private initialized: boolean = false;
  private presetId: string;

  constructor(provider: OpenAIProvider, presetId: string) {
    this.provider = provider;
    this.presetId = presetId;
  }

  /**
   * Get the preset configuration.
   */
  private get preset() {
    return settings.getPresetConfig(this.presetId);
  }

  /**
   * Get the interactive lorebook settings from the settings store.
   * Falls back to defaults if not yet initialized (for existing users).
   */
  private getSettings(): InteractiveLorebookSettings {
    return settings.systemServicesSettings.interactiveLorebook ?? getDefaultInteractiveLorebookSettings();
  }

  /**
   * Initialize the conversation with the system prompt from the prompt service.
   */
  initialize(lorebookName: string, entryCount: number): void {
    this.lorebookName = lorebookName;
    this.initialized = true;

    // Use the prompt service to render the system prompt with placeholders
    // Provide minimal context - service prompts don't use story-specific macros
    const systemPrompt = promptService.renderPrompt(
      'interactive-lorebook',
      { mode: 'adventure', pov: 'second', tense: 'present', protagonistName: '' },
      { lorebookName, entryCount: String(entryCount) }
    );

    this.messages = [
      { role: 'system', content: systemPrompt },
    ];

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
   * Implements an agentic loop that continues until the AI responds without tool calls.
   * Returns pending changes that need approval before being applied.
   */
  async sendMessage(
    userMessage: string,
    entries: VaultLorebookEntry[]
  ): Promise<SendMessageResult> {
    if (!this.initialized) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    // Add user message to conversation
    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    log('Sending message', { userMessage, entriesCount: entries.length });

    const pendingChanges: PendingChange[] = [];
    const toolCalls: ToolCallDisplay[] = [];
    let responseContent = '';
    let reasoning: string | undefined;

    const MAX_ITERATIONS = 10;
    let iterations = 0;
    let continueLoop = true;

    try {
      // Agentic loop - continue until AI responds without tool calls
      while (continueLoop && iterations < MAX_ITERATIONS) {
        iterations++;
        log(`Agentic loop iteration ${iterations}`);

        const response = await this.provider.generateWithTools({
          messages: this.messages,
          model: this.preset.model,
          temperature: this.preset.temperature,
          maxTokens: this.preset.maxTokens,
          tools: INTERACTIVE_LOREBOOK_TOOLS,
          tool_choice: 'auto',
          extraBody: buildExtraBody({
            manualMode: false,
            manualBody: this.preset.manualBody,
            reasoningEffort: this.preset.reasoningEffort,
            providerOnly: this.preset.providerOnly,
          }),
        });

        log('Received response', {
          iteration: iterations,
          hasContent: !!response.content,
          hasToolCalls: !!response.tool_calls,
          toolCallCount: response.tool_calls?.length ?? 0,
          finishReason: response.finish_reason,
          hasReasoning: !!response.reasoning,
        });

        // Capture reasoning from the final response
        reasoning = response.reasoning;

        // Process tool calls if present
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Add assistant response with tool calls to messages
          this.messages.push({
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls,
            reasoning: response.reasoning ?? null,
            reasoning_details: response.reasoning_details,
          });

          // Process each tool call
          for (const toolCall of response.tool_calls) {
            const { result, pendingChange, parsedArgs } = this.processToolCall(toolCall, entries);

            // Track tool call for display
            const toolCallDisplay: ToolCallDisplay = {
              id: toolCall.id,
              name: toolCall.function.name,
              args: parsedArgs,
              result,
              pendingChange,
            };
            toolCalls.push(toolCallDisplay);

            if (pendingChange) {
              pendingChanges.push(pendingChange);
            }

            // Add tool result to messages
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }

          // Continue the loop to let the AI respond to tool results
          continueLoop = true;
        } else {
          // No tool calls - this is the final response
          responseContent = response.content ?? '';

          // Add final assistant response to messages
          this.messages.push({
            role: 'assistant',
            content: responseContent,
            reasoning: response.reasoning ?? null,
            reasoning_details: response.reasoning_details,
          });

          // Exit the loop
          continueLoop = false;
        }
      }

      if (iterations >= MAX_ITERATIONS) {
        log('Warning: Max iterations reached in agentic loop');
        responseContent = responseContent || 'I apologize, but I seem to be having trouble completing my response. Please try again.';
      }

    } catch (error) {
      log('Error in agentic loop:', error);
      throw error;
    }

    return {
      response: responseContent,
      pendingChanges,
      toolCalls,
      reasoning,
    };
  }

  /**
   * Async version of sendMessage that yields progress events.
   * Uses non-streaming API calls but yields events for UI updates.
   * Yields separate 'message' events for each iteration that has tool calls.
   */
  async *sendMessageStreaming(
    userMessage: string,
    entries: VaultLorebookEntry[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    if (!this.initialized) {
      yield { type: 'error', error: 'Service not initialized. Call initialize() first.' };
      return;
    }

    // Add user message to conversation
    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    log('Sending message', { userMessage, entriesCount: entries.length });

    // Track all pending changes across iterations (for final result)
    const allPendingChanges: PendingChange[] = [];

    const MAX_ITERATIONS = 10;
    let iterations = 0;
    let continueLoop = true;
    let finalResponseContent = '';
    let finalReasoning: string | undefined;

    try {
      // Agentic loop - continue until AI responds without tool calls
      while (continueLoop && iterations < MAX_ITERATIONS) {
        // Check for abort before each iteration
        if (signal?.aborted) {
          log('Request aborted by user');
          yield { type: 'error', error: 'Request cancelled' };
          return;
        }

        iterations++;
        log(`Agentic loop iteration ${iterations}`);

        // Signal that we're thinking
        yield { type: 'thinking' };

        // Track this iteration's data separately
        const iterationToolCalls: ToolCallDisplay[] = [];
        const iterationPendingChanges: PendingChange[] = [];

        // Use non-streaming generateWithTools for clean reasoning
        const response = await this.provider.generateWithTools({
          messages: this.messages,
          model: this.preset.model,
          temperature: this.preset.temperature,
          maxTokens: this.preset.maxTokens,
          tools: INTERACTIVE_LOREBOOK_TOOLS,
          tool_choice: 'auto',
          extraBody: buildExtraBody({
            manualMode: false,
            manualBody: this.preset.manualBody,
            reasoningEffort: this.preset.reasoningEffort,
            providerOnly: this.preset.providerOnly,
          }),
          signal,
        });

        log('Received response', {
          iteration: iterations,
          hasContent: !!response.content,
          hasToolCalls: !!response.tool_calls,
          toolCallCount: response.tool_calls?.length ?? 0,
          finishReason: response.finish_reason,
          hasReasoning: !!response.reasoning,
        });

        // Process tool calls if present
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Add assistant response with tool calls to messages
          this.messages.push({
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls,
            reasoning: response.reasoning ?? null,
            reasoning_details: response.reasoning_details,
          });

          // Process each tool call
          for (const toolCall of response.tool_calls) {
            const { result, pendingChange, parsedArgs } = this.processToolCall(toolCall, entries);

            // Yield tool start event
            yield { type: 'tool_start', toolCallId: toolCall.id, toolName: toolCall.function.name, args: parsedArgs };

            // Track tool call for display
            const toolCallDisplay: ToolCallDisplay = {
              id: toolCall.id,
              name: toolCall.function.name,
              args: parsedArgs,
              result,
              pendingChange,
            };
            iterationToolCalls.push(toolCallDisplay);

            if (pendingChange) {
              iterationPendingChanges.push(pendingChange);
              allPendingChanges.push(pendingChange);
            }

            // Add tool result to messages
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });

            // Yield tool end event
            yield { type: 'tool_end', toolCall: toolCallDisplay };
          }

          // Yield an intermediate message for this iteration
          const iterationMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response.content ?? '',
            timestamp: Date.now(),
            toolCalls: iterationToolCalls,
            pendingChanges: iterationPendingChanges,
            reasoning: response.reasoning,
          };
          yield { type: 'message', message: iterationMessage };

          // Continue the loop
          continueLoop = true;
        } else {
          // No tool calls - this is the final response
          // Add the message to context
          this.messages.push({
            role: 'assistant',
            content: response.content ?? '',
            reasoning: response.reasoning ?? null,
            reasoning_details: response.reasoning_details,
          });

          finalResponseContent = response.content ?? '';
          finalReasoning = response.reasoning;
          continueLoop = false;
        }
      }

      if (iterations >= MAX_ITERATIONS) {
        log('Warning: Max iterations reached in agentic loop');
        finalResponseContent = finalResponseContent || 'I apologize, but I seem to be having trouble completing my response. Please try again.';
      }

    } catch (error) {
      log('Error in agentic loop:', error);
      yield { type: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
      return;
    }

    // Yield final result (the last message without tool calls)
    yield {
      type: 'done',
      result: {
        response: finalResponseContent,
        pendingChanges: [],
        toolCalls: [], // Tool calls were in intermediate messages
        reasoning: finalReasoning,
      },
    };
  }

  /**
   * Process a tool call and return the result + any pending change.
   */
  private processToolCall(
    toolCall: ToolCall,
    entries: VaultLorebookEntry[]
  ): { result: string; pendingChange?: PendingChange; parsedArgs: Record<string, unknown> } {
    const args = tryParseJsonWithHealing<Record<string, unknown>>(toolCall.function.arguments);
    if (!args) {
      log('Failed to parse tool call arguments:', toolCall.function.arguments);
      return {
        result: JSON.stringify({ error: 'Invalid tool call arguments - malformed JSON' }),
        parsedArgs: {},
      };
    }
    log('Processing tool call:', toolCall.function.name, args);

    switch (toolCall.function.name) {
      case 'list_entries': {
        const typeFilter = args.type as EntryType | undefined;
        const filtered = typeFilter
          ? entries.filter(e => e.type === typeFilter)
          : entries;

        const result = filtered.map((e, i) => ({
          index: entries.indexOf(e),
          name: e.name,
          type: e.type,
          keywords: e.keywords,
          disabled: e.disabled,
        }));

        return { result: JSON.stringify(result), parsedArgs: args };
      }

      case 'get_entry': {
        const index = this.parseIndexArg(args.index);
        if (index === null) {
          return {
            result: JSON.stringify({ error: `Invalid index ${this.formatArg(args.index)}. Expected an integer.` }),
            parsedArgs: args,
          };
        }
        if (index < 0 || index >= entries.length) {
          return { result: JSON.stringify({ error: `Invalid index ${index}. Valid range: 0-${entries.length - 1}` }), parsedArgs: args };
        }
        return { result: JSON.stringify(entries[index]), parsedArgs: args };
      }

      case 'create_entry': {
        const newEntry: VaultLorebookEntry = {
          name: args.name as string,
          type: args.type as EntryType,
          description: args.description as string,
          keywords: (args.keywords as string[]) ?? [],
          injectionMode: (args.injectionMode as EntryInjectionMode) ?? 'keyword',
          priority: (args.priority as number) ?? 10,
          disabled: false,
          group: (args.group as string | null) ?? null,
        };

        const pendingChange: PendingChange = {
          id: crypto.randomUUID(),
          type: 'create',
          toolCallId: toolCall.id,
          entry: newEntry,
          status: 'pending',
        };

        return {
          result: JSON.stringify({
            status: 'pending_approval',
            message: `Creating entry "${newEntry.name}" requires user approval.`,
            entry: newEntry,
          }),
          pendingChange,
          parsedArgs: args,
        };
      }

      case 'update_entry': {
        const index = this.parseIndexArg(args.index);
        if (index === null) {
          return {
            result: JSON.stringify({ error: `Invalid index ${this.formatArg(args.index)}. Expected an integer.` }),
            parsedArgs: args,
          };
        }
        if (index < 0 || index >= entries.length) {
          return { result: JSON.stringify({ error: `Invalid index ${index}. Valid range: 0-${entries.length - 1}` }), parsedArgs: args };
        }

        const previous = entries[index];
        const updates: Partial<VaultLorebookEntry> = {};

        if (args.name !== undefined) updates.name = args.name as string;
        if (args.type !== undefined) updates.type = args.type as EntryType;
        if (args.description !== undefined) updates.description = args.description as string;
        if (args.keywords !== undefined) updates.keywords = args.keywords as string[];
        if (args.injectionMode !== undefined) updates.injectionMode = args.injectionMode as EntryInjectionMode;
        if (args.priority !== undefined) updates.priority = args.priority as number;
        if (args.disabled !== undefined) updates.disabled = args.disabled as boolean;
        if (args.group !== undefined) updates.group = args.group as string | null;

        const pendingChange: PendingChange = {
          id: crypto.randomUUID(),
          type: 'update',
          toolCallId: toolCall.id,
          index,
          updates,
          previous: { ...previous },
          status: 'pending',
        };

        return {
          result: JSON.stringify({
            status: 'pending_approval',
            message: `Updating entry "${previous.name}" requires user approval.`,
            updates,
          }),
          pendingChange,
          parsedArgs: args,
        };
      }

      case 'delete_entry': {
        const index = this.parseIndexArg(args.index);
        if (index === null) {
          return {
            result: JSON.stringify({ error: `Invalid index ${this.formatArg(args.index)}. Expected an integer.` }),
            parsedArgs: args,
          };
        }
        if (index < 0 || index >= entries.length) {
          return { result: JSON.stringify({ error: `Invalid index ${index}. Valid range: 0-${entries.length - 1}` }), parsedArgs: args };
        }

        const entry = entries[index];
        const pendingChange: PendingChange = {
          id: crypto.randomUUID(),
          type: 'delete',
          toolCallId: toolCall.id,
          index,
          previous: { ...entry },
          status: 'pending',
        };

        return {
          result: JSON.stringify({
            status: 'pending_approval',
            message: `Deleting entry "${entry.name}" requires user approval.`,
            entry: entry.name,
          }),
          pendingChange,
          parsedArgs: args,
        };
      }

      case 'merge_entries': {
        const indices = this.parseIndicesArg(args.indices);
        if (!indices) {
          return {
            result: JSON.stringify({
              error: `Invalid indices ${this.formatArg(args.indices)}. Expected an array of integers.`,
            }),
            parsedArgs: args,
          };
        }

        // Validate all indices
        for (const index of indices) {
          if (index < 0 || index >= entries.length) {
            return { result: JSON.stringify({ error: `Invalid index ${index}. Valid range: 0-${entries.length - 1}` }), parsedArgs: args };
          }
        }

        if (indices.length < 2) {
          return { result: JSON.stringify({ error: 'Need at least 2 entries to merge' }), parsedArgs: args };
        }

        const previousEntries = indices.map(i => ({ ...entries[i] }));

        const mergedEntry: VaultLorebookEntry = {
          name: args.merged_name as string,
          type: args.merged_type as EntryType,
          description: args.merged_description as string,
          keywords: (args.merged_keywords as string[]) ?? [],
          injectionMode: 'keyword',
          priority: Math.max(...previousEntries.map(e => e.priority)),
          disabled: false,
          group: previousEntries[0].group,
        };

        const pendingChange: PendingChange = {
          id: crypto.randomUUID(),
          type: 'merge',
          toolCallId: toolCall.id,
          indices,
          entry: mergedEntry,
          previousEntries,
          status: 'pending',
        };

        return {
          result: JSON.stringify({
            status: 'pending_approval',
            message: `Merging ${indices.length} entries into "${mergedEntry.name}" requires user approval.`,
            mergedEntry,
            sourceEntries: previousEntries.map(e => e.name),
          }),
          pendingChange,
          parsedArgs: args,
        };
      }

      default:
        return { result: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }), parsedArgs: args };
    }
  }

  /**
   * Handle approval or rejection of a pending change.
   * This adds a message to the conversation indicating the result.
   */
  handleApproval(change: PendingChange, approved: boolean, rejectionReason?: string): void {
    const message = approved
      ? `Change approved: ${this.describeChange(change)}`
      : `Change rejected: ${this.describeChange(change)}${rejectionReason ? `. Reason: ${rejectionReason}` : ''}`;

    // Find and update the tool result message for this change
    const toolResultIndex = this.messages.findIndex(
      m => m.role === 'tool' && (m as { tool_call_id: string }).tool_call_id === change.toolCallId
    );

    if (toolResultIndex !== -1) {
      // Update the tool result with the approval/rejection status
      const originalResult = JSON.parse((this.messages[toolResultIndex] as { content: string }).content);
      (this.messages[toolResultIndex] as { content: string }).content = JSON.stringify({
        ...originalResult,
        status: approved ? 'approved' : 'rejected',
        message: approved ? 'Change applied successfully.' : `Change rejected. ${rejectionReason ?? 'User declined the change.'}`,
      });
    }

    log('Handled approval', { changeId: change.id, approved, message });
  }

  /**
   * Describe a change for display in messages.
   */
  private describeChange(change: PendingChange): string {
    switch (change.type) {
      case 'create':
        return `Created entry "${change.entry?.name}"`;
      case 'update':
        return `Updated entry "${change.previous?.name}"`;
      case 'delete':
        return `Deleted entry "${change.previous?.name}"`;
      case 'merge':
        return `Merged ${change.indices?.length} entries into "${change.entry?.name}"`;
      default:
        return 'Unknown change';
    }
  }

  /**
   * Apply a pending change to the entries array.
   * Returns the modified entries array.
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
        if (change.updates) {
          const targetIndex = this.findEntryIndex(newEntries, change.previous, change.index);
          if (targetIndex !== null) {
            newEntries[targetIndex] = {
              ...newEntries[targetIndex],
              ...change.updates,
            };
          } else {
            log('Update skipped: entry not found for pending change', { changeId: change.id });
          }
        }
        break;

      case 'delete':
        {
          const targetIndex = this.findEntryIndex(newEntries, change.previous, change.index);
          if (targetIndex !== null) {
            newEntries.splice(targetIndex, 1);
          } else {
            log('Delete skipped: entry not found for pending change', { changeId: change.id });
          }
        }
        break;

      case 'merge':
        if (change.indices && change.entry) {
          const indicesToRemove = new Set<number>();

          if (change.previousEntries && change.previousEntries.length > 0) {
            for (const previousEntry of change.previousEntries) {
              const targetIndex = this.findEntryIndex(newEntries, previousEntry);
              if (targetIndex !== null) {
                indicesToRemove.add(targetIndex);
              }
            }
          }

          if (indicesToRemove.size === 0) {
            for (const index of change.indices) {
              if (index >= 0 && index < newEntries.length) {
                indicesToRemove.add(index);
              }
            }
          }

          // Remove source entries (in reverse order to preserve indices)
          const sortedIndices = [...indicesToRemove].sort((a, b) => b - a);
          for (const index of sortedIndices) {
            newEntries.splice(index, 1);
          }
          // Add merged entry
          newEntries.push(change.entry);
        }
        break;
    }

    return newEntries;
  }

  private findEntryIndex(
    entries: VaultLorebookEntry[],
    target?: VaultLorebookEntry,
    fallbackIndex?: number
  ): number | null {
    if (target) {
      const exactIndex = entries.findIndex(entry => this.entriesEqual(entry, target));
      if (exactIndex !== -1) {
        return exactIndex;
      }

      const identityIndex = entries.findIndex(entry => this.entriesMatchIdentity(entry, target));
      if (identityIndex !== -1) {
        return identityIndex;
      }
    }

    if (fallbackIndex !== undefined && fallbackIndex >= 0 && fallbackIndex < entries.length) {
      if (!target || this.entriesMatchIdentity(entries[fallbackIndex], target)) {
        return fallbackIndex;
      }
    }

    return null;
  }

  private entriesEqual(a: VaultLorebookEntry, b: VaultLorebookEntry): boolean {
    if (a === b) {
      return true;
    }

    if (
      a.name !== b.name ||
      a.type !== b.type ||
      a.description !== b.description ||
      a.injectionMode !== b.injectionMode ||
      a.priority !== b.priority ||
      a.disabled !== b.disabled ||
      a.group !== b.group
    ) {
      return false;
    }

    if (a.keywords.length !== b.keywords.length) {
      return false;
    }

    for (let i = 0; i < a.keywords.length; i++) {
      if (a.keywords[i] !== b.keywords[i]) {
        return false;
      }
    }

    return true;
  }

  private entriesMatchIdentity(a: VaultLorebookEntry, b: VaultLorebookEntry): boolean {
    return a.name === b.name && a.type === b.type && a.group === b.group;
  }

  private parseIndexArg(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private parseIndicesArg(value: unknown): number[] | null {
    if (!Array.isArray(value)) {
      return null;
    }
    const parsed: number[] = [];
    for (const item of value) {
      const index = this.parseIndexArg(item);
      if (index === null) {
        return null;
      }
      parsed.push(index);
    }
    return parsed;
  }

  private formatArg(value: unknown): string {
    if (value === undefined) {
      return 'undefined';
    }
    try {
      const json = JSON.stringify(value);
      return json ?? String(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Get the conversation history for display.
   */
  getMessages(): AgenticMessage[] {
    return this.messages;
  }

  /**
   * Reset the conversation (clear all messages except system prompt).
   */
  reset(lorebookName: string, entryCount: number): void {
    this.initialize(lorebookName, entryCount);
  }
}
