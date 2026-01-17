<script lang="ts">
  import { slide } from 'svelte/transition';
  import { parseMarkdown } from '$lib/utils/markdown';
  import { ui } from '$lib/stores/ui.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { Brain } from 'lucide-svelte';

  let { 
    content, 
    isStreaming = false,
    isReasoningPhase = false,
    entryId,
    showToggleOnly = false,
  }: { 
    content: string; 
    isStreaming?: boolean;
    isReasoningPhase?: boolean;
    entryId?: string;
    showToggleOnly?: boolean;
  } = $props();

  // Use persistent state from UI store shared between StoryEntry and StreamingEntry
  let isOpen = $derived.by(() => {
    if (isStreaming) {
      return ui.streamingReasoningExpanded;
    }
    return entryId ? ui.isReasoningExpanded(entryId) : false;
  });

  // Toggle function that updates the appropriate store (only when enabled)
  function toggleOpen() {
    if (!isToggleEnabled) return;
    
    if (isStreaming) {
      ui.setStreamingReasoningExpanded(!isOpen);
    } else if (entryId) {
      ui.toggleReasoningExpanded(entryId, !isOpen);
    }
  }

  // Toggle is only enabled when showReasoning is on (regardless of streaming state)
  let isToggleEnabled = $derived(settings.uiSettings.showReasoning);
  
  // Content panel visibility respects the setting
  let isContentVisible = $derived(settings.uiSettings.showReasoning);
  
  let renderedContent = $derived(parseMarkdown(content));
</script>

{#if showToggleOnly}
  <!-- Toggle-only mode: just the icon button for header row -->
  <button 
    class="reasoning-toggle"
    class:is-open={isOpen}
    class:is-streaming={isStreaming}
    class:is-disabled={!isToggleEnabled}
    onclick={toggleOpen}
    title={isToggleEnabled ? (isOpen ? "Hide thinking" : "Show thinking") : "Reasoning display is disabled in settings"}
  >
    <Brain class="h-3.5 w-3.5 {isReasoningPhase ? 'animate-pulse' : ''}" />
    {#if isStreaming}
      <span class="streaming-indicator"></span>
    {/if}
  </button>
{:else}
  <!-- Content panel mode: the expanded reasoning content -->
  {#if isContentVisible && isOpen}
    <div class="reasoning-panel" transition:slide={{ duration: 150 }}>
      <div class="reasoning-text prose-content">
        {@html renderedContent}
      </div>
    </div>
  {/if}
{/if}

<style>
  .reasoning-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0.25rem;
    border-radius: 0.25rem;
    background: transparent;
    border: none;
    color: var(--color-surface-500, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  @media (hover: hover) {
    .reasoning-toggle:not(.is-disabled):hover {
      color: var(--color-surface-300, #cbd5e1);
      background: var(--color-surface-700, #334155);
    }
  }

  .reasoning-toggle.is-open {
    color: var(--color-surface-300, #cbd5e1);
  }

  .reasoning-toggle.is-streaming {
    color: var(--color-accent-400, #60a5fa);
  }

  .reasoning-toggle.is-disabled {
    cursor: default;
    pointer-events: none;
  }

  .streaming-indicator {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-accent-400, #60a5fa);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  .reasoning-panel {
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
  }

  .reasoning-text {
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-surface-400, #94a3b8);
    font-style: italic;
    word-break: break-word;
  }
</style>
