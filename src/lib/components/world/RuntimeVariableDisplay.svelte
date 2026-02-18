<script lang="ts">
  import type {
    RuntimeVariable,
    RuntimeVarsMap,
    RuntimeVariableValue,
  } from '$lib/services/packs/types'
  import RuntimeVariableEditor from './RuntimeVariableEditor.svelte'
  import {
    Heart,
    Shield,
    Sword,
    Star,
    Flame,
    Zap,
    Crown,
    Eye,
    Brain,
    Target,
    Compass,
    Skull,
    Gem,
    Key,
    Lock,
    Map,
    Mountain,
    Droplet,
    Wind,
    Sun,
    Moon,
    Clock,
    Activity,
    AlertTriangle,
    Award,
    Battery,
    Bookmark,
    CircleDot,
    Crosshair,
    Feather,
    Flag,
    Gift,
    Globe,
    Hammer,
    Lightbulb,
    Music,
    Palette,
    Scale,
    Sparkles,
    Trophy,
    Wand2,
    Users,
    Gauge,
  } from 'lucide-svelte'

  interface Props {
    definitions: RuntimeVariable[]
    values: RuntimeVarsMap | undefined
    entityId: string
    onValueChange?: (defId: string, value: string | number | null) => void
    editMode?: boolean
  }

  let { definitions, values, entityId, onValueChange, editMode = false }: Props = $props()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ICON_MAP: Record<string, any> = {
    Heart,
    Shield,
    Sword,
    Star,
    Flame,
    Zap,
    Crown,
    Eye,
    Brain,
    Target,
    Compass,
    Skull,
    Gem,
    Key,
    Lock,
    Map,
    Mountain,
    Droplet,
    Wind,
    Sun,
    Moon,
    Clock,
    Activity,
    AlertTriangle,
    Award,
    Battery,
    Bookmark,
    CircleDot,
    Crosshair,
    Feather,
    Flag,
    Gift,
    Globe,
    Hammer,
    Lightbulb,
    Music,
    Palette,
    Scale,
    Sparkles,
    Trophy,
    Wand2,
    Users,
    Gauge,
  }

  const sorted = $derived([...definitions].sort((a, b) => a.sortOrder - b.sortOrder))

  function getValue(def: RuntimeVariable): RuntimeVariableValue | undefined {
    return values?.[def.id]
  }

  function getRawValue(def: RuntimeVariable): string | number | null {
    return getValue(def)?.v ?? null
  }

  function getEnumLabel(def: RuntimeVariable, val: string | number | null): string {
    if (val == null || !def.enumOptions) return 'Not set'
    const strVal = String(val)
    const opt = def.enumOptions.find((o) => o.value === strVal)
    return opt?.label ?? strVal
  }

  function getProgressPercent(def: RuntimeVariable, val: number): number {
    const min = def.minValue ?? 0
    const max = def.maxValue ?? 100
    if (max === min) return 100
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100))
  }

  function hasMinMax(def: RuntimeVariable): boolean {
    return def.minValue != null && def.maxValue != null
  }

  function getIconComponent(iconName?: string) {
    if (!iconName) return null
    return ICON_MAP[iconName] ?? null
  }
</script>

