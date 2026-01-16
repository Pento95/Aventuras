<script lang="ts">
  import type { DiscoveryCard } from '$lib/services/discovery';
  import { Download, Loader2, Check } from 'lucide-svelte';

  type NsfwMode = 'disable' | 'blur' | 'enable';

  interface Props {
    card: DiscoveryCard;
    onImport: (card: DiscoveryCard) => void;
    isImported?: boolean;
    nsfwMode?: NsfwMode;
  }

  let { card, onImport, isImported = false, nsfwMode = 'disable' }: Props = $props();

  // Hide card entirely if NSFW is disabled and card is NSFW
  let isHidden = $derived(nsfwMode === 'disable' && card.nsfw);
  let shouldBlur = $derived(nsfwMode === 'blur' && card.nsfw);

  let imageError = $state(false);

  function handleImageError() {
    imageError = true;
  }

  function handleImportClick(e: MouseEvent) {
    e.stopPropagation();
    if (!isImported) {
      onImport(card);
    }
  }
</script>

{#if !isHidden}
<div
  class="group relative flex flex-col overflow-hidden rounded-lg border border-surface-600 bg-surface-800 transition-all hover:border-surface-500 hover:shadow-lg"
>
  <!-- Image -->
  <div
    class="relative aspect-square w-full overflow-hidden bg-surface-700"
  >
    <div class="absolute inset-0 h-full w-full" class:blur-lg={shouldBlur}>
      {#if !imageError && card.avatarUrl}
        <img
          src={card.avatarUrl}
          alt={card.name}
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
          onerror={handleImageError}
          loading="lazy"
        />
      {:else}
        <div class="flex h-full w-full items-center justify-center text-surface-500">
          <span class="text-4xl">?</span>
        </div>
      {/if}
    </div>

    <!-- NSFW Badge -->
    {#if card.nsfw}
      <div class="absolute left-2 top-2 z-20 rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
        NSFW
      </div>
    {/if}

    <!-- Source Badge -->
    <div class="absolute right-2 top-2 z-20 rounded bg-surface-900/80 px-1.5 py-0.5 text-xs text-surface-300">
      {card.source}
    </div>

    <!-- Imported Badge (Visible always if imported) -->
    {#if isImported}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-900/60 backdrop-blur-[1px] z-10">
        <div class="flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-sm font-medium text-green-400 border border-green-500/30 shadow-sm">
          <Check class="h-4 w-4" />
          <span>Imported</span>
        </div>
      </div>
    {/if}

    <!-- Hover Actions (Only visible when NOT imported) -->
    {#if !isImported}
      <div class="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onclick={handleImportClick}
          class="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
        >
          <Download class="h-4 w-4" />
          Import
        </button>
      </div>
    {/if}
  </div>

  <!-- Info -->
  <div class="flex flex-1 flex-col gap-1 p-3">
    <h3 class="line-clamp-1 text-sm font-medium text-surface-100" title={card.name}>
      {card.name}
    </h3>
    {#if card.creator}
      <p class="line-clamp-1 text-xs text-surface-400">
        by {card.creator}
      </p>
    {/if}
    {#if card.description}
      <p class="mt-1 line-clamp-2 text-xs text-surface-500">
        {card.description}
      </p>
    {/if}

    <!-- Tags -->
    {#if card.tags.length > 0}
      <div class="mt-auto flex flex-wrap gap-1 pt-2">
        {#each card.tags.slice(0, 3) as tag}
          <span class="rounded bg-surface-700 px-1.5 py-0.5 text-xs text-surface-400">
            {tag}
          </span>
        {/each}
        {#if card.tags.length > 3}
          <span class="rounded bg-surface-700 px-1.5 py-0.5 text-xs text-surface-400">
            +{card.tags.length - 3}
          </span>
        {/if}
      </div>
    {/if}
  </div>
</div>
{/if}
