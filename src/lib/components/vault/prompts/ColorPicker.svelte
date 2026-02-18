<script lang="ts">
  import * as Popover from '$lib/components/ui/popover'
  import { Button } from '$lib/components/ui/button'
  import { cn } from '$lib/utils/cn'
  import { Check } from 'lucide-svelte'

  interface Props {
    value: string
    onChange: (color: string) => void
  }

  let { value, onChange }: Props = $props()

  let open = $state(false)

  const COLORS = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#eab308',
    '#84cc16',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#ec4899',
    '#f43f5e',
    '#78716c',
    '#64748b',
  ]

  function handleSelect(color: string) {
    onChange(color)
    open = false
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" size="icon" class="h-8 w-8" {...props}>
        <div class="h-4 w-4 rounded-sm" style:background-color={value}></div>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-auto p-3" align="start">
    <div class="grid grid-cols-4 gap-1.5">
      {#each COLORS as color (color)}
        <button
          type="button"
          class={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110',
            value === color && 'ring-primary ring-2 ring-offset-2',
          )}
          style:background-color={color}
          onclick={() => handleSelect(color)}
        >
          {#if value === color}
            <Check class="h-3.5 w-3.5 text-white drop-shadow-sm" />
          {/if}
        </button>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>
