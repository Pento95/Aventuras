<script lang="ts" generics="T">
  import { Search } from "lucide-svelte";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import EmptyState from "$lib/components/ui/empty-state/empty-state.svelte";
  import type { Snippet } from "svelte";

  interface Props {
    items: T[];
    isLoading?: boolean;
    searchPlaceholder?: string;
    
    // Empty State configuration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emptyIcon: any;
    emptyTitle: string;
    emptyDescription?: string;
    onNavigateToVault?: () => void;
    
    // Logic
    filterItem: (item: T, query: string) => boolean;
    sortItems?: (a: T, b: T) => number;
    
    // Render
    renderItem: Snippet<[T]>;
    key: (item: T) => string;
  }

  let {
    items,
    isLoading = false,
    searchPlaceholder = "Search...",
    emptyIcon,
    emptyTitle,
    emptyDescription = "No items found in vault",
    onNavigateToVault,
    filterItem,
    sortItems,
    renderItem,
    key
  }: Props = $props();

  let searchQuery = $state("");

  const filteredItems = $derived.by(() => {
    let result = items;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => filterItem(item, query));
    }

    if (sortItems) {
      return [...result].sort(sortItems);
    }
    
    return result;
  });

  const hasItems = $derived(items.length > 0);
</script>

<div class="space-y-4">
  <!-- Search -->
  {#if hasItems || isLoading}
    <div class="relative">
      <Search
        class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        bind:value={searchQuery}
        placeholder={searchPlaceholder}
        class="pl-9 bg-background"
        disabled={isLoading}
      />
    </div>
  {/if}

  <!-- List -->
  <div class="rounded-md border bg-muted/10">
    <ScrollArea class="h-72 w-full rounded-md p-2">
      {#if isLoading}
        <div class="space-y-3 p-2">
          {#each Array(3) as _}
            <div class="flex items-center space-x-4">
              <Skeleton class="h-10 w-10 rounded-full" />
              <div class="space-y-2">
                <Skeleton class="h-4 w-[150px]" />
                <Skeleton class="h-3 w-[100px]" />
              </div>
            </div>
          {/each}
        </div>
      {:else if filteredItems.length === 0}
        <div class="flex h-full flex-col items-center justify-center py-8">
           <EmptyState
             icon={emptyIcon}
             title={searchQuery ? "No matches found" : emptyTitle}
             description={searchQuery ? "Try adjusting your search query" : emptyDescription}
             actionLabel={(!searchQuery && onNavigateToVault) ? "Go to Vault" : undefined}
             onAction={(!searchQuery && onNavigateToVault) ? onNavigateToVault : undefined}
             class="py-2"
           />
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each filteredItems as item (key(item))}
            {@render renderItem(item)}
          {/each}
        </div>
      {/if}
    </ScrollArea>
  </div>
</div>
