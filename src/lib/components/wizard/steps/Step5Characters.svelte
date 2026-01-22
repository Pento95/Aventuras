<script lang="ts">
  import { slide } from "svelte/transition";
  import {
    Archive,
    Loader2,
    Check,
    Sparkles,
    X,
    PenTool,
    User,
    RefreshCw,
    ChevronDown,
    Send,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import type { VaultCharacter } from "$lib/types";
  import type {
    ExpandedSetting,
    GeneratedProtagonist,
    StoryMode,
  } from "../wizardTypes";

  interface Props {
    selectedMode: StoryMode;
    expandedSetting: ExpandedSetting | null;
    protagonist: GeneratedProtagonist | null;

    // Manual protagonist input
    manualCharacterName: string;
    manualCharacterDescription: string;
    manualCharacterBackground: string;
    manualCharacterMotivation: string;
    manualCharacterTraits: string;
    characterElaborationGuidance: string;

    // Loading states
    isGeneratingProtagonist: boolean;
    isElaboratingCharacter: boolean;
    protagonistError: string | null;

    // Vault states
    savedToVaultConfirm: boolean;

    // Manual input handlers
    onManualNameChange: (value: string) => void;
    onManualDescriptionChange: (value: string) => void;
    onManualBackgroundChange: (value: string) => void;
    onManualMotivationChange: (value: string) => void;
    onManualTraitsChange: (value: string) => void;
    onCharacterGuidanceChange: (value: string) => void;

    // Action handlers
    onUseManualCharacter: () => void;
    onElaborateCharacter: () => void;
    onElaborateCharacterFurther: () => void;
    onGenerateProtagonist: () => void;
    onSaveToVault: () => void;

    // Vault handlers
    onSelectProtagonistFromVault: (character: VaultCharacter) => void;
    onNavigateToVault?: () => void;
  }

  let {
    selectedMode,
    expandedSetting,
    protagonist,
    manualCharacterName,
    manualCharacterDescription,
    manualCharacterBackground,
    manualCharacterMotivation,
    manualCharacterTraits,
    characterElaborationGuidance,
    isGeneratingProtagonist,
    isElaboratingCharacter,
    protagonistError,
    savedToVaultConfirm,
    onManualNameChange,
    onManualDescriptionChange,
    onManualBackgroundChange,
    onManualMotivationChange,
    onManualTraitsChange,
    onCharacterGuidanceChange,
    onUseManualCharacter,
    onElaborateCharacter,
    onElaborateCharacterFurther,
    onGenerateProtagonist,
    onSaveToVault,
    onSelectProtagonistFromVault,
    onNavigateToVault,
  }: Props = $props();

  // Local state
  let showAdjustWithAI = $state(false);
  let loadedVaultCharacterId = $state<string | null>(null);
  let isEditingProtagonist = $state(false);
  let editName = $state("");
  let editDescription = $state("");
  let editBackground = $state("");
  let editMotivation = $state("");
  let editTraits = $state("");

  const hasVaultCharacters = $derived(
    characterVault.isLoaded && characterVault.characters.length > 0,
  );

  function handleSelectFromVault(character: VaultCharacter) {
    loadedVaultCharacterId = character.id;
    onSelectProtagonistFromVault(character);
  }

  // Inline editing functions
  function handleStartEdit() {
    if (protagonist) {
      editName = protagonist.name;
      editDescription = protagonist.description;
      editBackground = protagonist.background ?? "";
      editMotivation = protagonist.motivation ?? "";
      editTraits = protagonist.traits?.join(", ") ?? "";
      isEditingProtagonist = true;
    }
  }

  function handleSaveEdit() {
    if (editName.trim()) {
      onManualNameChange(editName);
      onManualDescriptionChange(editDescription);
      onManualBackgroundChange(editBackground);
      onManualMotivationChange(editMotivation);
      onManualTraitsChange(editTraits);
      onUseManualCharacter();
    }
    isEditingProtagonist = false;
  }

  function handleCancelEdit() {
    isEditingProtagonist = false;
  }
</script>

<div class="space-y-4">
  {#if !expandedSetting}
    <div class="card bg-amber-500/10 border-amber-500/30 p-4">
      <p class="text-sm text-amber-400">
        Go back to Step 4 and expand your setting first. This helps create a
        more fitting character.
      </p>
    </div>
  {:else}
    <!-- SECTION 1: Character Input -->
    <div class="space-y-2">
      <p class="text-surface-400 text-xs">
        {selectedMode === "adventure"
          ? "Create or describe your character for this adventure."
          : "Define the main character for your story."}
      </p>

      {#if protagonistError}
        <p class="text-sm text-red-400">{protagonistError}</p>
      {/if}

      <!-- Character Input Form - All fields visible -->
      <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Name</label
            >
            <input
              type="text"
              value={manualCharacterName}
              oninput={(e) => onManualNameChange(e.currentTarget.value)}
              placeholder="e.g., Alex, Jordan, Sam..."
              class="input"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Motivation</label
            >
            <input
              type="text"
              value={manualCharacterMotivation}
              oninput={(e) => onManualMotivationChange(e.currentTarget.value)}
              placeholder="What drives them?"
              class="input"
            />
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400"
            >Description</label
          >
          <textarea
            value={manualCharacterDescription}
            oninput={(e) => onManualDescriptionChange(e.currentTarget.value)}
            placeholder="Physical appearance, demeanor, notable features..."
            class="input min-h-[60px] resize-none"
            rows="2"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Background</label
            >
            <textarea
              value={manualCharacterBackground}
              oninput={(e) => onManualBackgroundChange(e.currentTarget.value)}
              placeholder="Where they come from, their history..."
              class="input min-h-[60px] resize-none"
              rows="2"
            ></textarea>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Traits (comma-separated)</label
            >
            <textarea
              value={manualCharacterTraits}
              oninput={(e) => onManualTraitsChange(e.currentTarget.value)}
              placeholder="e.g., brave, curious, stubborn..."
              class="input min-h-[60px] resize-none"
              rows="2"
            ></textarea>
          </div>
        </div>

        <!-- Action Row: Adjust with AI dropdown + Use button -->
        <div class="flex items-center gap-2">
          <!-- Adjust with AI Toggle -->
          <button
            class="h-9 flex-1 flex items-center justify-between px-3 rounded-lg border border-surface-600 bg-surface-800 text-sm text-surface-300 hover:border-surface-500 transition-colors"
            onclick={() => (showAdjustWithAI = !showAdjustWithAI)}
          >
            <span class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-accent-400" />
              <span>Adjust with AI</span>
            </span>
            <ChevronDown
              class="h-4 w-4 text-surface-500 transition-transform {showAdjustWithAI
                ? 'rotate-180'
                : ''}"
            />
          </button>

          <!-- Use/Send Button -->
          <button
            class="h-9 flex items-center justify-center gap-2 px-4 min-w-[36px] rounded-lg bg-accent-600 text-surface-100 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-surface-500 disabled:cursor-not-allowed transition-colors"
            onclick={onUseManualCharacter}
            disabled={!manualCharacterName.trim()}
            title="Use this character"
          >
            <Send class="h-4 w-4 shrink-0" />
            <span class="hidden sm:inline">Use</span>
          </button>
        </div>

        <!-- Adjust with AI Dropdown -->
        {#if showAdjustWithAI}
          <div
            class="card bg-surface-900 p-3 space-y-3"
            transition:slide={{ duration: 150 }}
          >
            <div>
              <label class="mb-1 block text-xs font-medium text-surface-400">
                Describe what you want to adjust (optional)
              </label>
              <textarea
                value={characterElaborationGuidance}
                oninput={(e) =>
                  onCharacterGuidanceChange(e.currentTarget.value)}
                placeholder="e.g., Make them more cynical, add a tragic backstory, focus on their combat skills..."
                class="input min-h-[60px] resize-none text-sm"
                rows="2"
              ></textarea>
            </div>

            <div class="flex flex-wrap gap-2 pt-2 border-t border-surface-700">
              <button
                class="btn btn-primary btn-sm flex items-center justify-center gap-2"
                onclick={onElaborateCharacter}
                disabled={isElaboratingCharacter ||
                  (!manualCharacterName.trim() &&
                    !manualCharacterDescription.trim() &&
                    !manualCharacterBackground.trim())}
                title="Have AI expand on your character details"
              >
                {#if isElaboratingCharacter}
                  <Loader2 class="h-3 w-3 animate-spin" />
                  <span>Expanding...</span>
                {:else}
                  <Sparkles class="h-3 w-3" />
                  <span>Expand with AI</span>
                {/if}
              </button>
              <button
                class="btn btn-secondary btn-sm flex items-center justify-center gap-2"
                onclick={onGenerateProtagonist}
                disabled={isGeneratingProtagonist}
                title="Generate a completely new character from scratch"
              >
                {#if isGeneratingProtagonist}
                  <RefreshCw class="h-3 w-3 animate-spin" />
                  <span>Generating...</span>
                {:else}
                  <RefreshCw class="h-3 w-3" />
                  <span class="sm:hidden">Generate</span>
                  <span class="hidden sm:inline">Generate New</span>
                {/if}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- DIVIDER: Load from Vault -->
    <div class="flex items-center justify-center gap-3">
      <div class="h-px flex-1 bg-surface-700"></div>
      <span class="text-xs text-surface-500 flex items-center gap-1">
        <Archive class="h-3 w-3" />
        Or load from vault
      </span>
      <div class="h-px flex-1 bg-surface-700"></div>
    </div>

    <!-- SECTION 2: Load from Vault -->
    <div class="space-y-1 max-h-[15rem] overflow-y-auto">
      {#if hasVaultCharacters}
        <p class="text-surface-400 text-xs">
          Select a previously saved protagonist.
        </p>
      {/if}
      <div class="-mt-3">
        <UniversalVaultBrowser
          type="character"
          onSelect={handleSelectFromVault}
          selectedId={loadedVaultCharacterId}
          {onNavigateToVault}
        />
      </div>
    </div>

    <!-- DIVIDER: Selected Character (only shows when selected) -->
    {#if protagonist}
      <div class="flex items-center justify-center gap-3">
        <div class="h-px flex-1 bg-surface-700"></div>
        <span class="text-xs text-surface-500 flex items-center gap-1">
          <Check class="h-3 w-3" />
          Selected Character
        </span>
        <div class="h-px flex-1 bg-surface-700"></div>
      </div>
    {/if}

    <!-- SECTION 3: Selected Character Display -->
    {#if protagonist}
      <div
        class="card bg-surface-900 p-3 space-y-2"
        transition:slide={{ duration: 200 }}
      >
        <!-- Header with actions -->
        <div class="flex items-center gap-5">
          <span class="text-sm font-medium text-surface-100">
            {protagonist.name}
          </span>
          <div class="flex-1"></div>
          <button
            class="flex items-center gap-1.5 rounded hover:bg-surface-700 transition-colors text-xs font-medium {savedToVaultConfirm
              ? 'text-green-400'
              : 'text-surface-400 hover:text-green-400'}"
            onclick={onSaveToVault}
            disabled={savedToVaultConfirm}
            title={savedToVaultConfirm ? "Saved!" : "Save to vault"}
          >
            {#if savedToVaultConfirm}
              <Check class="h-3.5 w-3.5" />
              <span>Saved</span>
            {:else}
              <Archive class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Save to Vault</span>
            {/if}
          </button>
          <button
            class="flex items-center gap-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-100 transition-colors text-xs font-medium"
            onclick={isEditingProtagonist ? handleSaveEdit : handleStartEdit}
            title={isEditingProtagonist ? "Save" : "Edit"}
          >
            {#if isEditingProtagonist}
              <Check class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Save</span>
            {:else}
              <PenTool class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Edit</span>
            {/if}
          </button>
          {#if isEditingProtagonist}
            <button
              class="flex items-center gap-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-100 transition-colors text-xs font-medium"
              onclick={handleCancelEdit}
              title="Cancel"
            >
              <X class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Cancel</span>
            </button>
          {/if}
          <button
            class="flex items-center gap-1.5 rounded hover:bg-surface-700 text-accent-400 hover:text-accent-300 transition-colors text-xs font-medium"
            onclick={onElaborateCharacterFurther}
            disabled={isElaboratingCharacter}
            title="Refine with AI"
          >
            <Sparkles
              class="h-3.5 w-3.5 {isElaboratingCharacter ? 'animate-pulse' : ''}"
            />
            <span class="hidden sm:inline">Refine</span>
          </button>
        </div>

        <!-- Content (view or edit mode) -->
        {#if isEditingProtagonist}
          <div class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs font-medium text-surface-400"
                  >Name</label
                >
                <input type="text" bind:value={editName} class="input text-sm" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-surface-400"
                  >Motivation</label
                >
                <input
                  type="text"
                  bind:value={editMotivation}
                  class="input text-sm"
                />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-surface-400"
                >Description</label
              >
              <textarea
                bind:value={editDescription}
                class="input min-h-[80px] resize-y text-sm"
                rows="3"
              ></textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs font-medium text-surface-400"
                  >Background</label
                >
                <textarea
                  bind:value={editBackground}
                  class="input min-h-[60px] resize-none text-sm"
                  rows="2"
                ></textarea>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-surface-400"
                  >Traits (comma-separated)</label
                >
                <textarea
                  bind:value={editTraits}
                  class="input min-h-[60px] resize-none text-sm"
                  rows="2"
                ></textarea>
              </div>
            </div>
          </div>
        {:else}
          <p class="text-sm text-surface-300 whitespace-pre-wrap">
            {protagonist.description}
          </p>
          {#if protagonist.background}
            <p class="text-sm text-surface-400">
              <strong>Background:</strong>
              {protagonist.background}
            </p>
          {/if}
          {#if protagonist.motivation}
            <p class="text-sm text-surface-400">
              <strong>Motivation:</strong>
              {protagonist.motivation}
            </p>
          {/if}
          {#if protagonist.traits && protagonist.traits.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each protagonist.traits as trait}
                <span
                  class="px-2 py-0.5 rounded-full bg-primary-500/20 text-xs text-primary-300 border border-primary-500/30"
                  >{trait}</span
                >
              {/each}
            </div>
          {/if}

          <!-- Refinement input -->
          <input
            type="text"
            value={characterElaborationGuidance}
            oninput={(e) => onCharacterGuidanceChange(e.currentTarget.value)}
            placeholder="Refinement notes (optional)..."
            class="input text-sm py-1.5"
          />
        {/if}
      </div>
    {/if}
  {/if}
</div>
