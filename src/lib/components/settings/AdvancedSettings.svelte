<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte';
  import { ChevronDown, ChevronUp, RotateCcw, FolderOpen, BookOpen, Brain, Database, Search } from 'lucide-svelte';

  // Section visibility state
  let showLorebookImportSection = $state(false);
  let showLoreManagementSection = $state(false);
  let showClassifierSection = $state(false);
  let showMemorySection = $state(false);
  let showEntryRetrievalSection = $state(false);

  // Manual mode toggle handler
  async function handleManualModeToggle() {
    const next = !settings.advancedRequestSettings.manualMode;
    await settings.setAdvancedManualMode(next);
  }
</script>

<div class="space-y-4">
  <!-- Manual Request Mode -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-medium text-surface-200">Manual Request Mode</h3>
        <p class="text-xs text-surface-500">Edit full request body parameters for advanced models.</p>
      </div>
      <button
        class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
        class:bg-accent-600={settings.advancedRequestSettings.manualMode}
        class:bg-surface-600={!settings.advancedRequestSettings.manualMode}
        onclick={handleManualModeToggle}
        aria-label="Toggle manual request mode"
      >
        <span
          class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
          class:translate-x-6={settings.advancedRequestSettings.manualMode}
          class:translate-x-1={!settings.advancedRequestSettings.manualMode}
        ></span>
      </button>
    </div>
    {#if settings.advancedRequestSettings.manualMode}
      <p class="mt-2 text-xs text-amber-400/80">
        Manual mode uses your JSON overrides. Temperature and max token controls are locked.
      </p>
    {/if}
  </div>

  <!-- Debug Mode -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-sm font-medium text-surface-200">Debug Mode</h3>
        <p class="text-xs text-surface-500">Log API requests and responses for debugging.</p>
      </div>
      <button
        class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
        class:bg-accent-600={settings.uiSettings.debugMode}
        class:bg-surface-600={!settings.uiSettings.debugMode}
        onclick={() => settings.setDebugMode(!settings.uiSettings.debugMode)}
        aria-label="Toggle debug mode"
      >
        <span
          class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
          class:translate-x-6={settings.uiSettings.debugMode}
          class:translate-x-1={!settings.uiSettings.debugMode}
        ></span>
      </button>
    </div>
    {#if settings.uiSettings.debugMode}
      <p class="mt-2 text-xs text-amber-400/80">
        A debug button will appear to view request/response logs. Logs are session-only.
      </p>
    {/if}
  </div>

  <!-- Lorebook Import Settings (batch size, concurrency) -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <button
        class="flex items-center gap-2 text-left flex-1"
        onclick={() => showLorebookImportSection = !showLorebookImportSection}
      >
        <FolderOpen class="h-4 w-4 text-green-400" />
        <div>
          <h3 class="text-sm font-medium text-surface-200">Lorebook Import</h3>
          <p class="text-xs text-surface-500">Batch size and concurrency for lorebook classification</p>
        </div>
      </button>
      <div class="flex items-center gap-2">
        <button
          class="text-xs text-surface-400 hover:text-surface-200"
          onclick={() => settings.resetLorebookClassifierSettings()}
          title="Reset to default"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
        <button onclick={() => showLorebookImportSection = !showLorebookImportSection}>
          {#if showLorebookImportSection}
            <ChevronUp class="h-4 w-4 text-surface-400" />
          {:else}
            <ChevronDown class="h-4 w-4 text-surface-400" />
          {/if}
        </button>
      </div>
    </div>

    {#if showLorebookImportSection}
      <div class="mt-3 space-y-3 pl-6">
        <!-- Batch Size -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Batch Size: {settings.systemServicesSettings.lorebookClassifier?.batchSize ?? 50}
          </label>
          <input
            type="range"
            min="10"
            max="100"
            step="10"
            value={settings.systemServicesSettings.lorebookClassifier?.batchSize ?? 50}
            oninput={(e) => {
              settings.systemServicesSettings.lorebookClassifier.batchSize = parseInt(e.currentTarget.value);
              settings.saveSystemServicesSettings();
            }}
            class="w-full h-2"
          />
          <div class="flex justify-between text-xs text-surface-500">
            <span>Smaller batches (slower, more reliable)</span>
            <span>Larger batches (faster)</span>
          </div>
        </div>

        <!-- Max Concurrent -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Max Concurrent Requests: {settings.systemServicesSettings.lorebookClassifier?.maxConcurrent ?? 5}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={settings.systemServicesSettings.lorebookClassifier?.maxConcurrent ?? 5}
            oninput={(e) => {
              settings.systemServicesSettings.lorebookClassifier.maxConcurrent = parseInt(e.currentTarget.value);
              settings.saveSystemServicesSettings();
            }}
            class="w-full h-2"
          />
          <div class="flex justify-between text-xs text-surface-500">
            <span>Sequential (1)</span>
            <span>Parallel (10)</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Lore Management Settings (max iterations) -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <button
        class="flex items-center gap-2 text-left flex-1"
        onclick={() => showLoreManagementSection = !showLoreManagementSection}
      >
        <BookOpen class="h-4 w-4 text-purple-400" />
        <div>
          <h3 class="text-sm font-medium text-surface-200">Lore Management</h3>
          <p class="text-xs text-surface-500">Autonomous lore agent iteration limits</p>
        </div>
      </button>
      <div class="flex items-center gap-2">
        <button
          class="text-xs text-surface-400 hover:text-surface-200"
          onclick={() => settings.resetLoreManagementSettings()}
          title="Reset to default"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
        <button onclick={() => showLoreManagementSection = !showLoreManagementSection}>
          {#if showLoreManagementSection}
            <ChevronUp class="h-4 w-4 text-surface-400" />
          {:else}
            <ChevronDown class="h-4 w-4 text-surface-400" />
          {/if}
        </button>
      </div>
    </div>

    {#if showLoreManagementSection}
      <div class="mt-3 space-y-3 pl-6">
        <!-- Max Iterations -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Max Iterations: {settings.systemServicesSettings.loreManagement?.maxIterations ?? 50}
          </label>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={settings.systemServicesSettings.loreManagement?.maxIterations ?? 50}
            oninput={(e) => {
              settings.systemServicesSettings.loreManagement.maxIterations = parseInt(e.currentTarget.value);
              settings.saveSystemServicesSettings();
            }}
            class="w-full h-2"
          />
          <div class="flex justify-between text-xs text-surface-500">
            <span>Conservative (fewer changes)</span>
            <span>Extensive (more thorough)</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Classifier Settings (chat history truncation) -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <button
        class="flex items-center gap-2 text-left flex-1"
        onclick={() => showClassifierSection = !showClassifierSection}
      >
        <Brain class="h-4 w-4 text-cyan-400" />
        <div>
          <h3 class="text-sm font-medium text-surface-200">World State Classifier</h3>
          <p class="text-xs text-surface-500">Chat history truncation for entity extraction</p>
        </div>
      </button>
      <div class="flex items-center gap-2">
        <button
          class="text-xs text-surface-400 hover:text-surface-200"
          onclick={() => settings.resetClassifierSettings()}
          title="Reset to default"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
        <button onclick={() => showClassifierSection = !showClassifierSection}>
          {#if showClassifierSection}
            <ChevronUp class="h-4 w-4 text-surface-400" />
          {:else}
            <ChevronDown class="h-4 w-4 text-surface-400" />
          {/if}
        </button>
      </div>
    </div>

    {#if showClassifierSection}
      <div class="mt-3 space-y-3 pl-6">
        <!-- Chat History Truncation -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Chat History Truncation: {settings.systemServicesSettings.classifier?.chatHistoryTruncation ?? 0} words
          </label>
          <input
            type="range"
            min="0"
            max="500"
            step="50"
            value={settings.systemServicesSettings.classifier?.chatHistoryTruncation ?? 0}
            oninput={(e) => {
              settings.systemServicesSettings.classifier.chatHistoryTruncation = parseInt(e.currentTarget.value);
              settings.saveSystemServicesSettings();
            }}
            class="w-full h-2"
          />
          <div class="flex justify-between text-xs text-surface-500">
            <span>No limit (0)</span>
            <span>500 words max</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Memory Settings (prompts) -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <button
        class="flex items-center gap-2 text-left flex-1"
        onclick={() => showMemorySection = !showMemorySection}
      >
        <Database class="h-4 w-4 text-blue-400" />
        <div>
          <h3 class="text-sm font-medium text-surface-200">Memory Service</h3>
          <p class="text-xs text-surface-500">Custom prompts for memory operations</p>
        </div>
      </button>
      <div class="flex items-center gap-2">
        <button
          class="text-xs text-surface-400 hover:text-surface-200"
          onclick={() => settings.resetMemorySettings()}
          title="Reset to default"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
        <button onclick={() => showMemorySection = !showMemorySection}>
          {#if showMemorySection}
            <ChevronUp class="h-4 w-4 text-surface-400" />
          {:else}
            <ChevronDown class="h-4 w-4 text-surface-400" />
          {/if}
        </button>
      </div>
    </div>

    {#if showMemorySection}
      <div class="mt-3 space-y-3 pl-6">
        <!-- Chapter Analysis Prompt -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Chapter Analysis Prompt
          </label>
          <textarea
            class="textarea textarea-sm w-full bg-surface-800 border-surface-600 text-surface-100 min-h-24"
            value={settings.systemServicesSettings.memory?.chapterAnalysisPrompt ?? ''}
            oninput={(e) => {
              settings.systemServicesSettings.memory.chapterAnalysisPrompt = e.currentTarget.value;
              settings.saveSystemServicesSettings();
            }}
            placeholder="Enter custom chapter analysis prompt"
          />
        </div>

        <!-- Chapter Summarization Prompt -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Chapter Summarization Prompt
          </label>
          <textarea
            class="textarea textarea-sm w-full bg-surface-800 border-surface-600 text-surface-100 min-h-24"
            value={settings.systemServicesSettings.memory?.chapterSummarizationPrompt ?? ''}
            oninput={(e) => {
              settings.systemServicesSettings.memory.chapterSummarizationPrompt = e.currentTarget.value;
              settings.saveSystemServicesSettings();
            }}
            placeholder="Enter custom chapter summarization prompt"
          />
        </div>

        <!-- Retrieval Decision Prompt -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Retrieval Decision Prompt
          </label>
          <textarea
            class="textarea textarea-sm w-full bg-surface-800 border-surface-600 text-surface-100 min-h-24"
            value={settings.systemServicesSettings.memory?.retrievalDecisionPrompt ?? ''}
            oninput={(e) => {
              settings.systemServicesSettings.memory.retrievalDecisionPrompt = e.currentTarget.value;
              settings.saveSystemServicesSettings();
            }}
            placeholder="Enter custom retrieval decision prompt"
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Entry Retrieval Settings (tier 3 selection) -->
  <div class="border-b border-surface-700 pb-3">
    <div class="flex items-center justify-between">
      <button
        class="flex items-center gap-2 text-left flex-1"
        onclick={() => showEntryRetrievalSection = !showEntryRetrievalSection}
      >
        <Search class="h-4 w-4 text-amber-400" />
        <div>
          <h3 class="text-sm font-medium text-surface-200">Entry Retrieval</h3>
          <p class="text-xs text-surface-500">LLM-based lorebook entry selection settings</p>
        </div>
      </button>
      <div class="flex items-center gap-2">
        <button
          class="text-xs text-surface-400 hover:text-surface-200"
          onclick={() => settings.resetEntryRetrievalSettings()}
          title="Reset to default"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
        <button onclick={() => showEntryRetrievalSection = !showEntryRetrievalSection}>
          {#if showEntryRetrievalSection}
            <ChevronUp class="h-4 w-4 text-surface-400" />
          {:else}
            <ChevronDown class="h-4 w-4 text-surface-400" />
          {/if}
        </button>
      </div>
    </div>

    {#if showEntryRetrievalSection}
      <div class="mt-3 space-y-3 pl-6">
        <!-- Enable LLM Selection -->
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-surface-200">Enable LLM Selection</h3>
            <p class="text-xs text-surface-500">Use LLM to intelligently select lorebook entries</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
            class:bg-accent-600={settings.systemServicesSettings.entryRetrieval?.enableLLMSelection ?? true}
            class:bg-surface-600={!settings.systemServicesSettings.entryRetrieval?.enableLLMSelection ?? true}
            onclick={() => {
              settings.systemServicesSettings.entryRetrieval.enableLLMSelection = !settings.systemServicesSettings.entryRetrieval.enableLLMSelection;
              settings.saveSystemServicesSettings();
            }}
            aria-label="Toggle LLM selection"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              class:translate-x-6={settings.systemServicesSettings.entryRetrieval?.enableLLMSelection ?? true}
              class:translate-x-1={!settings.systemServicesSettings.entryRetrieval?.enableLLMSelection ?? true}
            ></span>
          </button>
        </div>

        <!-- Max Tier 3 Entries -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Max Tier 3 Entries: {settings.systemServicesSettings.entryRetrieval?.maxTier3Entries ?? 0}
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={settings.systemServicesSettings.entryRetrieval?.maxTier3Entries ?? 0}
            oninput={(e) => {
              settings.systemServicesSettings.entryRetrieval.maxTier3Entries = parseInt(e.currentTarget.value);
              settings.saveSystemServicesSettings();
            }}
            class="w-full h-2"
          />
          <div class="flex justify-between text-xs text-surface-500">
            <span>Unlimited (0)</span>
            <span>20 max</span>
          </div>
        </div>

        <!-- Max Words Per Entry -->
        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Max Words Per Entry: {settings.systemServicesSettings.entryRetrieval?.maxWordsPerEntry ?? 0}
          </label>
          <input
            type="range"
            min="0"
            max="1000"
            step="50"
            value={settings.systemServicesSettings.entryRetrieval?.maxWordsPerEntry ?? 0}
            oninput={(e) => {
              settings.systemServicesSettings.entryRetrieval.maxWordsPerEntry = parseInt(e.currentTarget.value);
              settings.saveSystemServicesSettings();
            }}
            class="w-full h-2"
          />
          <div class="flex justify-between text-xs text-surface-500">
            <span>Unlimited (0)</span>
            <span>1000 words max</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <p class="text-xs text-surface-500 pt-2">
    Model configurations for all agents are managed in the Generation tab under Agent Profiles.
  </p>
</div>
