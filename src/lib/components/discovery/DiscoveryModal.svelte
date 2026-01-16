<script lang="ts">
  import { X, Search, Loader2, ChevronDown, Tag, Filter, Check, EyeOff, Eye, Blend } from 'lucide-svelte';
  import { discoveryService, type DiscoveryCard, type SearchResult } from '$lib/services/discovery';
  import DiscoveryCardComponent from './DiscoveryCard.svelte';
  import { characterVault } from '$lib/stores/characterVault.svelte';
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte';

  interface Props {
    isOpen: boolean;
    mode: 'character' | 'lorebook';
    onClose: () => void;
  }

  let { isOpen, mode, onClose }: Props = $props();

  // NSFW mode type
  type NsfwMode = 'disable' | 'blur' | 'enable';
  const NSFW_MODE_STORAGE_KEY = 'aventura:discovery:nsfwMode';

  // Load persisted NSFW mode
  function loadNsfwMode(): NsfwMode {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(NSFW_MODE_STORAGE_KEY);
      if (stored === 'blur' || stored === 'enable') {
        return stored;
      }
    }
    return 'disable';
  }

  // State
  let searchQuery = $state('');
  let activeProviderId = $state('all'); // 'all' for Search All, or provider id
  let results = $state<DiscoveryCard[]>([]);
  let isLoading = $state(false);
  let hasMore = $state(false);
  let currentPage = $state(1);
  let errorMessage = $state<string | null>(null);
  let nsfwMode = $state<NsfwMode>(loadNsfwMode());
  let hasInitialSearched = $state(false);

  // Track known imported items (URLs)
  let importedUrls = $derived.by(() => {
    const urls = new Set<string>();
    if (mode === 'character') {
      for (const c of characterVault.characters) {
        if (c.metadata?.sourceUrl) urls.add(String(c.metadata.sourceUrl));
      }
    } else {
      for (const lb of lorebookVault.lorebooks) {
        if (lb.metadata?.sourceUrl) urls.add(String(lb.metadata.sourceUrl));
      }
    }
    return urls;
  });

  // Persist settings
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(NSFW_MODE_STORAGE_KEY, nsfwMode);
    }
  });
  
  // Tag filtering
  let selectedTags = $state<string[]>([]);
  let tagInput = $state('');
  let showTagDropdown = $state(false);
  let showProviderDropdown = $state(false);
  let availableTags = $state<string[]>([]);
  let isLoadingTags = $state(false);

  // Derived
  let providers = $derived(discoveryService.getProviders(mode));
  let activeProviderName = $derived(
    activeProviderId === 'all' 
      ? 'All Sources' 
      : providers.find(p => p.id === activeProviderId)?.name || 'Unknown'
  );
  
  // Filter suggestions from available tags based on input
  let tagSuggestions = $derived(
    tagInput.trim() 
      ? availableTags.filter(t => 
          t.toLowerCase().includes(tagInput.toLowerCase()) && 
          !selectedTags.includes(t)
        ).slice(0, 15)
      : []
  );

  // Popular tags (subset of available tags for quick selection)
  let popularTags = $derived(
    availableTags.slice(0, 18)
  );

  // Fetch tags when modal opens or provider changes
  async function loadTags() {
    isLoadingTags = true;
    try {
      if (activeProviderId === 'all') {
        availableTags = await discoveryService.getAllTags(mode);
      } else {
        availableTags = await discoveryService.getTags(activeProviderId);
      }
      console.log(`[Discovery] Loaded ${availableTags.length} tags`);
    } catch (error) {
      console.error('[Discovery] Failed to load tags:', error);
      availableTags = [];
    } finally {
      isLoadingTags = false;
    }
  }

  // Load tags when modal opens and trigger initial search
  $effect(() => {
    if (isOpen) {
      loadTags();
      // Trigger initial search when modal first opens
      if (!hasInitialSearched) {
        hasInitialSearched = true;
        handleSearch();
      }
    } else {
      // Reset when modal closes
      hasInitialSearched = false;
    }
  });

  // Reload tags when provider changes
  $effect(() => {
    // Create dependency on activeProviderId
    const _providerId = activeProviderId;
    if (isOpen) {
      loadTags();
    }
  });

  // Reset state when mode changes
  $effect(() => {
    // Access mode to create dependency
    const _mode = mode;
    results = [];
    currentPage = 1;
    hasMore = false;
    errorMessage = null;
    selectedTags = [];
  });

  async function handleSearch() {
    isLoading = true;
    errorMessage = null;
    currentPage = 1;

    try {
      let result: SearchResult;
      const searchOptions = { 
        query: searchQuery, 
        page: 1, 
        limit: 48,
        tags: selectedTags.length > 0 ? selectedTags : undefined
      };
      
      if (activeProviderId === 'all') {
        result = await discoveryService.searchAll(searchOptions, mode);
      } else {
        result = await discoveryService.search(activeProviderId, searchOptions, mode);
      }
      
      results = result.cards;
      hasMore = result.hasMore;
      currentPage = result.nextPage || 1;
    } catch (error) {
      console.error('[Discovery] Search error:', error);
      errorMessage = error instanceof Error ? error.message : 'Search failed';
      results = [];
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (!hasMore || isLoading) return;

    isLoading = true;

    try {
      let result: SearchResult;
      
      if (activeProviderId === 'all') {
        // Use loadMoreAll for aggregated pagination
        result = await discoveryService.loadMoreAll(mode, 48);
      } else {
        const searchOptions = { 
          query: searchQuery, 
          page: currentPage, 
          limit: 48,
          tags: selectedTags.length > 0 ? selectedTags : undefined
        };
        result = await discoveryService.search(activeProviderId, searchOptions, mode);
        currentPage = result.nextPage || currentPage + 1;
      }
      
      results = [...results, ...result.cards];
      hasMore = result.hasMore;
    } catch (error) {
      console.error('[Discovery] Load more error:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to load more';
    } finally {
      isLoading = false;
    }
  }

  async function handleImport(card: DiscoveryCard) {
    if (card.imageUrl && importedUrls.has(card.imageUrl)) return;
    
    errorMessage = null;

    try {
      if (mode === 'character') {
        await characterVault.importFromDiscovery(card);
      } else {
        await lorebookVault.importFromDiscovery(card);
      }
      console.log('[Discovery] Started background import:', card.name);
    } catch (error) {
      console.error('[Discovery] Import error:', error);
      errorMessage = error instanceof Error ? error.message : 'Import failed';
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      if (showProviderDropdown) {
        showProviderDropdown = false;
      } else if (showTagDropdown) {
        showTagDropdown = false;
      } else {
        onClose();
      }
    }
  }

  function selectProvider(providerId: string) {
    activeProviderId = providerId;
    showProviderDropdown = false;
    results = [];
    hasMore = false;
    errorMessage = null;
  }

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter(t => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  function addCustomTag() {
    const tag = tagInput.trim();
    if (tag && !selectedTags.includes(tag)) {
      selectedTags = [...selectedTags, tag];
    }
    tagInput = '';
  }

  function removeTag(tag: string) {
    selectedTags = selectedTags.filter(t => t !== tag);
  }

  function clearTags() {
    selectedTags = [];
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="button"
    tabindex="-1"
  ></div>

  <!-- Modal -->
  <div class="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-surface-600 bg-surface-900 shadow-2xl sm:inset-8 lg:inset-16">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 px-4 py-3">
      <h2 class="text-lg font-semibold text-surface-100">
        Browse {mode === 'character' ? 'Characters' : 'Lorebooks'}
      </h2>
      <button
        onclick={onClose}
        class="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-700 hover:text-surface-200"
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Controls Bar -->
    <div class="relative z-30 flex flex-wrap items-center gap-3 border-b border-surface-700 px-4 py-3">
      <!-- Provider Dropdown -->
      <div class="relative">
        <button
          onclick={() => { showProviderDropdown = !showProviderDropdown; showTagDropdown = false; }}
          class="flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-200 transition-colors hover:border-surface-500 hover:bg-surface-700"
        >
          {#if activeProviderId !== 'all'}
            {@const provider = providers.find(p => p.id === activeProviderId)}
            {#if provider?.icon}
              <img src={provider.icon} alt="" class="h-4 w-4 rounded" />
            {/if}
          {/if}
          <span>{activeProviderName}</span>
          <ChevronDown class="h-4 w-4 text-surface-400" />
        </button>

        {#if showProviderDropdown}
          <div class="absolute left-0 top-full z-40 mt-1 min-w-[180px] rounded-lg border border-surface-600 bg-surface-800 py-1 shadow-xl">
            <!-- All Sources option -->
            <button
              onclick={() => selectProvider('all')}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-700"
              class:bg-surface-700={activeProviderId === 'all'}
              class:text-primary-400={activeProviderId === 'all'}
              class:text-surface-200={activeProviderId !== 'all'}
            >
              <Search class="h-4 w-4" />
              <span>All Sources</span>
              {#if activeProviderId === 'all'}
                <Check class="ml-auto h-4 w-4" />
              {/if}
            </button>
            
            <div class="my-1 border-t border-surface-700"></div>
            
            {#each providers as provider}
              <button
                onclick={() => selectProvider(provider.id)}
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-700"
                class:bg-surface-700={activeProviderId === provider.id}
                class:text-primary-400={activeProviderId === provider.id}
                class:text-surface-200={activeProviderId !== provider.id}
              >
                {#if provider.icon}
                  <img src={provider.icon} alt="" class="h-4 w-4 rounded" />
                {:else}
                  <div class="h-4 w-4 rounded bg-surface-600"></div>
                {/if}
                <span>{provider.name}</span>
                {#if activeProviderId === provider.id}
                  <Check class="ml-auto h-4 w-4" />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Tag Filter Button -->
      <div class="relative">
        <button
          onclick={() => { showTagDropdown = !showTagDropdown; showProviderDropdown = false; }}
          class="flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm transition-colors hover:border-surface-500 hover:bg-surface-700"
          class:border-primary-500={selectedTags.length > 0}
          class:text-primary-400={selectedTags.length > 0}
          class:text-surface-300={selectedTags.length === 0}
        >
          <Filter class="h-4 w-4" />
          <span>Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}</span>
          <ChevronDown class="h-4 w-4 text-surface-400" />
        </button>

        {#if showTagDropdown}
          <div class="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-surface-600 bg-surface-800 p-3 shadow-xl">
            <!-- Custom tag input -->
            <div class="mb-3">
              <div class="relative flex items-center">
                <input
                  type="text"
                  bind:value={tagInput}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (tagSuggestions.length > 0) {
                        toggleTag(tagSuggestions[0]);
                        tagInput = '';
                      } else {
                        addCustomTag();
                      }
                    }
                  }}
                  placeholder="Type to search tags..."
                  class="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 pr-10 text-sm text-surface-200 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onclick={addCustomTag}
                  disabled={!tagInput.trim()}
                  class="absolute right-1.5 rounded-md bg-surface-800 p-1.5 text-surface-400 transition-colors hover:bg-surface-700 hover:text-primary-400 disabled:opacity-0"
                  title="Add tag"
                >
                  <Check class="h-4 w-4" />
                </button>

                <!-- Autocomplete Dropdown -->
                {#if tagSuggestions.length > 0}
                  <div class="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-600 bg-surface-800 shadow-xl">
                    {#each tagSuggestions as suggestion}
                      <button
                        onclick={() => {
                          toggleTag(suggestion);
                          tagInput = '';
                        }}
                        class="w-full px-3 py-2 text-left text-sm text-surface-200 hover:bg-surface-700 hover:text-white"
                      >
                        {suggestion}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Selected tags -->
            {#if selectedTags.length > 0}
              <div class="mb-3">
                <div class="mb-1.5 flex items-center justify-between">
                  <span class="text-xs font-medium text-surface-400">Selected</span>
                  <button onclick={clearTags} class="text-xs text-surface-500 hover:text-surface-300">Clear all</button>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  {#each selectedTags as tag}
                    <button
                      onclick={() => removeTag(tag)}
                      class="flex items-center gap-1 rounded-full bg-primary-600/20 px-2 py-0.5 text-xs text-primary-400 transition-colors hover:bg-primary-600/30"
                    >
                      <Tag class="h-3 w-3" />
                      {tag}
                      <X class="h-3 w-3" />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Popular tags -->
            <div>
              <div class="mb-1.5 flex items-center gap-2">
                <span class="text-xs font-medium text-surface-400">Popular Tags</span>
                {#if isLoadingTags}
                  <Loader2 class="h-3 w-3 animate-spin text-surface-500" />
                {/if}
              </div>
              {#if popularTags.length > 0}
                <div class="flex flex-wrap gap-1.5">
                  {#each popularTags as tag}
                    <button
                      onclick={() => toggleTag(tag)}
                      class="rounded-full px-2 py-0.5 text-xs transition-colors"
                      class:bg-primary-600={selectedTags.includes(tag)}
                      class:text-white={selectedTags.includes(tag)}
                      class:bg-surface-700={!selectedTags.includes(tag)}
                      class:text-surface-300={!selectedTags.includes(tag)}
                      class:hover:bg-surface-600={!selectedTags.includes(tag)}
                    >
                      {tag}
                    </button>
                  {/each}
                </div>
              {:else if !isLoadingTags}
                <p class="text-xs text-surface-500">No tags available</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Divider -->
      <div class="h-6 w-px bg-surface-700 mx-1"></div>

      <!-- NSFW Mode Selector -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-surface-400">NSFW:</span>
        <div class="flex items-center gap-0.5 rounded-lg border border-surface-600 bg-surface-800 p-0.5">
          <button
            onclick={() => nsfwMode = 'disable'}
            class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
            class:bg-surface-600={nsfwMode === 'disable'}
            class:text-surface-100={nsfwMode === 'disable'}
            class:text-surface-400={nsfwMode !== 'disable'}
            class:hover:text-surface-200={nsfwMode !== 'disable'}
            title="Hide NSFW content"
          >
            <EyeOff class="h-3.5 w-3.5" />
            Hide
          </button>
          <button
            onclick={() => nsfwMode = 'blur'}
            class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
            class:bg-amber-600={nsfwMode === 'blur'}
            class:text-white={nsfwMode === 'blur'}
            class:text-surface-400={nsfwMode !== 'blur'}
            class:hover:text-amber-400={nsfwMode !== 'blur'}
            title="Blur NSFW images"
          >
            <Blend class="h-3.5 w-3.5" />
            Blur
          </button>
          <button
            onclick={() => nsfwMode = 'enable'}
            class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
            class:bg-red-600={nsfwMode === 'enable'}
            class:text-white={nsfwMode === 'enable'}
            class:text-surface-400={nsfwMode !== 'enable'}
            class:hover:text-red-400={nsfwMode !== 'enable'}
            title="Show NSFW content"
          >
            <Eye class="h-3.5 w-3.5" />
            Show
          </button>
        </div>
      </div>

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Search Bar -->
      <div class="flex gap-2">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            bind:value={searchQuery}
            onkeydown={handleKeyDown}
            placeholder="Search..."
            class="w-48 rounded-lg border border-surface-600 bg-surface-800 py-2 pl-10 pr-4 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-64"
          />
        </div>
        <button
          onclick={handleSearch}
          disabled={isLoading}
          class="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
        >
          {#if isLoading}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Search class="h-4 w-4" />
          {/if}
          Search
        </button>
      </div>
    </div>

    <!-- Active Tags Display (when tags are selected) -->
    {#if selectedTags.length > 0}
      <div class="flex items-center gap-2 border-b border-surface-700 bg-surface-800/50 px-4 py-2">
        <span class="text-xs text-surface-500">Filtering by:</span>
        <div class="flex flex-wrap gap-1.5">
          {#each selectedTags as tag}
            <span class="flex items-center gap-1 rounded-full bg-primary-600/20 px-2 py-0.5 text-xs text-primary-400">
              <Tag class="h-3 w-3" />
              {tag}
              <button onclick={() => removeTag(tag)} class="hover:text-primary-200">
                <X class="h-3 w-3" />
              </button>
            </span>
          {/each}
        </div>
        <button onclick={clearTags} class="ml-2 text-xs text-surface-500 hover:text-surface-300">Clear all</button>
      </div>
    {/if}

    <!-- Messages -->
    {#if errorMessage}
      <div class="mx-4 mt-3 rounded-lg border border-red-600/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
        {errorMessage}
      </div>
    {/if}

    <!-- Results Grid -->
    <div class="flex-1 overflow-y-auto p-4">
      {#if results.length === 0 && !isLoading}
        <div class="flex h-full flex-col items-center justify-center text-surface-500">
          <Search class="mb-2 h-12 w-12 opacity-50" />
          <p>Search to discover {mode === 'character' ? 'characters' : 'lorebooks'}</p>
          {#if activeProviderId === 'all'}
            <p class="mt-1 text-xs text-surface-600">Searching across all available sources</p>
          {/if}
        </div>
      {:else}
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {#each results as card (card.id)}
            <DiscoveryCardComponent
              {card}
              onImport={handleImport}
              isImported={!!card.imageUrl && importedUrls.has(card.imageUrl)}
              {nsfwMode}
            />
          {/each}
        </div>

        <!-- Load More -->
        {#if hasMore}
          <div class="mt-6 flex justify-center">
            <button
              onclick={loadMore}
              disabled={isLoading}
              class="flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800 px-6 py-2 text-surface-300 transition-colors hover:bg-surface-700 disabled:opacity-50"
            >
              {#if isLoading}
                <Loader2 class="h-4 w-4 animate-spin" />
              {/if}
              Load More
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
