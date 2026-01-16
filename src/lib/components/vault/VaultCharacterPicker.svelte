<script lang="ts">
  import { characterVault } from '$lib/stores/characterVault.svelte';
  import type { VaultCharacter, VaultCharacterType } from '$lib/types';
  import { X, Search, User, Users, Loader2 } from 'lucide-svelte';
  import VaultCharacterCard from './VaultCharacterCard.svelte';

  interface Props {
    filterType?: VaultCharacterType;
    onSelect: (character: VaultCharacter) => void;
    onClose: () => void;
  }

  let { filterType, onSelect, onClose }: Props = $props();

  let searchQuery = $state('');

  const filteredCharacters = $derived.by(() => {
    let chars = characterVault.characters;

    if (filterType) {
      chars = chars.filter(c => c.characterType === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      chars = chars.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.traits.some(t => t.toLowerCase().includes(query))
      );
    }

    // Sort favorites first
    // Use spread to create a copy before sorting to avoid mutating the $state array
    return [...chars].sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return 0;
    });
  });

  $effect(() => {
    if (!characterVault.isLoaded) {
      characterVault.load();
    }
  });

  function handleSelect(character: VaultCharacter) {
    onSelect(character);
  }

  const title = $derived(
    filterType === 'protagonist'
      ? 'Select Protagonist from Vault'
      : filterType === 'supporting'
        ? 'Select Supporting Character from Vault'
        : 'Select Character from Vault'
  );

  const emptyMessage = $derived(
    filterType === 'protagonist'
      ? 'No protagonists in vault'
      : filterType === 'supporting'
        ? 'No supporting characters in vault'
        : 'No characters in vault'
  );
</script>

<!-- Modal backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  role="dialog"
  aria-modal="true"
>
  <div class="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg bg-surface-800 shadow-xl">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 p-4">
      <div class="flex items-center gap-2">
        {#if filterType === 'protagonist'}
          <User class="h-5 w-5 text-accent-400" />
        {:else}
          <Users class="h-5 w-5 text-surface-400" />
        {/if}
        <h2 class="text-lg font-semibold text-surface-100">{title}</h2>
      </div>
      <button
        class="rounded p-1.5 hover:bg-surface-700"
        onclick={onClose}
      >
        <X class="h-5 w-5 text-surface-400" />
      </button>
    </div>

    <!-- Search -->
    <div class="border-b border-surface-700 p-4">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search characters..."
          class="w-full rounded-lg border border-surface-600 bg-surface-700 pl-10 pr-3 py-2 text-surface-100 placeholder-surface-500 focus:border-accent-500 focus:outline-none"
        />
      </div>
    </div>

    <!-- Character List -->
    <div class="flex-1 overflow-y-auto p-4">
      {#if !characterVault.isLoaded}
        <div class="flex h-40 items-center justify-center">
          <Loader2 class="h-8 w-8 animate-spin text-surface-500" />
        </div>
      {:else if filteredCharacters.length === 0}
        <div class="flex h-40 items-center justify-center">
          <div class="text-center">
            {#if filterType === 'protagonist'}
              <User class="mx-auto h-10 w-10 text-surface-600" />
            {:else}
              <Users class="mx-auto h-10 w-10 text-surface-600" />
            {/if}
            <p class="mt-2 text-surface-400">
              {#if searchQuery}
                No characters match your search
              {:else}
                {emptyMessage}
              {/if}
            </p>
            <p class="mt-1 text-sm text-surface-500">
              Create characters in the Character Vault first
            </p>
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each filteredCharacters as character (character.id)}
            <VaultCharacterCard
              {character}
              selectable
              onSelect={() => handleSelect(character)}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="border-t border-surface-700 p-4 flex justify-end">
      <button
        class="rounded-lg px-4 py-2 text-sm text-surface-400 hover:text-surface-200"
        onclick={onClose}
      >
        Cancel
      </button>
    </div>
  </div>
</div>
