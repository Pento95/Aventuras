<script lang="ts">
  import { slide } from "svelte/transition";
  import {
    Archive,
    Loader2,
    Check,
    Sparkles,
    X,
    PenTool,
    Users,
    Plus,
    Trash2,
    ChevronDown,
    Send,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import type { VaultCharacter } from "$lib/types";
  import type {
    GeneratedProtagonist,
    GeneratedCharacter,
  } from "../wizardTypes";

  interface Props {
    protagonist: GeneratedProtagonist | null;
    supportingCharacters: GeneratedCharacter[];

    // Supporting character form
    showSupportingCharacterForm: boolean;
    editingSupportingCharacterIndex: number | null;
    supportingCharacterName: string;
    supportingCharacterRole: string;
    supportingCharacterDescription: string;
    supportingCharacterRelationship: string;
    supportingCharacterTraits: string;
    supportingCharacterGuidance: string;

    // Loading states
    isGeneratingCharacters: boolean;
    isElaboratingSupportingCharacter: boolean;

    // Form handlers
    onSupportingNameChange: (value: string) => void;
    onSupportingRoleChange: (value: string) => void;
    onSupportingDescriptionChange: (value: string) => void;
    onSupportingRelationshipChange: (value: string) => void;
    onSupportingTraitsChange: (value: string) => void;
    onSupportingGuidanceChange: (value: string) => void;

    // Action handlers
    onOpenSupportingForm: () => void;
    onEditSupportingCharacter: (index: number) => void;
    onCancelSupportingForm: () => void;
    onUseSupportingAsIs: () => void;
    onElaborateSupportingCharacter: () => void;
    onDeleteSupportingCharacter: (index: number) => void;
    onGenerateCharacters: () => void;

    // Vault handlers
    onSelectSupportingFromVault: (character: VaultCharacter) => void;
    onNavigateToVault?: () => void;
  }

  let {
    protagonist,
    supportingCharacters,
    showSupportingCharacterForm,
    editingSupportingCharacterIndex,
    supportingCharacterName,
    supportingCharacterRole,
    supportingCharacterDescription,
    supportingCharacterRelationship,
    supportingCharacterTraits,
    supportingCharacterGuidance,
    isGeneratingCharacters,
    isElaboratingSupportingCharacter,
    onSupportingNameChange,
    onSupportingRoleChange,
    onSupportingDescriptionChange,
    onSupportingRelationshipChange,
    onSupportingTraitsChange,
    onSupportingGuidanceChange,
    onOpenSupportingForm,
    onEditSupportingCharacter,
    onCancelSupportingForm,
    onUseSupportingAsIs,
    onElaborateSupportingCharacter,
    onDeleteSupportingCharacter,
    onGenerateCharacters,
    onSelectSupportingFromVault,
    onNavigateToVault,
  }: Props = $props();

  // Local state
  let showAdjustWithAI = $state(false);
  let loadedVaultCharacterId = $state<string | null>(null);

  const hasVaultCharacters = $derived(
    characterVault.isLoaded && characterVault.characters.length > 0,
  );

  const addedVaultCharacterIds = $derived(
    supportingCharacters
      .map((c) => c.vaultId)
      .filter((id): id is string => !!id),
  );

  function handleSelectFromVault(character: VaultCharacter) {
    loadedVaultCharacterId = character.id;
    onSelectSupportingFromVault(character);
  }
</script>

<div class="space-y-4">
  <!-- SECTION 1: Add Supporting Character -->
  <div class="space-y-2">
    <p class="text-surface-400 text-xs">
      Add side characters, allies, or antagonists to enrich your story. This
      step is optional.
    </p>

    <!-- Quick Action Buttons -->
    <div class="flex flex-wrap gap-2">
      <button
        class="h-9 flex items-center justify-center gap-2 px-3 rounded-lg border border-surface-600 bg-surface-800 text-sm text-surface-300 hover:border-surface-500 transition-colors"
        onclick={onOpenSupportingForm}
        disabled={showSupportingCharacterForm}
      >
        <Plus class="h-4 w-4" />
        <span>Add Manually</span>
      </button>
      <button
        class="h-9 flex items-center justify-center gap-2 px-3 rounded-lg border border-surface-600 bg-surface-800 text-sm text-surface-300 hover:border-surface-500 transition-colors"
        onclick={onGenerateCharacters}
        disabled={isGeneratingCharacters || !protagonist}
        title={!protagonist
          ? "Create a protagonist first"
          : "Generate 3 AI characters"}
      >
        {#if isGeneratingCharacters}
          <Loader2 class="h-4 w-4 animate-spin" />
          <span>Generating...</span>
        {:else}
          <Sparkles class="h-4 w-4 text-accent-400" />
          <span class="hidden sm:inline">Generate 3 with AI</span>
          <span class="sm:hidden">Gen 3</span>
        {/if}
      </button>
    </div>

    <!-- Supporting Character Form -->
    {#if showSupportingCharacterForm}
      <div
        class="card bg-surface-900 p-3 space-y-3"
        transition:slide={{ duration: 150 }}
      >
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Name</label
            >
            <input
              type="text"
              value={supportingCharacterName}
              oninput={(e) => onSupportingNameChange(e.currentTarget.value)}
              placeholder="e.g., Lady Vivienne"
              class="input"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Role</label
            >
            <input
              type="text"
              value={supportingCharacterRole}
              oninput={(e) => onSupportingRoleChange(e.currentTarget.value)}
              placeholder="e.g., ally, antagonist, mentor..."
              class="input"
            />
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400"
            >Description</label
          >
          <textarea
            value={supportingCharacterDescription}
            oninput={(e) =>
              onSupportingDescriptionChange(e.currentTarget.value)}
            placeholder="Physical appearance, personality, notable features..."
            class="input min-h-[60px] resize-none"
            rows="2"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Relationship to Protagonist</label
            >
            <input
              type="text"
              value={supportingCharacterRelationship}
              oninput={(e) =>
                onSupportingRelationshipChange(e.currentTarget.value)}
              placeholder="e.g., Childhood friend, rival..."
              class="input"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400"
              >Traits (comma-separated)</label
            >
            <input
              type="text"
              value={supportingCharacterTraits}
              oninput={(e) => onSupportingTraitsChange(e.currentTarget.value)}
              placeholder="e.g., cunning, loyal, mysterious..."
              class="input"
            />
          </div>
        </div>

        <!-- Adjust with AI Toggle -->
        <button
          class="h-9 w-full flex items-center justify-between px-3 rounded-lg border border-surface-600 bg-surface-800 text-sm text-surface-300 hover:border-surface-500 transition-colors"
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

        <!-- Adjust with AI Dropdown -->
        {#if showAdjustWithAI}
          <div
            class="bg-surface-900 space-y-3"
            transition:slide={{ duration: 150 }}
          >
            <div>
              <label class="mb-1 block text-xs font-medium text-surface-400">
                Describe what you want to adjust (optional)
              </label>
              <textarea
                value={supportingCharacterGuidance}
                oninput={(e) =>
                  onSupportingGuidanceChange(e.currentTarget.value)}
                placeholder="e.g., Make them more sinister, add a hidden agenda..."
                class="input min-h-[60px] resize-none text-sm"
                rows="2"
              ></textarea>
            </div>

            <div class="flex justify-end !mt-1">
              <button
                class="h-8 flex items-center justify-center gap-2 px-3 rounded-lg border border-surface-600 bg-surface-800 text-xs font-medium text-surface-300 hover:text-surface-100 hover:border-surface-500 transition-colors"
                onclick={onElaborateSupportingCharacter}
                disabled={isElaboratingSupportingCharacter ||
                  (!supportingCharacterName.trim() &&
                    !supportingCharacterDescription.trim())}
                title="Have AI expand on character details"
              >
                {#if isElaboratingSupportingCharacter}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                  <span>Expanding...</span>
                {:else}
                  <Sparkles class="h-3.5 w-3.5 text-accent-400" />
                  <span>Expand with AI</span>
                {/if}
              </button>
            </div>
          </div>
        {/if}

        <div class="h-px w-full bg-surface-700"></div>

        <!-- Action Row: Cancel + Use button -->
        <div class="flex items-center justify-between gap-2">
          <!-- Cancel Button -->
          <button
            class="h-9 flex items-center justify-center gap-2 px-3 rounded-lg border border-surface-600 bg-surface-800 text-sm text-surface-300 hover:border-surface-500 transition-colors"
            onclick={onCancelSupportingForm}
          >
            <X class="h-4 w-4" />
            <span class="hidden sm:inline">Cancel</span>
          </button>

          <!-- Use/Send Button -->
          <button
            class="h-9 flex items-center justify-center gap-2 px-4 min-w-[36px] rounded-lg bg-accent-600 text-surface-100 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-surface-500 disabled:cursor-not-allowed transition-colors"
            onclick={onUseSupportingAsIs}
            disabled={!supportingCharacterName.trim()}
            title="Use this character"
          >
            <Send class="h-4 w-4 shrink-0" />
            <span class="hidden sm:inline">Use</span>
          </button>
        </div>
      </div>
    {/if}
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
        Select a previously saved supporting character.
      </p>
    {/if}
    <div class="-mt-3">
      <UniversalVaultBrowser
        type="character"
        onSelect={handleSelectFromVault}
        selectedId={loadedVaultCharacterId}
        disabledIds={addedVaultCharacterIds}
        {onNavigateToVault}
      />
    </div>
  </div>

  <!-- DIVIDER: Added Characters (only shows when we have some) -->
  {#if supportingCharacters.length > 0}
    <div class="flex items-center justify-center gap-3">
      <div class="h-px flex-1 bg-surface-700"></div>
      <span class="text-xs text-surface-500 flex items-center gap-1">
        <Check class="h-3 w-3" />
        Added Characters ({supportingCharacters.length})
      </span>
      <div class="h-px flex-1 bg-surface-700"></div>
    </div>
  {/if}

  <!-- SECTION 3: Supporting Character List -->
  {#if supportingCharacters.length > 0}
    <div class="space-y-2">
      {#each supportingCharacters as char, index (index)}
        <div
          class="card bg-surface-900 p-3"
          transition:slide={{ duration: 150 }}
        >
          <div class="flex items-center gap-5">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <span class="font-medium text-surface-100 truncate"
                >{char.name}</span
              >
              <span
                class="text-xs px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400 shrink-0"
                >{char.role}</span
              >
            </div>
            <button
              class="flex items-center gap-1.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-100 transition-colors text-xs font-medium"
              onclick={() => onEditSupportingCharacter(index)}
              title="Edit"
            >
              <PenTool class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Edit</span>
            </button>
            <button
              class="flex items-center gap-1.5 rounded hover:bg-surface-700 text-red-400 hover:text-red-300 transition-colors text-xs font-medium"
              onclick={() => onDeleteSupportingCharacter(index)}
              title="Delete"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Delete</span>
            </button>
          </div>
          <p class="text-sm text-surface-300 mt-2">
            {char.description}
          </p>
          {#if char.relationship}
            <p class="text-xs text-surface-400 mt-1">
              {char.relationship}
            </p>
          {/if}
          {#if char.traits && char.traits.length > 0}
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each char.traits as trait}
                <span
                  class="px-2 py-0.5 rounded-full bg-surface-800 text-xs text-surface-300 border border-surface-700"
                  >{trait}</span
                >
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
