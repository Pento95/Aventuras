<script lang="ts">
  import { slide } from "svelte/transition";
  import {
    Archive,
    Loader2,
    FileJson,
    ChevronRight,
    AlertCircle,
    X,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import type { VaultLorebook } from "$lib/types";
  import type { ImportedLorebookItem, EntryType } from "../wizardTypes";
  import { getTypeCounts, getTypeColor } from "../wizardTypes";

  interface Props {
    importedLorebooks: ImportedLorebookItem[];
    importError: string | null;
    onSelectFromVault: (lorebook: VaultLorebook) => void;
    onRemoveLorebook: (id: string) => void;
    onToggleExpanded: (id: string) => void;
    onClearAll: () => void;
    onNavigateToVault: () => void;
  }

  let {
    importedLorebooks,
    importError,
    onSelectFromVault,
    onRemoveLorebook,
    onToggleExpanded,
    onClearAll,
    onNavigateToVault,
  }: Props = $props();

  // Get list of vault lorebook IDs that have been imported
  const importedVaultLorebookIds = $derived(
    importedLorebooks
      .map((lb) => lb.vaultId)
      .filter((id): id is string => !!id),
  );

  // Combined summary for display
  const importedEntries = $derived(
    importedLorebooks.flatMap((lb) => lb.entries),
  );

  const importSummary = $derived.by(() => {
    if (importedLorebooks.length === 0) return null;
    const entries = importedEntries;
    return {
      total: entries.length,
      withContent: entries.filter((e) => e.description?.trim()).length,
      byType: getTypeCounts(entries),
    };
  });
</script>

<div class="space-y-4">
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <Archive class="h-4 w-4 text-accent-400" />
      <h3 class="text-sm font-medium text-surface-200">Add from Vault</h3>
    </div>
    <p class="text-surface-400 text-sm">
      Select lorebooks from your vault to populate your world with characters,
      locations, and lore. This step is optional.
    </p>
    <!-- Inline Vault Browser (Moved up to be close to description) -->
    <div class="pt-0">
      <UniversalVaultBrowser
        type="lorebook"
        onSelect={onSelectFromVault}
        {onNavigateToVault}
        disabledIds={importedVaultLorebookIds}
      />
    </div>
  </div>

  {#if importError}
    <div
      class="card bg-red-500/10 border-red-500/30 p-3 flex items-start gap-2"
    >
      <AlertCircle class="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <p class="text-sm text-red-400">{importError}</p>
    </div>
  {/if}

  <!-- Divider if there are items -->
  {#if importedLorebooks.length > 0}
    <div class="border-t border-surface-700 my-4"></div>
  {/if}

  <!-- List of Imported Lorebooks (Moved below browser) -->
  {#if importedLorebooks.length > 0}
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-surface-300">Selected Lorebooks</h3>
        {#if importedLorebooks.length > 1}
          <button
            class="text-xs text-surface-400 hover:text-surface-200"
            onclick={onClearAll}
          >
            Clear All
          </button>
        {/if}
      </div>

      {#each importedLorebooks as lorebook (lorebook.id)}
        <div
          class="card bg-surface-800 border border-surface-700 p-3 transition-all {lorebook.isLoading
            ? 'animate-pulse'
            : ''}"
          transition:slide
        >
          <!-- Header Row -->
          <div class="flex items-center gap-3">
            <!-- Expand Toggle -->
            <button
              class="p-1 rounded hover:bg-surface-700 transition-colors"
              onclick={() => onToggleExpanded(lorebook.id)}
              disabled={lorebook.isLoading}
            >
              <ChevronRight
                class="h-4 w-4 text-surface-500 transition-transform duration-200 {lorebook.expanded
                  ? 'rotate-90'
                  : ''}"
              />
            </button>

            <!-- Icon -->
            {#if lorebook.isLoading}
              <Loader2 class="h-5 w-5 text-accent-400 animate-spin shrink-0" />
            {:else}
              <FileJson class="h-5 w-5 text-accent-400 shrink-0" />
            {/if}

            <!-- Filename & Stats -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="font-medium text-surface-100 truncate text-sm"
                  title={lorebook.filename}
                >
                  {lorebook.filename.replace(" (from Vault)", "")}
                </span>
                {#if lorebook.result.warnings.length > 0 && !lorebook.isLoading}
                  <span
                    class="text-xs text-amber-400"
                    title="{lorebook.result.warnings.length} warnings"
                  >
                    ⚠️
                  </span>
                {/if}
              </div>

              {#if lorebook.isLoading}
                <p class="text-xs text-surface-400 mt-0.5">
                  {lorebook.loadingMessage || "Processing..."}
                  {#if lorebook.classificationProgress}
                    ({lorebook.classificationProgress.current}/{lorebook
                      .classificationProgress.total})
                  {/if}
                </p>
              {:else}
                <p class="text-xs text-surface-500 mt-0.5">
                  {lorebook.entries.length} entries
                </p>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0">
              {#if !lorebook.isLoading}
                <!-- Remove -->
                <button
                  class="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-red-400 transition-colors"
                  onclick={() => onRemoveLorebook(lorebook.id)}
                  title="Remove"
                >
                  <X class="h-4 w-4" />
                </button>
              {/if}
            </div>
          </div>

          <!-- Progress Bar (when loading) -->
          {#if lorebook.isLoading && lorebook.classificationProgress}
            <div class="mt-2 ml-9">
              <div class="w-full bg-surface-700 rounded-full h-1.5">
                <div
                  class="bg-accent-500 h-1.5 rounded-full transition-all duration-300"
                  style="width: {lorebook.classificationProgress.total > 0
                    ? (lorebook.classificationProgress.current /
                        lorebook.classificationProgress.total) *
                      100
                    : 0}%"
                ></div>
              </div>
            </div>
          {/if}

          <!-- Type breakdown (Always visible when not loading) -->
          {#if !lorebook.isLoading && lorebook.entries.length > 0}
            <div class="flex flex-wrap gap-1.5 mt-2 ml-9">
              {#each Object.entries(getTypeCounts(lorebook.entries)) as [type, count]}
                {#if count > 0}
                  <span
                    class="px-2 py-0.5 rounded-full bg-surface-700 text-xs {getTypeColor(
                      type as EntryType,
                    )}"
                  >
                    {type}: {count}
                  </span>
                {/if}
              {/each}
            </div>
          {/if}

          <!-- Expanded Content -->
          {#if lorebook.expanded && !lorebook.isLoading}
            <div
              class="mt-3 pt-3 border-t border-surface-700 space-y-3 ml-9"
              transition:slide
            >
              <!-- Preview (first 10) -->
              <div class="space-y-2">
                <h4 class="text-xs font-medium text-surface-400 uppercase">
                  Preview
                </h4>
                <div class="max-h-40 overflow-y-auto space-y-1">
                  {#each lorebook.entries.slice(0, 10) as entry}
                    <div
                      class="flex items-center gap-2 text-sm p-2 rounded bg-surface-900"
                    >
                      <span
                        class="px-1.5 py-0.5 rounded text-xs {getTypeColor(
                          entry.type,
                        )} bg-surface-700"
                      >
                        {entry.type}
                      </span>
                      <span class="text-surface-200 truncate flex-1">
                        {entry.name}
                      </span>
                      {#if entry.keywords.length > 0}
                        <span class="text-xs text-surface-500">
                          {entry.keywords.length} keywords
                        </span>
                      {/if}
                    </div>
                  {/each}
                  {#if lorebook.entries.length > 10}
                    <p class="text-xs text-surface-500 text-center py-2">
                      ...and {lorebook.entries.length - 10} more entries
                    </p>
                  {/if}
                </div>
              </div>

              {#if lorebook.result.warnings.length > 0}
                <div class="text-xs text-amber-400">
                  {lorebook.result.warnings.length} warning(s) during import
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Combined Summary -->
    {#if importedLorebooks.length > 1 && importSummary}
      <div class="card bg-surface-800 border border-surface-700 p-3">
        <p class="text-sm text-surface-300">
          <strong>Total:</strong>
          {importSummary.total} entries across {importedLorebooks.length} lorebooks
        </p>
      </div>
    {/if}
  {/if}
</div>
