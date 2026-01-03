<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { Plus, Target, CheckCircle, XCircle, Circle } from 'lucide-svelte';
  import type { StoryBeat } from '$lib/types';

  let showAddForm = $state(false);
  let newTitle = $state('');
  let newDescription = $state('');
  let newType = $state<StoryBeat['type']>('quest');

  async function addBeat() {
    if (!newTitle.trim()) return;
    await story.addStoryBeat(newTitle.trim(), newType, newDescription.trim() || undefined);
    newTitle = '';
    newDescription = '';
    newType = 'quest';
    showAddForm = false;
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pending': return Circle;
      case 'active': return Target;
      case 'completed': return CheckCircle;
      case 'failed': return XCircle;
      default: return Circle;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'text-surface-500';
      case 'active': return 'text-amber-400';
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      default: return 'text-surface-400';
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'milestone': return 'Milestone';
      case 'quest': return 'Quest';
      case 'revelation': return 'Revelation';
      case 'event': return 'Event';
      case 'plot_point': return 'Plot Point';
      default: return type;
    }
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="font-medium text-surface-200">Story Beats</h3>
    <button
      class="btn-ghost rounded p-1"
      onclick={() => showAddForm = !showAddForm}
      title="Add story beat"
    >
      <Plus class="h-4 w-4" />
    </button>
  </div>

  {#if showAddForm}
    <div class="card space-y-2">
      <input
        type="text"
        bind:value={newTitle}
        placeholder="Title"
        class="input text-sm"
      />
      <select bind:value={newType} class="input text-sm">
        <option value="quest">Quest</option>
        <option value="milestone">Milestone</option>
        <option value="revelation">Revelation</option>
        <option value="event">Event</option>
      </select>
      <textarea
        bind:value={newDescription}
        placeholder="Description (optional)"
        class="input text-sm"
        rows="2"
      ></textarea>
      <div class="flex justify-end gap-2">
        <button class="btn btn-secondary text-xs" onclick={() => showAddForm = false}>
          Cancel
        </button>
        <button class="btn btn-primary text-xs" onclick={addBeat} disabled={!newTitle.trim()}>
          Add
        </button>
      </div>
    </div>
  {/if}

  <!-- Active quests -->
  {#if story.pendingQuests.length > 0}
    <div class="space-y-2">
      <h4 class="text-sm font-medium text-surface-400">Active</h4>
      {#each story.pendingQuests as beat (beat.id)}
        {@const StatusIcon = getStatusIcon(beat.status)}
        <div class="card p-3">
          <div class="flex items-start gap-2">
            <div class={getStatusColor(beat.status)}>
              <StatusIcon class="h-5 w-5" />
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-surface-100">{beat.title}</span>
                <span class="rounded-full bg-surface-700 px-2 py-0.5 text-xs text-surface-400">
                  {getTypeLabel(beat.type)}
                </span>
              </div>
              {#if beat.description}
                <p class="mt-1 text-sm text-surface-400">{beat.description}</p>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if story.storyBeats.length === 0}
    <p class="py-4 text-center text-sm text-surface-500">
      No story beats yet
    </p>
  {:else}
    <!-- Completed/Failed -->
    {@const completedBeats = story.storyBeats.filter(b => b.status === 'completed' || b.status === 'failed')}
    {#if completedBeats.length > 0}
      <div class="space-y-2">
        <h4 class="text-sm font-medium text-surface-400">History</h4>
        {#each completedBeats as beat (beat.id)}
          {@const StatusIcon = getStatusIcon(beat.status)}
          <div class="card p-3 opacity-60">
            <div class="flex items-center gap-2">
              <div class={getStatusColor(beat.status)}>
                <StatusIcon class="h-4 w-4" />
              </div>
              <span class="text-surface-300">{beat.title}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
