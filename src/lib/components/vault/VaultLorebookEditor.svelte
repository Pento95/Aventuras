<script lang="ts">
  import type { VaultLorebook, VaultLorebookEntry, EntryType, EntryInjectionMode } from '$lib/types';
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte';
  import {
    X, Plus, Search, Trash2, Save, ArrowLeft,
    Users, MapPin, Box, Flag, Brain, Calendar,
    MoreVertical, AlertCircle, Eye, EyeOff, Bot
  } from 'lucide-svelte';
  import { fade, slide } from 'svelte/transition';
  import InteractiveLorebookChat from './InteractiveLorebookChat.svelte';
  import TagInput from '$lib/components/tags/TagInput.svelte';
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal';

  interface Props {
    lorebook: VaultLorebook;
    onClose: () => void;
  }

  let { lorebook, onClose }: Props = $props();

  // Local state for editing
  let name = $state(lorebook.name);
  let description = $state(lorebook.description ?? '');
  let tags = $state<string[]>([...lorebook.tags]);
  let entries = $state<VaultLorebookEntry[]>(JSON.parse(JSON.stringify(lorebook.entries))); // Deep copy
  
  // UI State
  let searchQuery = $state('');
  let selectedIndex = $state<number | null>(null);
  let showDeleteConfirm = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state<'editor' | 'settings'>('editor');
  let showInteractiveChat = $state(false);

  // Filtered entries
  const filteredEntries = $derived.by(() => {
    if (!searchQuery.trim()) return entries.map((e, i) => ({ entry: e, index: i }));
    const q = searchQuery.toLowerCase();
    return entries
      .map((e, i) => ({ entry: e, index: i }))
      .filter(({ entry }) => 
        entry.name.toLowerCase().includes(q) || 
        entry.keywords.some(k => k.toLowerCase().includes(q))
      );
  });

  const selectedEntry = $derived(selectedIndex !== null ? entries[selectedIndex] : null);

  // Type options
  const entryTypes: EntryType[] = ['character', 'location', 'item', 'faction', 'concept', 'event'];
  const injectionModes: EntryInjectionMode[] = ['always', 'keyword', 'relevant', 'never'];

  const typeIcons: Record<EntryType, any> = {
    character: Users,
    location: MapPin,
    item: Box,
    faction: Flag,
    concept: Brain,
    event: Calendar,
  };

  function handleSave() {
    if (!name.trim()) {
      error = 'Lorebook name is required';
      return;
    }

    saving = true;
    error = null;

    // Update metadata entry breakdown
    const breakdown: Record<EntryType, number> = {
      character: 0, location: 0, item: 0, faction: 0, concept: 0, event: 0
    };
    entries.forEach(e => {
      if (breakdown[e.type] !== undefined) breakdown[e.type]++;
    });

    lorebookVault.update(lorebook.id, {
      name,
      description: description || null,
      entries,
      tags,
      metadata: {
        ...lorebook.metadata,
        format: lorebook.metadata?.format ?? 'aventura',
        totalEntries: entries.length,
        entryBreakdown: breakdown
      }
    }).then(() => {
      saving = false;
    }).catch(e => {
      error = e instanceof Error ? e.message : 'Failed to save lorebook';
      saving = false;
    });
  }

  // Silent save function for auto-saving (doesn't close editor)
  async function handleSilentSave(): Promise<void> {
    if (!name.trim()) {
      throw new Error('Lorebook name is required');
    }

    // Update metadata entry breakdown
    const breakdown: Record<EntryType, number> = {
      character: 0, location: 0, item: 0, faction: 0, concept: 0, event: 0
    };
    entries.forEach(e => {
      if (breakdown[e.type] !== undefined) breakdown[e.type]++;
    });

    await lorebookVault.update(lorebook.id, {
      name,
      description: description || null,
      entries,
      tags,
      metadata: {
        ...lorebook.metadata,
        format: lorebook.metadata?.format ?? 'aventura',
        totalEntries: entries.length,
        entryBreakdown: breakdown
      }
    });
  }

  function handleAddEntry() {
    const newEntry: VaultLorebookEntry = {
      name: 'New Entry',
      type: 'character',
      description: '',
      keywords: [],
      injectionMode: 'keyword',
      priority: 10,
      disabled: false,
      group: null
    };
    entries.push(newEntry);
    entries = entries; // Trigger update
    selectedIndex = entries.length - 1;
    activeTab = 'editor';
  }

  function handleDeleteEntry(index: number) {
    entries.splice(index, 1);
    entries = entries; // Trigger update
    if (selectedIndex === index) {
      selectedIndex = null;
    } else if (selectedIndex !== null && selectedIndex > index) {
      selectedIndex--;
    }
  }

  function handleDuplicateEntry(index: number) {
    const entry = entries[index];
    const newEntry = JSON.parse(JSON.stringify(entry));
    newEntry.name = `${newEntry.name} (Copy)`;
    entries.push(newEntry);
    entries = entries;
    selectedIndex = entries.length - 1;
  }