{#if sorted.length > 0}
  <div class="border-border/50 mt-2 border-t pt-2">
    <div class="flex flex-col gap-1.5">
      {#each sorted as def (def.id)}
        {@const rawVal = getRawValue(def)}
        {@const isSet = rawVal != null}
        {@const icon = getIconComponent(def.icon)}

        {#if editMode && onValueChange}
          <!-- Edit mode: inline editors -->
          <RuntimeVariableEditor
            definition={def}
            currentValue={rawVal}
            onChange={(v) => onValueChange(def.id, v)}
          />
        {:else}
          <!-- Display mode -->
          <div class="flex min-h-[22px] items-center gap-2">
            {#if def.variableType === 'number' && hasMinMax(def)}
              <!-- Number with min/max: stat bar -->
              <div class="flex w-full items-center gap-1.5">
                <!-- Icon or label -->
                <div class="flex w-5 shrink-0 items-center justify-center" title={def.displayName}>
                  {#if icon}
                    <svelte:component
                      this={icon}
                      class="h-3.5 w-3.5 {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    />
                  {:else}
                    <span
                      class="truncate text-[10px] font-medium {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    >
                      {def.displayName.slice(0, 2)}
                    </span>
                  {/if}
                </div>

                {#if isSet && typeof rawVal === 'number'}
                  <!-- Progress bar -->
                  <div class="bg-muted relative h-4 flex-1 overflow-hidden rounded-sm">
                    <div
                      class="h-full rounded-sm transition-all duration-300"
                      style="width: {getProgressPercent(
                        def,
                        rawVal,
                      )}%; background-color: {def.color}; opacity: 0.7"
                    ></div>
                    <span
                      class="text-foreground absolute inset-0 flex items-center justify-center text-[10px] font-medium mix-blend-normal"
                    >
                      {rawVal}/{def.maxValue}
                    </span>
                  </div>
                {:else}
                  <span class="text-muted-foreground text-[10px] italic">Not set</span>
                {/if}
              </div>
            {:else if def.variableType === 'number'}
              <!-- Number without min/max -->
              <div class="flex w-full items-center gap-1.5">
                <div class="flex w-5 shrink-0 items-center justify-center" title={def.displayName}>
                  {#if icon}
                    <svelte:component
                      this={icon}
                      class="h-3.5 w-3.5 {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    />
                  {:else}
                    <span
                      class="text-[10px] font-medium {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    >
                      {def.displayName.slice(0, 2)}
                    </span>
                  {/if}
                </div>
                <span class="text-muted-foreground flex-1 truncate text-xs">{def.displayName}</span>
                {#if isSet}
                  <span class="text-xs font-medium tabular-nums" style="color: {def.color}"
                    >{rawVal}</span
                  >
                {:else}
                  <span class="text-muted-foreground text-[10px] italic">Not set</span>
                {/if}
              </div>
            {:else if def.variableType === 'enum'}
              <!-- Enum: badge/pill -->
              <div class="flex w-full items-center gap-1.5">
                <div class="flex w-5 shrink-0 items-center justify-center" title={def.displayName}>
                  {#if icon}
                    <svelte:component
                      this={icon}
                      class="h-3.5 w-3.5 {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    />
                  {:else}
                    <span
                      class="text-[10px] font-medium {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    >
                      {def.displayName.slice(0, 2)}
                    </span>
                  {/if}
                </div>
                <span class="text-muted-foreground flex-1 truncate text-xs">{def.displayName}</span>
                {#if isSet}
                  <span
                    class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                    style="background-color: color-mix(in srgb, {def.color} 15%, transparent); color: {def.color}"
                  >
                    {getEnumLabel(def, rawVal)}
                  </span>
                {:else}
                  <span class="text-muted-foreground text-[10px] italic">Not set</span>
                {/if}
              </div>
            {:else}
              <!-- Text -->
              <div class="flex w-full items-center gap-1.5">
                <div class="flex w-5 shrink-0 items-center justify-center" title={def.displayName}>
                  {#if icon}
                    <svelte:component
                      this={icon}
                      class="h-3.5 w-3.5 {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    />
                  {:else}
                    <span
                      class="text-[10px] font-medium {isSet ? '' : 'opacity-40'}"
                      style="color: {def.color}"
                    >
                      {def.displayName.slice(0, 2)}
                    </span>
                  {/if}
                </div>
                <span class="text-muted-foreground flex-1 truncate text-xs">{def.displayName}</span>
                {#if isSet}
                  <span
                    class="max-w-[120px] truncate text-xs"
                    style="color: {def.color}"
                    title={String(rawVal)}
                  >
                    {rawVal}
                  </span>
                {:else}
                  <span class="text-muted-foreground text-[10px] italic">Not set</span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}
