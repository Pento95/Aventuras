<script lang="ts">
  import type { VaultLorebook, EntryType } from '$lib/types';
  import { Star, Pencil, Trash2, Archive, Users, MapPin, Box, Flag, Brain, Calendar, Loader2 } from 'lucide-svelte';

  interface Props {
    lorebook: VaultLorebook;
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavorite?: () => void;
    selectable?: boolean;
    onSelect?: () => void;
  }

  let { lorebook, onEdit, onDelete, onToggleFavorite, selectable = false, onSelect }: Props = $props();

  let confirmingDelete = $state(false);
  let isImporting = $derived(lorebook.metadata?.importing === true);

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

  // Icons for entry types
  const typeIcons: Record<EntryType, any> = {
    character: Users,
    location: MapPin,
    item: Box,
    faction: Flag,
    concept: Brain,
    event: Calendar,
  };

  // Helper to get non-zero entry counts
  const entryCounts = $derived.by(() => {
    if (!lorebook.metadata?.entryBreakdown) return [];
    return Object.entries(lorebook.metadata.entryBreakdown)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => ({ type: type as EntryType, count }));
  });
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
      <span class="text-sm font-medium text-primary-200">Processing...</span>
    </div>
  {/if}

  <div class="flex items-start gap-3">
    <!-- Icon -->
    <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-700 flex-shrink-0">
      <Archive class="h-6 w-6 text-accent-400" />
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="font-medium text-surface-100 truncate">{lorebook.name}</h3>
        {#if lorebook.favorite}
          <Star class="h-4 w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
        {/if}
      </div>

      <div class="flex items-center gap-2 mt-1">
        <span class="text-xs text-surface-400">
          {lorebook.entries.length} entries
        </span>
        {#if lorebook.source === 'story'}
          <span class="text-xs text-surface-500">• From Story</span>
        {:else if lorebook.source === 'import'}
          <span class="text-xs text-surface-500">• Imported</span>
        {/if}
      </div>

      {#if lorebook.description}
        <p class="mt-2 text-sm text-surface-400 line-clamp-2">{lorebook.description}</p>
      {/if}

      <!-- Entry Type Breakdown -->
      {#if entryCounts.length > 0}
        <div class="mt-3 flex flex-wrap gap-2">
          {#each entryCounts.slice(0, 4) as { type, count }}
            {@const Icon = typeIcons[type]}
            <div class="flex items-center gap-1 rounded bg-surface-700 px-1.5 py-0.5 text-xs text-surface-400" title="{type}">
              <Icon class="h-3 w-3" />
              <span>{count}</span>
            </div>
          {/each}
          {#if entryCounts.length > 4}
             <span class="text-xs text-surface-500 self-center">+{entryCounts.length - 4}</span>
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
            title={lorebook.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star class="h-4 w-4 {lorebook.favorite ? 'text-yellow-400 fill-yellow-400' : 'text-surface-500'}" />
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
