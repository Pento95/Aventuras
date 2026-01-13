<script lang="ts">
  import { onMount } from 'svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { exportService } from '$lib/services/export';
  import { database } from '$lib/services/database';
  import {
    eventBus,
    type ImageAnalysisStartedEvent,
    type ImageAnalysisCompleteEvent,
    type ImageQueuedEvent,
    type ImageReadyEvent,
  } from '$lib/services/events';
  import { PanelLeft, Settings, BookOpen, Library, Feather, Download, FileJson, FileText, ChevronDown, Bug, BookMarked, Brain, ImageIcon } from 'lucide-svelte';

  let showExportMenu = $state(false);

  // Subscribe to image generation events
  onMount(() => {
    const unsubAnalysisStarted = eventBus.subscribe<ImageAnalysisStartedEvent>(
      'ImageAnalysisStarted',
      () => ui.setImageAnalysisInProgress(true)
    );

    const unsubAnalysisComplete = eventBus.subscribe<ImageAnalysisCompleteEvent>(
      'ImageAnalysisComplete',
      () => ui.setImageAnalysisInProgress(false)
    );

    const unsubImageQueued = eventBus.subscribe<ImageQueuedEvent>(
      'ImageQueued',
      () => ui.incrementImagesGenerating()
    );

    const unsubImageReady = eventBus.subscribe<ImageReadyEvent>(
      'ImageReady',
      () => ui.decrementImagesGenerating()
    );

    return () => {
      unsubAnalysisStarted();
      unsubAnalysisComplete();
      unsubImageQueued();
      unsubImageReady();
    };
  });

  async function exportAventura() {
    if (!story.currentStory) return;
    showExportMenu = false;
    const [
      entries,
      characters,
      locations,
      items,
      storyBeats,
      lorebookEntries,
      embeddedImages,
      checkpoints,
      branches,
      chapters,
    ] = await Promise.all([
      database.getStoryEntries(story.currentStory.id),
      database.getCharacters(story.currentStory.id),
      database.getLocations(story.currentStory.id),
      database.getItems(story.currentStory.id),
      database.getStoryBeats(story.currentStory.id),
      database.getEntries(story.currentStory.id),
      database.getEmbeddedImagesForStory(story.currentStory.id),
      database.getCheckpoints(story.currentStory.id),
      database.getBranches(story.currentStory.id),
      database.getChapters(story.currentStory.id),
    ]);
    await exportService.exportToAventura(
      story.currentStory,
      entries,
      characters,
      locations,
      items,
      storyBeats,
      lorebookEntries,
      embeddedImages,
      checkpoints,
      branches,
      chapters
    );
  }

  async function exportMarkdown() {
    if (!story.currentStory) return;
    showExportMenu = false;
    await exportService.exportToMarkdown(
      story.currentStory,
      story.entries,
      story.characters,
      story.locations,
      true
    );
  }

  async function exportText() {
    if (!story.currentStory) return;
    showExportMenu = false;
    await exportService.exportToText(story.currentStory, story.entries);
  }
</script>

