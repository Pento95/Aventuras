<script lang="ts">
  import type { VaultCharacter } from '$lib/types';
  import { Star, Pencil, Trash2, User, Users, Loader2 } from 'lucide-svelte';
  import { normalizeImageDataUrl } from '$lib/utils/image';

  interface Props {
    character: VaultCharacter;
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavorite?: () => void;
    selectable?: boolean;
    onSelect?: () => void;
  }

  let { character, onEdit, onDelete, onToggleFavorite, selectable = false, onSelect }: Props = $props();

  let confirmingDelete = $state(false);
  let isImporting = $derived(character.metadata?.importing === true);

  function handleCardClick() {
    if (isImporting) return;
    if (selectable && onSelect) {
      onSelect();
    }
  }

  function handleDelete(e: Event) {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
    confirmingDelete = false;
  }

  function handleCancelDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = false;
  }

  function handleConfirmDelete(e: Event) {
    e.stopPropagation();
    confirmingDelete = true;
  }
</script>

<div
  class="relative rounded-lg border border-surface-700 bg-surface-800 p-4 {selectable && !isImporting ? 'cursor-pointer hover:ring-2 hover:ring-accent-500 transition-all' : ''}"
  onclick={handleCardClick}
  role={selectable && !isImporting ? "button" : undefined}
  tabindex={selectable && !isImporting ? 0 : undefined}
  onkeydown={selectable && !isImporting ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(); } : undefined}
>
  {#if isImporting}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-900/80 backdrop-blur-sm">
      <Loader2 class="h-8 w-8 animate-spin text-primary-400" />
      <span class="text-sm font-medium text-primary-200">Importing...</span>
    </div>
  {/if}

  <div class="flex items-start gap-3">
    <!-- Portrait -->
    {#if character.portrait}
      <img
        src={normalizeImageDataUrl(character.portrait) ?? ''}
        alt={character.name}
        class="h-16 w-16 rounded-lg object-cover ring-1 ring-surface-600 flex-shrink-0"
      />
    {:else}
      <div class="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-700 flex-shrink-0">
        {#if character.characterType === 'protagonist'}
          <User class="h-8 w-8 text-accent-400" />
        {:else}
          <Users class="h-8 w-8 text-surface-400" />
        {/if}
      </div>
    {/if}

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="font-medium text-surface-100 truncate">{character.name}</h3>
        {#if character.favorite}
          <Star class="h-4 w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
        {/if}
      </div>

      <span class="inline-block mt-1 rounded-full px-2 py-0.5 text-xs {
        character.characterType === 'protagonist'
          ? 'bg-accent-500/20 text-accent-300'
          : 'bg-surface-700 text-surface-400'
      }">
        {character.characterType === 'protagonist' ? 'Protagonist' : character.role || 'Supporting'}
      </span>

      {#if character.description}
        <p class="mt-2 text-sm text-surface-400 line-clamp-2">{character.description}</p>
      {/if}

      {#if character.traits.length > 0}
        <div class="mt-2 flex flex-wrap gap-1">
          {#each character.traits.slice(0, 3) as trait}
            <span class="rounded bg-surface-700 px-1.5 py-0.5 text-xs text-surface-400">{trait}</span>
          {/each}
          {#if character.traits.length > 3}
            <span class="text-xs text-surface-500">+{character.traits.length - 3}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Actions -->
  {#if !selectable && (onEdit || onDelete || onToggleFavorite)}
    <div class="mt-3 flex items-center justify-end gap-1 border-t border-surface-700 pt-3">
      {#if confirmingDelete}
        <button
          class="rounded px-2 py-1 text-xs bg-surface-700 text-surface-300 hover:bg-surface-600"
          onclick={handleCancelDelete}
        >
          Cancel
        </button>
        <button
          class="rounded px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30"
          onclick={handleDelete}
        >
          Confirm Delete
        </button>
      {:else}
        {#if onToggleFavorite}
          <button
            class="rounded p-1.5 hover:bg-surface-700"
            onclick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}
            title={character.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star class="h-4 w-4 {character.favorite ? 'text-yellow-400 fill-yellow-400' : 'text-surface-500'}" />
          </button>
        {/if}
        {#if onEdit}
          <button
            class="rounded p-1.5 hover:bg-surface-700"
            onclick={(e) => { e.stopPropagation(); onEdit?.(); }}
            title="Edit"
          >
            <Pencil class="h-4 w-4 text-surface-500 hover:text-surface-200" />
          </button>
        {/if}
        {#if onDelete}
          <button
            class="rounded p-1.5 hover:bg-surface-700"
            onclick={handleConfirmDelete}
            title="Delete"
          >
            <Trash2 class="h-4 w-4 text-surface-500 hover:text-red-400" />
          </button>
        {/if}
      {/if}
    </div>
  {/if}
</div>
