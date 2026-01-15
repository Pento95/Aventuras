<script lang="ts">
  import { characterVault } from '$lib/stores/characterVault.svelte';
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { VaultCharacter, VaultCharacterType, VaultLorebook } from '$lib/types';
  import {
    Plus, Search, Star, User, Users, ChevronLeft, Upload, Loader2, Archive, Book
  } from 'lucide-svelte';
  import VaultCharacterCard from './VaultCharacterCard.svelte';
  import VaultCharacterForm from './VaultCharacterForm.svelte';
  import VaultLorebookCard from './VaultLorebookCard.svelte';
  import VaultLorebookEditor from './VaultLorebookEditor.svelte';
  import { readCharacterCardFile, parseCharacterCard } from '$lib/services/characterCardImporter';
  import { parseLorebook, classifyEntriesWithLLM, type ImportedEntry } from '$lib/services/lorebookImporter';
  import { fade } from 'svelte/transition';

  // Types
  type VaultTab = 'characters' | 'lorebooks';

  // State
  let activeTab = $state<VaultTab>('characters');
  let searchQuery = $state('');
  let showFavoritesOnly = $state(false);
  
  // Character State
  let charFilterType = $state<VaultCharacterType | 'all'>('all');
  let showCharForm = $state(false);
  let editingCharacter = $state<VaultCharacter | null>(null);
  let defaultCharFormType = $state<VaultCharacterType>('protagonist');
  let importingChar = $state(false);
  let importCharError = $state<string | null>(null);

  // Lorebook State
  let importingLorebook = $state(false);
  let importLorebookError = $state<string | null>(null);
  let importProgress = $state({ current: 0, total: 0 });
  let editingLorebook = $state<VaultLorebook | null>(null);

  // Derived: Filtered Characters
  const filteredCharacters = $derived.by(() => {
    let chars = characterVault.characters;

    if (charFilterType !== 'all') {
      chars = chars.filter(c => c.characterType === charFilterType);
    }

    if (showFavoritesOnly) {
      chars = chars.filter(c => c.favorite);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      chars = chars.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.tags.some(t => t.toLowerCase().includes(query)) ||
        c.traits.some(t => t.toLowerCase().includes(query))
      );
    }

    return chars;
  });

  // Derived: Filtered Lorebooks
  const filteredLorebooks = $derived.by(() => {
    let books = lorebookVault.lorebooks;

    if (showFavoritesOnly) {
      books = books.filter(b => b.favorite);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      books = books.filter(b =>
        b.name.toLowerCase().includes(query) ||
        b.description?.toLowerCase().includes(query) ||
        b.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    return books;
  });

  // Load on mount
  $effect(() => {
    if (!characterVault.isLoaded) characterVault.load();
    if (!lorebookVault.isLoaded) lorebookVault.load();
  });

  // Character Handlers
  function openCreateCharForm(type: VaultCharacterType = 'protagonist') {
    editingCharacter = null;
    defaultCharFormType = type;
    showCharForm = true;
  }

  function openEditCharForm(character: VaultCharacter) {
    editingCharacter = character;
    showCharForm = true;
  }

  async function handleDeleteChar(id: string) {
    await characterVault.delete(id);
  }

  async function handleToggleFavoriteChar(id: string) {
    await characterVault.toggleFavorite(id);
  }

  async function handleImportCard(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importingChar = true;
    importCharError = null;

    try {
      const jsonString = await readCharacterCardFile(file);
      const card = parseCharacterCard(jsonString);

      if (!card) throw new Error('Invalid character card format');

      const traits = card.personality
        ? card.personality.split(/[,;]/).map(t => t.trim()).filter(Boolean).slice(0, 10)
        : [];

      await characterVault.add({
        name: card.name,
        description: card.description || null,
        characterType: 'supporting',
        background: null,
        motivation: null,
        role: null,
        relationshipTemplate: null,
        traits,
        visualDescriptors: [],
        portrait: null,
        tags: ['imported'],
        favorite: false,
        source: 'import',
        originalStoryId: null,
        metadata: { cardVersion: card.version },
      });

    } catch (error) {
      console.error('[CharacterVault] Import failed:', error);
      importCharError = error instanceof Error ? error.message : 'Failed to import character card';
    } finally {
      importingChar = false;
      input.value = '';
    }
  }

  // Lorebook Handlers
  async function handleImportLorebook(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importingLorebook = true;
    importLorebookError = null;
    importProgress = { current: 0, total: 0 };

    try {
      const content = await file.text();
      const result = parseLorebook(content);

      if (!result.success || result.entries.length === 0) {
        throw new Error(result.errors.join('; ') || 'No entries found in lorebook');
      }

      // Classify entries
      const entries = await classifyEntriesWithLLM(
        result.entries,
        (current, total) => {
          importProgress = { current, total };
        },
        'adventure' // Default mode for classification context
      );

      // Convert ImportedEntry[] to VaultLorebookEntry[]
      // We can cast or map. Since structure matches except optional/extra fields:
      const vaultEntries = entries.map(e => {
        const { originalData, ...rest } = e;
        return rest;
      });

      // Save to vault
      await lorebookVault.saveFromImport(
        file.name.replace(/\.json$/i, ''),
        vaultEntries,
        { ...result, entries }, // Update result with classified entries
        file.name
      );

    } catch (error) {
      console.error('[VaultPanel] Lorebook import failed:', error);
      importLorebookError = error instanceof Error ? error.message : 'Failed to import lorebook';
    } finally {
      importingLorebook = false;
      input.value = '';
    }
  }

  async function handleDeleteLorebook(id: string) {
    await lorebookVault.delete(id);
  }

  async function handleToggleFavoriteLorebook(id: string) {
    await lorebookVault.toggleFavorite(id);
  }

  function openEditLorebook(lorebook: VaultLorebook) {
    editingLorebook = lorebook;
  }
</script>

<div class="flex h-full flex-col bg-surface-900">
  <!-- Header -->
  <div class="flex flex-col border-b border-surface-700 bg-surface-800">
    <!-- Top Bar -->
    <div class="flex items-center justify-between px-4 py-3 sm:px-6">
      <div class="flex items-center gap-3">
        <button
          class="rounded p-1.5 hover:bg-surface-700"
          onclick={() => ui.setActivePanel('library')}
          title="Back to Library"
        >
          <ChevronLeft class="h-5 w-5 text-surface-400" />
        </button>
        <div class="flex items-center gap-2">
          <Archive class="h-5 w-5 text-surface-400" />
          <h2 class="text-lg font-semibold text-surface-100">Vault</h2>
        </div>
      </div>
      
      <!-- Right Side Actions (Context Sensitive) -->
      <div class="flex items-center gap-2">
        {#if activeTab === 'characters'}
          <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-surface-600 bg-surface-700 px-3 py-1.5 text-sm text-surface-300 hover:border-surface-500">
            {#if importingChar}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              <Upload class="h-4 w-4" />
            {/if}
            <span class="hidden sm:inline">Import Card</span>
            <input
              type="file"
              accept=".json,.png"
              class="hidden"
              onchange={handleImportCard}
              disabled={importingChar}
            />
          </label>
          <button
            class="flex items-center gap-2 rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
            onclick={() => openCreateCharForm()}
          >
            <Plus class="h-4 w-4" />
            <span class="hidden sm:inline">New Character</span>
          </button>
        {:else}
          <!-- Lorebook Actions -->
          <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-surface-600 bg-surface-700 px-3 py-1.5 text-sm text-surface-300 hover:border-surface-500 {importingLorebook ? 'opacity-50 cursor-not-allowed' : ''}">
            {#if importingLorebook}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              <Upload class="h-4 w-4" />
            {/if}
            <span class="hidden sm:inline">Import Lorebook</span>
            <input
              type="file"
              accept=".json,application/json"
              class="hidden"
              onchange={handleImportLorebook}
              disabled={importingLorebook}
            />
          </label>
        {/if}
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="flex px-4 sm:px-6">
      <button
        class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'characters' ? 'border-accent-500 text-accent-400' : 'border-transparent text-surface-400 hover:text-surface-200'}"
        onclick={() => activeTab = 'characters'}
      >
        <Users class="h-4 w-4" />
        Characters
        <span class="ml-1 rounded-full bg-surface-700 px-2 py-0.5 text-xs text-surface-400">
          {characterVault.characters.length}
        </span>
      </button>
      <button
        class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'lorebooks' ? 'border-accent-500 text-accent-400' : 'border-transparent text-surface-400 hover:text-surface-200'}"
        onclick={() => activeTab = 'lorebooks'}
      >
        <Book class="h-4 w-4" />
        Lorebooks
        <span class="ml-1 rounded-full bg-surface-700 px-2 py-0.5 text-xs text-surface-400">
          {lorebookVault.lorebooks.length}
        </span>
      </button>
    </div>
  </div>

  <!-- Search and Filters (Common) -->
  <div class="border-b border-surface-700 px-4 py-3 space-y-3 sm:px-6 bg-surface-900/50">
    {#if activeTab === 'characters' && importCharError}
      <div class="rounded-lg bg-red-500/10 border border-red-500/30 p-2 text-sm text-red-400 flex items-center justify-between">
        <span>{importCharError}</span>
        <button onclick={() => importCharError = null} class="text-red-400 hover:text-red-300">
          <span class="sr-only">Dismiss</span>
          &times;
        </button>
      </div>
    {/if}

    {#if activeTab === 'lorebooks'}
      {#if importLorebookError}
        <div class="rounded-lg bg-red-500/10 border border-red-500/30 p-2 text-sm text-red-400 flex items-center justify-between">
          <span>{importLorebookError}</span>
          <button onclick={() => importLorebookError = null} class="text-red-400 hover:text-red-300">
            <span class="sr-only">Dismiss</span>
            &times;
          </button>
        </div>
      {/if}

      {#if importingLorebook && importProgress.total > 0}
        <div class="rounded-lg bg-surface-800 p-3 border border-surface-700">
          <div class="flex justify-between text-xs text-surface-400 mb-1">
            <span>Classifying entries...</span>
            <span>{importProgress.current} / {importProgress.total}</span>
          </div>
          <div class="w-full bg-surface-700 rounded-full h-1.5">
            <div
              class="bg-accent-500 h-1.5 rounded-full transition-all duration-300"
              style="width: {(importProgress.current / importProgress.total) * 100}%"
            ></div>
          </div>
        </div>
      {/if}
    {/if}

    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={activeTab === 'characters' ? "Search characters..." : "Search lorebooks..."}
          class="w-full rounded-lg border border-surface-600 bg-surface-700 pl-10 pr-3 py-2 text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div class="flex items-center gap-2">
        {#if activeTab === 'characters'}
          <div class="flex items-center gap-1 rounded-lg bg-surface-800 p-1 border border-surface-700">
            <button
              class="rounded-md px-3 py-1.5 text-xs transition-colors {charFilterType === 'all' ? 'bg-surface-600 text-surface-100' : 'text-surface-400 hover:text-surface-200'}"
              onclick={() => charFilterType = 'all'}
            >
              All
            </button>
            <button
              class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors {charFilterType === 'protagonist' ? 'bg-surface-600 text-surface-100' : 'text-surface-400 hover:text-surface-200'}"
              onclick={() => charFilterType = 'protagonist'}
            >
              <User class="h-3 w-3" />
              Protagonists
            </button>
            <button
              class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors {charFilterType === 'supporting' ? 'bg-surface-600 text-surface-100' : 'text-surface-400 hover:text-surface-200'}"
              onclick={() => charFilterType = 'supporting'}
            >
              <Users class="h-3 w-3" />
              Supporting
            </button>
          </div>
        {/if}

        <button
          class="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors {showFavoritesOnly ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400' : 'border-surface-600 bg-surface-800 text-surface-400 hover:border-surface-500'}"
          onclick={() => showFavoritesOnly = !showFavoritesOnly}
        >
          <Star class="h-3 w-3 {showFavoritesOnly ? 'fill-yellow-400' : ''}" />
          Favorites
        </button>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-900">
    {#if activeTab === 'characters'}
      <!-- Character Grid -->
      {#if !characterVault.isLoaded}
        <div class="flex h-full items-center justify-center">
          <Loader2 class="h-8 w-8 animate-spin text-surface-500" />
        </div>
      {:else if filteredCharacters.length === 0}
        <div class="flex h-full items-center justify-center" in:fade>
          <div class="text-center">
            <Users class="mx-auto h-12 w-12 text-surface-600" />
            <p class="mt-3 text-surface-400">
              {#if searchQuery || showFavoritesOnly || charFilterType !== 'all'}
                No characters match your filters
              {:else}
                No characters in vault yet
              {/if}
            </p>
            {#if !searchQuery && !showFavoritesOnly && charFilterType === 'all'}
              <div class="mt-4 flex justify-center gap-2">
                <button
                  class="flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600"
                  onclick={() => openCreateCharForm('protagonist')}
                >
                  <User class="h-4 w-4" />
                  Create Protagonist
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-700 px-4 py-2 text-sm text-surface-300 hover:border-surface-500"
                  onclick={() => openCreateCharForm('supporting')}
                >
                  <Users class="h-4 w-4" />
                  Create Supporting
                </button>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" in:fade>
          {#each filteredCharacters as character (character.id)}
            <VaultCharacterCard
              {character}
              onEdit={() => openEditCharForm(character)}
              onDelete={() => handleDeleteChar(character.id)}
              onToggleFavorite={() => handleToggleFavoriteChar(character.id)}
            />
          {/each}
        </div>
      {/if}
    
    {:else}
      <!-- Lorebook Grid -->
      {#if !lorebookVault.isLoaded}
        <div class="flex h-full items-center justify-center">
          <Loader2 class="h-8 w-8 animate-spin text-surface-500" />
        </div>
      {:else if filteredLorebooks.length === 0}
        <div class="flex h-full items-center justify-center" in:fade>
          <div class="text-center">
            <Book class="mx-auto h-12 w-12 text-surface-600" />
            <p class="mt-3 text-surface-400">
              {#if searchQuery || showFavoritesOnly}
                No lorebooks match your filters
              {:else}
                No lorebooks in vault yet
              {/if}
            </p>
            <p class="mt-1 text-sm text-surface-500">
              Save processed lorebooks from the Setup Wizard or your stories
            </p>
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" in:fade>
          {#each filteredLorebooks as lorebook (lorebook.id)}
            <VaultLorebookCard
              {lorebook}
              onDelete={() => handleDeleteLorebook(lorebook.id)}
              onToggleFavorite={() => handleToggleFavoriteLorebook(lorebook.id)}
              onEdit={() => openEditLorebook(lorebook)}
            />
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Character Form Modal -->
{#if showCharForm}
  <VaultCharacterForm
    character={editingCharacter}
    defaultType={defaultCharFormType}
    onClose={() => { showCharForm = false; editingCharacter = null; }}
  />
{/if}

<!-- Lorebook Editor Modal -->
{#if editingLorebook}
  <VaultLorebookEditor
    lorebook={editingLorebook}
    onClose={() => editingLorebook = null}
  />
{/if}