<header class="flex h-12 sm:h-14 items-center justify-between border-b border-surface-700 bg-surface-800 px-2 sm:px-4">
  <!-- Left side: Menu toggle and story title -->
  <div class="flex items-center gap-2 sm:gap-3 min-w-0">
    {#if story.currentStory}
      <button
        class="btn-ghost rounded-lg p-3 min-h-[48px] min-w-[48px] flex items-center justify-center"
        onclick={() => ui.toggleSidebar()}
        title={ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <PanelLeft class="h-5 w-5" />
      </button>
    {/if}

    <div class="flex items-center gap-1.5 sm:gap-2">
      <Feather class="h-4 w-4 sm:h-5 sm:w-5 text-accent-500 flex-shrink-0" />
      <span class="font-semibold text-surface-100 text-sm sm:text-base hidden xs:inline">Aventura</span>
    </div>

    {#if story.currentStory}
      <span class="text-surface-500 hidden sm:inline">|</span>
      <span class="text-surface-300 truncate max-w-[80px] xs:max-w-[120px] sm:max-w-none text-sm sm:text-base">{story.currentStory.title}</span>
      {#if settings.uiSettings.showWordCount}
        <span class="text-sm text-surface-500 hidden lg:inline">({story.wordCount} words)</span>
      {/if}
    {/if}
  </div>

  <!-- Center: Navigation tabs -->
  <div class="flex items-center gap-0.5 sm:gap-1">
    <button
      class="btn-ghost nav-tab flex items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-3 py-1.5 min-h-[40px]"
      class:nav-tab-active={ui.activePanel === 'library' || !story.currentStory}
      onclick={() => ui.setActivePanel('library')}
      title="Library"
    >
      <Library class="h-4 w-4" />
      <span class="text-sm hidden sm:inline">Library</span>
    </button>

    {#if story.currentStory}
      <button
        class="btn-ghost nav-tab flex items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-3 py-1.5 min-h-[40px]"
        class:nav-tab-active={ui.activePanel === 'story'}
        onclick={() => ui.setActivePanel('story')}
        title="Story"
      >
        <BookOpen class="h-4 w-4" />
        <span class="text-sm hidden sm:inline">Story</span>
      </button>

      <button
        class="btn-ghost nav-tab flex items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-3 py-1.5 min-h-[40px]"
        class:nav-tab-active={ui.activePanel === 'lorebook'}
        onclick={() => ui.setActivePanel('lorebook')}
        title="Lorebook"
      >
        <BookMarked class="h-4 w-4" />
        <span class="text-sm hidden sm:inline">Lorebook</span>
      </button>

      <button
        class="btn-ghost nav-tab flex items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-3 py-1.5 min-h-[40px]"
        class:nav-tab-active={ui.activePanel === 'memory'}
        onclick={() => ui.setActivePanel('memory')}
        title="Memory"
      >
        <Brain class="h-4 w-4" />
        <span class="text-sm hidden sm:inline">Memory</span>
      </button>
    {/if}
  </div>

  <!-- Right side: Export and Settings -->
  <div class="flex items-center gap-1 sm:gap-2">
    {#if ui.isGenerating}
      <div class="flex items-center gap-1.5 text-sm text-accent-400">
        <div class="h-2 w-2 animate-pulse rounded-full bg-accent-500"></div>
        <span class="hidden sm:inline">Generating...</span>
      </div>
    {/if}

    <!-- Image generation status indicators -->
    {#if ui.imageAnalysisInProgress}
      <div class="flex items-center gap-1.5 text-sm text-blue-400" title="Analyzing scene for images">
        <ImageIcon class="h-3.5 w-3.5 animate-pulse" />
        <span class="hidden sm:inline">Analyzing...</span>
      </div>
    {:else if ui.imagesGenerating > 0}
      <div class="flex items-center gap-1.5 text-sm text-emerald-400" title="Generating images">
        <ImageIcon class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">
          {ui.imagesGenerating} image{ui.imagesGenerating > 1 ? 's' : ''}
        </span>
        <div class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
      </div>
    {/if}

    {#if story.currentStory}
      <div class="relative">
        <button
          class="btn-ghost flex items-center gap-1 rounded-lg p-2 sm:px-2 sm:py-1.5 text-sm min-h-[44px] min-w-[44px] justify-center"
          onclick={() => showExportMenu = !showExportMenu}
          title="Export story"
        >
          <Download class="h-4 w-4" />
          <span class="hidden sm:inline">Export</span>
          <ChevronDown class="h-3 w-3 hidden sm:inline" />
        </button>

        {#if showExportMenu}
          <div
            class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-surface-600 bg-surface-800 py-1 shadow-lg"
          >
            <button
              class="flex w-full items-center gap-2 px-3 py-3 sm:py-2 text-left text-sm text-surface-300 hover:bg-surface-700 min-h-[44px]"
              onclick={exportAventura}
            >
              <FileJson class="h-4 w-4 text-accent-400" />
              Aventura (.avt)
            </button>
            <button
              class="flex w-full items-center gap-2 px-3 py-3 sm:py-2 text-left text-sm text-surface-300 hover:bg-surface-700 min-h-[44px]"
              onclick={exportMarkdown}
            >
              <FileText class="h-4 w-4 text-blue-400" />
              Markdown (.md)
            </button>
            <button
              class="flex w-full items-center gap-2 px-3 py-3 sm:py-2 text-left text-sm text-surface-300 hover:bg-surface-700 min-h-[44px]"
              onclick={exportText}
            >
              <FileText class="h-4 w-4 text-surface-400" />
              Plain Text (.txt)
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if story.currentStory && story.lorebookEntries.length > 0}
      <button
        class="btn-ghost rounded-lg p-2 relative min-h-[44px] min-w-[44px] flex items-center justify-center hidden sm:flex"
        onclick={() => ui.toggleLorebookDebug()}
        title="View active lorebook entries"
      >
        <Bug class="h-5 w-5" />
        {#if ui.lastLorebookRetrieval && ui.lastLorebookRetrieval.all.length > 0}
          <span class="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent-500 text-[10px] font-medium flex items-center justify-center text-white">
            {ui.lastLorebookRetrieval.all.length}
          </span>
        {/if}
      </button>
    {/if}

    <button
      class="btn-ghost rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
      onclick={() => ui.openSettings()}
      title="Settings"
    >
      <Settings class="h-5 w-5" />
    </button>
  </div>
</header>

<!-- Click outside to close export menu -->
{#if showExportMenu}
  <div
    class="fixed inset-0 z-40"
    onclick={() => showExportMenu = false}
    onkeydown={(e) => e.key === 'Escape' && (showExportMenu = false)}
    role="button"
    tabindex="-1"
    aria-label="Close export menu"
  ></div>
{/if}
