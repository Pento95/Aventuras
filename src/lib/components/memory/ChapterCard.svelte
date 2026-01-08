<script lang="ts">
  import type { Chapter, StoryEntry, TimeTracker } from '$lib/types';
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import ChapterEntryList from './ChapterEntryList.svelte';
  import {
    ChevronDown,
    ChevronRight,
    Edit2,
    RefreshCw,
    Trash2,
    Users,
    MapPin,
    Theater,
    Clock,
    Save,
    X,
  } from 'lucide-svelte';
  import { ask } from '@tauri-apps/plugin-dialog';

  interface Props {
    chapter: Chapter;
    entries: StoryEntry[];
    onResummarize?: (chapter: Chapter) => void;
  }

  let { chapter, entries, onResummarize }: Props = $props();

  const isExpanded = $derived(ui.memoryExpandedChapterId === chapter.id);
  const isEditing = $derived(ui.memoryEditingChapterId === chapter.id);

  let editedSummary = $state(chapter.summary);

  // Reset edit state when chapter changes
  $effect(() => {
    editedSummary = chapter.summary;
  });

  // Format time for display (compact version)
  function formatTime(time: TimeTracker | null): string {
    if (!time) return '';
    const parts: string[] = [];
    if (time.years > 0) parts.push(`Y${time.years}`);
    if (time.days > 0) parts.push(`D${time.days}`);
    const hour = time.hours.toString().padStart(2, '0');
    const minute = time.minutes.toString().padStart(2, '0');
    parts.push(`${hour}:${minute}`);
    return parts.join(' ');
  }

  // Format time range for display
  const timeRangeDisplay = $derived.by(() => {
    if (!chapter.startTime && !chapter.endTime) return null;
    const start = formatTime(chapter.startTime);
    const end = formatTime(chapter.endTime);
    if (start && end && start !== end) {
      return `${start} → ${end}`;
    }
    return start || end || null;
  });

  function toggleExpand() {
    ui.toggleChapterExpanded(chapter.id);
  }

  function startEdit() {
    editedSummary = chapter.summary;
    ui.setMemoryEditingChapter(chapter.id);
  }

  function cancelEdit() {
    editedSummary = chapter.summary;
    ui.setMemoryEditingChapter(null);
  }

  async function saveEdit() {
    if (editedSummary !== chapter.summary) {
      await story.updateChapterSummary(chapter.id, editedSummary);
    }
    ui.setMemoryEditingChapter(null);
  }

  function handleResummarize() {
    if (onResummarize) {
      onResummarize(chapter);
    } else {
      ui.openResummarizeModal(chapter.id);
    }
  }

  async function handleDelete() {
    const confirmed = await ask(
      `Are you sure you want to delete Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}? The story entries will remain, but the summary will be lost.`,
      {
        title: 'Delete Chapter',
        kind: 'warning',
      }
    );
    if (confirmed) {
      await story.deleteChapter(chapter.id);
    }
  }
</script>

<div class="rounded-lg bg-surface-800 overflow-hidden">
  <!-- Header -->
  <div class="p-3 flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span class="text-sm font-medium text-surface-200 shrink-0">
          Chapter {chapter.number}
        </span>
        {#if chapter.title}
          <span class="text-sm text-surface-400 hidden sm:inline">—</span>
          <span class="text-sm text-primary-400 truncate max-w-[150px] sm:max-w-none">{chapter.title}</span>
        {/if}
      </div>
    </div>

    <!-- Action Buttons -->
    {#if !isEditing}
      <div class="flex items-center gap-1 shrink-0">
        <button
          class="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
          onclick={startEdit}
          title="Edit summary"
        >
          <Edit2 class="h-4 w-4" />
        </button>
        <button
          class="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
          onclick={handleResummarize}
          title="Regenerate summary"
          disabled={ui.memoryLoading}
        >
          <RefreshCw class="h-4 w-4 {ui.memoryLoading && ui.resummarizeChapterId === chapter.id ? 'animate-spin' : ''}" />
        </button>
        <button
          class="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-red-400 transition-colors"
          onclick={handleDelete}
          title="Delete chapter"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </div>
    {:else}
      <div class="flex items-center gap-1 shrink-0">
        <button
          class="p-1.5 rounded hover:bg-surface-700 text-green-400 hover:text-green-300 transition-colors"
          onclick={saveEdit}
          title="Save changes"
        >
          <Save class="h-4 w-4" />
        </button>
        <button
          class="p-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
          onclick={cancelEdit}
          title="Cancel"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    {/if}
  </div>

  <!-- Summary -->
  <div class="px-3 pb-3">
    {#if isEditing}
      <textarea
        bind:value={editedSummary}
        class="w-full p-2 rounded bg-surface-900 border border-surface-600 text-sm text-surface-200 resize-y min-h-[80px] focus:outline-none focus:border-primary-500"
        rows="4"
      ></textarea>
    {:else}
      <div class="p-2 rounded bg-surface-900/50 text-sm text-surface-300 leading-relaxed">
        {chapter.summary}
      </div>
    {/if}
  </div>

  <!-- Metadata Row -->
  <div class="px-3 pb-3 flex items-center justify-between gap-2 flex-wrap">
    <div class="flex items-center gap-3 text-xs text-surface-500">
      {#if timeRangeDisplay}
        <span class="flex items-center gap-1" title="Time span">
          <Clock class="h-3.5 w-3.5" />
          <span>{timeRangeDisplay}</span>
        </span>
      {/if}
      {#if chapter.emotionalTone}
        <span class="flex items-center gap-1" title="Emotional tone">
          <Theater class="h-3.5 w-3.5" />
          <span>{chapter.emotionalTone}</span>
        </span>
      {/if}
      {#if chapter.characters && chapter.characters.length > 0}
        <span class="flex items-center gap-1" title="Characters">
          <Users class="h-3.5 w-3.5" />
          <span>{chapter.characters.length}</span>
        </span>
      {/if}
      {#if chapter.locations && chapter.locations.length > 0}
        <span class="flex items-center gap-1" title="Locations">
          <MapPin class="h-3.5 w-3.5" />
          <span>{chapter.locations.length}</span>
        </span>
      {/if}
    </div>

    <!-- Expand Button -->
    <button
      class="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 transition-colors"
      onclick={toggleExpand}
    >
      {#if isExpanded}
        <ChevronDown class="h-4 w-4" />
      {:else}
        <ChevronRight class="h-4 w-4" />
      {/if}
      <span>{entries.length} entries</span>
    </button>
  </div>

  <!-- Entry List (Collapsible) -->
  {#if entries.length > 0}
    <div class="px-3 pb-3">
      <ChapterEntryList {entries} expanded={isExpanded} />
    </div>
  {/if}
</div>