</script>

<ResponsiveModal.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
  <ResponsiveModal.Content class="sm:max-w-6xl w-full sm:h-[90vh] flex flex-col overflow-hidden sm:rounded-lg p-0 bg-surface-900 shadow-xl border border-surface-700">
    
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 bg-surface-800 px-3 sm:px-6 py-3 sm:py-4 gap-2">
      <div class="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        <div class="flex flex-col min-w-0 flex-1">
          <input
            type="text"
            bind:value={name}
            class="bg-transparent text-base sm:text-lg font-bold text-surface-100 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 rounded px-2 -ml-2 hover:bg-surface-700/50 transition-colors w-full"
            placeholder="Lorebook Name"
          />
          <div class="text-xs text-surface-400 px-2 -ml-2">
            {entries.length} entries
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1 sm:gap-3 flex-shrink-0">
        {#if error}
          <div class="hidden sm:flex items-center gap-2 text-red-400 text-sm mr-4 bg-red-500/10 px-3 py-1.5 rounded-full">
            <AlertCircle class="h-4 w-4" />
            {error}
          </div>
        {/if}

        <!-- Settings button - icon only on mobile -->
        <button
          class="flex items-center justify-center gap-2 rounded-lg bg-surface-700 p-2 sm:px-4 sm:py-2 text-sm font-medium text-surface-200 hover:bg-surface-600 hover:text-white"
          onclick={() => activeTab = activeTab === 'settings' ? 'editor' : 'settings'}
          title={activeTab === 'settings' ? 'Close Settings' : 'Settings'}
        >
          <MoreVertical class="h-4 w-4 sm:hidden" />
          <span class="hidden sm:inline">{activeTab === 'settings' ? 'Close Settings' : 'Settings'}</span>
        </button>

        <!-- AI button - icon only on mobile -->
        {#if name.trim()}
          <button
            class="flex items-center justify-center gap-2 rounded-lg bg-purple-600 p-2 sm:px-4 sm:py-2 text-sm font-medium text-white hover:bg-purple-500"
            onclick={() => showInteractiveChat = !showInteractiveChat}
            title={showInteractiveChat ? 'Close Chat' : 'Expand with AI'}
          >
            <Bot class="h-4 w-4" />
            <span class="hidden sm:inline">{showInteractiveChat ? 'Close Chat' : 'Expand with AI'}</span>
          </button>
        {/if}

        <!-- Save button - icon only on mobile -->
        <button
          class="flex items-center justify-center gap-2 rounded-lg bg-accent-600 p-2 sm:px-4 sm:py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
          onclick={handleSave}
          disabled={saving}
          title="Save Changes"
        >
          {#if saving}
            <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
          {:else}
            <Save class="h-4 w-4" />
          {/if}
          <span class="hidden sm:inline">Save Changes</span>
        </button>

        <div class="h-6 w-px bg-surface-700 mx-0.5 sm:mx-1 hidden sm:block"></div>

        <button
          class="rounded-lg p-2 text-surface-400 hover:bg-surface-700 hover:text-surface-200"
          onclick={onClose}
          title="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex flex-1 overflow-hidden">
      
      {#if activeTab === 'settings'}
        <!-- Global Settings Panel -->
        <div class="w-full p-4 sm:p-8 overflow-y-auto" in:fade={{ duration: 150 }}>
          <div class="max-w-2xl mx-auto space-y-4 sm:space-y-6">
            <h3 class="text-lg sm:text-xl font-medium text-surface-100 mb-4 sm:mb-6">Lorebook Settings</h3>
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-surface-300 mb-1">Description</label>
                <textarea
                  bind:value={description}
                  rows="4"
                  class="w-full rounded-lg border border-surface-600 bg-surface-800 px-4 py-3 text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none"
                  placeholder="Describe what this lorebook contains..."
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium text-surface-300 mb-1">Tags</label>
                <TagInput
                  value={tags}
                  type="lorebook"
                  onChange={(newTags) => tags = newTags}
                  placeholder="Add tags..."
                />
              </div>

              <div class="rounded-lg bg-surface-800 p-4 border border-surface-700">
                <h4 class="text-sm font-medium text-surface-200 mb-2">Statistics</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div class="flex justify-between p-2 rounded bg-surface-700/50">
                    <span class="text-surface-400">Total Entries</span>
                    <span class="text-surface-100">{entries.length}</span>
                  </div>
                  <div class="flex justify-between p-2 rounded bg-surface-700/50">
                    <span class="text-surface-400">Active Entries</span>
                    <span class="text-surface-100">{entries.filter(e => !e.disabled).length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {:else}
        <!-- Split View: List + Editor -->

        <!-- Sidebar (List) - Full width on mobile when no selection, fixed width on desktop -->
        <div class="w-full sm:w-80 flex flex-col border-r border-surface-700 bg-surface-800/50 {selectedIndex !== null ? 'hidden sm:flex' : 'flex'}">
          <!-- Search -->
          <div class="p-3 sm:p-4 border-b border-surface-700 space-y-3">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search entries..."
                class="w-full rounded-lg border border-surface-600 bg-surface-700 pl-9 pr-3 py-2.5 sm:py-2 text-base sm:text-sm text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none"
              />
            </div>
            <button
              class="w-full flex items-center justify-center gap-2 rounded-lg bg-surface-700 py-3 sm:py-2 text-sm font-medium text-surface-200 hover:bg-surface-600 hover:text-white active:bg-surface-600 transition-colors"
              onclick={handleAddEntry}
            >
              <Plus class="h-4 w-4" />
              Add New Entry
            </button>
          </div>

          <!-- List -->
          <div class="flex-1 overflow-y-auto p-2 sm:p-2 space-y-1">
            {#if filteredEntries.length === 0}
              <div class="p-4 text-center text-sm text-surface-500">
                {#if searchQuery}
                  No matches found
                {:else}
                  No entries yet
                {/if}
              </div>
            {:else}
              {#each filteredEntries as { entry, index }}
                {@const Icon = typeIcons[entry.type]}
                <button
                  class="w-full flex items-center gap-3 rounded-lg px-3 py-3 sm:py-2.5 text-left transition-colors active:bg-surface-600 {selectedIndex === index ? 'bg-accent-500/20 text-accent-100 ring-1 ring-accent-500/50' : 'text-surface-300 hover:bg-surface-700 hover:text-surface-100'}"
                  onclick={() => selectedIndex = index}
                >
                  <div class="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md bg-surface-800 flex-shrink-0 {selectedIndex === index ? 'bg-accent-500/30' : ''}">
                    <Icon class="h-5 w-5 sm:h-4 sm:w-4" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="truncate font-medium">{entry.name}</div>
                    <div class="flex items-center gap-2 text-xs opacity-70">
                      <span class="capitalize">{entry.type}</span>
                      {#if entry.disabled}
                        <span class="flex items-center gap-0.5 text-surface-500">
                           • <EyeOff class="h-3 w-3" /> Disabled
                        </span>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Editor Area - Hidden on mobile when no selection -->
        <div class="flex-1 flex flex-col overflow-hidden bg-surface-900 {selectedIndex === null ? 'hidden sm:flex' : 'flex'}">
          {#if selectedEntry !== null && selectedIndex !== null}
            <!-- Entry Editor Header -->
            <div class="flex items-center justify-between border-b border-surface-700 px-3 sm:px-6 py-3 sm:py-4 bg-surface-800/30">
              <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <!-- Back button on mobile -->
                <button
                  class="sm:hidden p-2 -ml-1 text-surface-400 hover:text-surface-100 rounded-lg hover:bg-surface-700"
                  onclick={() => selectedIndex = null}
                  title="Back to list"
                >
                  <ArrowLeft class="h-5 w-5" />
                </button>
                <input
                  type="text"
                  bind:value={selectedEntry.name}
                  class="bg-transparent text-lg sm:text-xl font-bold text-surface-100 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 rounded px-2 -ml-2 sm:ml-0 min-w-0 flex-1"
                  placeholder="Entry Name"
                />
              </div>
              <div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  class="p-2 text-surface-400 hover:text-surface-100 rounded-lg hover:bg-surface-700"
                  onclick={() => handleDuplicateEntry(selectedIndex!)}
                  title="Duplicate Entry"
                >
                  <span class="text-xs font-medium hidden sm:inline">Duplicate</span>
                  <Plus class="h-4 w-4 sm:hidden" />
                </button>
                <button
                  class="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10"
                  onclick={() => handleDeleteEntry(selectedIndex!)}
                  title="Delete Entry"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- Entry Editor Form -->
            <div class="flex-1 overflow-y-auto p-4 sm:p-6">
              <div class="max-w-3xl mx-auto space-y-4 sm:space-y-6">
                
                <!-- Basic Info Grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <!-- Type -->
                  <div>
                    <label class="block text-sm font-medium text-surface-300 mb-1">Entry Type</label>
                    <div class="relative">
                      <select
                        bind:value={selectedEntry.type}
                        class="w-full appearance-none rounded-lg border border-surface-600 bg-surface-800 px-4 py-2.5 text-surface-100 focus:border-accent-500 focus:outline-none"
                      >
                        {#each entryTypes as type}
                          <option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                        {/each}
                      </select>
                      <div class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-surface-500">
                        <MoreVertical class="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  <!-- Group -->
                  <div>
                    <label class="block text-sm font-medium text-surface-300 mb-1">Group (Optional)</label>
                    <input
                      type="text"
                      bind:value={selectedEntry.group}
                      placeholder="e.g. Main Cast, Kingdom A"
                      class="w-full rounded-lg border border-surface-600 bg-surface-800 px-4 py-2.5 text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none"
                    />
                  </div>
                </div>

                <!-- Keywords -->
                <div>
                  <label class="block text-sm font-medium text-surface-300 mb-1">Keywords</label>
                  <input
                    type="text"
                    value={selectedEntry.keywords.join(', ')}
                    oninput={(e) => selectedEntry!.keywords = e.currentTarget.value.split(',').map(k => k.trim()).filter(Boolean)}
                    placeholder="Comma-separated keywords for activation"
                    class="w-full rounded-lg border border-surface-600 bg-surface-800 px-4 py-2.5 text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none"
                  />
                  <p class="mt-1.5 text-xs text-surface-500">
                    Terms that trigger this entry when using 'Keyword' injection mode.
                  </p>
                </div>

                <!-- Description -->
                <div class="flex-1 flex flex-col min-h-[200px]">
                  <label class="block text-sm font-medium text-surface-300 mb-1">Description / Content</label>
                  <textarea
                    bind:value={selectedEntry.description}
                    class="flex-1 w-full rounded-lg border border-surface-600 bg-surface-800 px-4 py-3 text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none font-mono text-sm leading-relaxed"
                    placeholder="Enter the lore content here..."
                  ></textarea>
                </div>

                <!-- Advanced Settings -->
                <div class="rounded-lg border border-surface-700 bg-surface-800/50 p-4 space-y-4">
                  <h4 class="text-sm font-medium text-surface-200">Injection Settings</h4>
                  
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <!-- Mode -->
                    <div>
                      <label class="block text-xs font-medium text-surface-400 mb-1">Injection Mode</label>
                      <select
                        bind:value={selectedEntry.injectionMode}
                        class="w-full rounded bg-surface-700 border-transparent px-2 py-1.5 text-sm text-surface-100 focus:ring-1 focus:ring-accent-500"
                      >
                        {#each injectionModes as mode}
                          <option value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</option>
                        {/each}
                      </select>
                    </div>

                    <!-- Priority -->
                    <div>
                      <label class="block text-xs font-medium text-surface-400 mb-1">Priority</label>
                      <input
                        type="number"
                        bind:value={selectedEntry.priority}
                        class="w-full rounded bg-surface-700 border-transparent px-2 py-1.5 text-sm text-surface-100 focus:ring-1 focus:ring-accent-500"
                      />
                    </div>

                    <!-- Enabled Toggle -->
                    <div class="flex items-end pb-2">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!selectedEntry.disabled}
                          onchange={() => selectedEntry!.disabled = !selectedEntry!.disabled}
                          class="h-4 w-4 rounded border-surface-600 bg-surface-700 text-accent-500 focus:ring-offset-surface-800"
                        />
                        <span class="text-sm text-surface-200">
                          {selectedEntry.disabled ? 'Disabled' : 'Enabled'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          {:else}
            <!-- Empty State -->
            <div class="flex-1 flex flex-col items-center justify-center text-surface-500">
              <div class="bg-surface-800/50 p-6 rounded-full mb-4">
                <Search class="h-8 w-8 opacity-50" />
              </div>
              <p class="text-lg font-medium text-surface-400">Select an entry to edit</p>
              <p class="text-sm text-surface-600 mt-2">Or click "Add New Entry" to create one</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Interactive Chat Panel -->
      {#if showInteractiveChat && name.trim()}
        <InteractiveLorebookChat
          {lorebook}
          {entries}
          onEntriesChange={(newEntries) => { entries = newEntries; }}
          onClose={() => showInteractiveChat = false}
          onSave={handleSilentSave}
        />
      {/if}
    </div>

  </ResponsiveModal.Content>
</ResponsiveModal.Root>
