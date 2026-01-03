<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { Plus, Settings, ToggleLeft, ToggleRight } from 'lucide-svelte';

  interface Props {
    onCreateChapter?: () => void;
  }

  let { onCreateChapter }: Props = $props();

  const tokensSinceLastChapter = $derived(story.tokensSinceLastChapter);
  const tokensOutsideBuffer = $derived(story.tokensOutsideBuffer);
  const threshold = $derived(story.memoryConfig.tokenThreshold);
  const autoSummarize = $derived(story.memoryConfig.autoSummarize);
  const messagesSinceLastChapter = $derived(story.messagesSinceLastChapter);
  const bufferSize = $derived(story.memoryConfig.chapterBuffer);

  const percentage = $derived(threshold > 0 ? Math.min(100, Math.round((tokensOutsideBuffer / threshold) * 100)) : 0);
  const isNearThreshold = $derived(percentage >= 80);
  const isOverThreshold = $derived(percentage >= 100);

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  async function toggleAutoSummarize() {
    await story.updateMemoryConfig({ autoSummarize: !autoSummarize });
  }

  function handleCreateChapter() {
    if (onCreateChapter) {
      onCreateChapter();
    } else {
      ui.openManualChapterModal();
    }
  }
</script>

<div class="rounded-lg bg-surface-800 p-4 space-y-3">
  <!-- Token Usage Section -->
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-sm text-surface-300">Context Usage</span>
      <button
        class="flex items-center gap-1.5 text-sm transition-colors hover:text-primary-400"
        onclick={toggleAutoSummarize}
        title={autoSummarize ? 'Auto-summarize enabled' : 'Auto-summarize disabled'}
      >
        {#if autoSummarize}
          <ToggleRight class="h-5 w-5 text-primary-400" />
          <span class="text-primary-400">Auto</span>
        {:else}
          <ToggleLeft class="h-5 w-5 text-surface-500" />
          <span class="text-surface-500">Auto</span>
        {/if}
      </button>
    </div>

    <!-- Progress Bar -->
    <div class="relative h-3 rounded-full bg-surface-700 overflow-hidden">
      <div
        class="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
        class:bg-accent-500={!isNearThreshold}
        class:bg-amber-500={isNearThreshold && !isOverThreshold}
        class:bg-red-500={isOverThreshold}
        style:width="{percentage}%"
      ></div>
    </div>

    <!-- Token Count -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 text-sm">
      <span class="text-surface-400">
        <span class="font-medium text-surface-200">{formatNumber(tokensOutsideBuffer)}</span>
        <span class="text-surface-500"> / {formatNumber(threshold)}</span>
        <span class="text-surface-500"> tokens</span>
      </span>
      <span class="text-surface-500 text-xs sm:text-sm">
        {messagesSinceLastChapter} messages
        {#if bufferSize > 0}
          <span class="text-surface-600">({bufferSize} protected)</span>
        {/if}
      </span>
    </div>
  </div>

  <!-- Actions Row -->
  <div class="flex items-center gap-2">
    <button
      class="btn-primary flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium"
      onclick={handleCreateChapter}
      disabled={ui.memoryLoading || messagesSinceLastChapter === 0}
    >
      <Plus class="h-4 w-4" />
      <span>Create Chapter Now</span>
    </button>

    <button
      class="btn-ghost p-2 rounded-lg"
      class:bg-surface-700={ui.memorySettingsOpen}
      onclick={() => ui.toggleMemorySettings()}
      title="Memory Settings"
    >
      <Settings class="h-5 w-5" />
    </button>
  </div>
</div>
