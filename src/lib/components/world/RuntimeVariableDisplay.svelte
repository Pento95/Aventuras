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
    /** Filter by pinned state: true = only pinned, false = only non-pinned, undefined = show all */
    pinnedOnly?: boolean
  }

  let {
    definitions,
    values,
    entityId,
    onValueChange,
    editMode = false,
    pinnedOnly = undefined,
  }: Props = $props()

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

  const filtered = $derived(
    pinnedOnly === undefined
      ? sorted
      : pinnedOnly
        ? sorted.filter((d) => d.pinned)
        : sorted.filter((d) => !d.pinned),
  )

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

{#if filtered.length > 0}
  <div class="border-border/50 mt-2 border-t pt-2">
    {#if editMode && onValueChange}
      <!-- Edit mode: vertical list of inline editors -->
      <div class="flex flex-col gap-1.5">
        {#each filtered as def (def.id)}
          {@const rawVal = getRawValue(def)}
          <RuntimeVariableEditor
            definition={def}
            currentValue={rawVal}
            onChange={(v) => onValueChange(def.id, v)}
          />
        {/each}
      </div>
    {:else}
      <!-- Display mode: flowing chip layout -->
      <div class="flex flex-wrap gap-1.5">
        {#each filtered as def (def.id)}
          {@const rawVal = getRawValue(def)}
          {@const isSet = rawVal != null}
          {@const Icon = getIconComponent(def.icon)}

          {#if def.variableType === 'number' && hasMinMax(def)}
            <!-- Number with range: chip with stat bar -->
            <div
              class="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
              style="background-color: color-mix(in srgb, {def.color} {isSet
                ? '12%'
                : '6%'}, transparent)"
            >
              {#if Icon}
                <Icon
                  class="h-3.5 w-3.5 shrink-0 {isSet ? '' : 'opacity-40'}"
                  style="color: {def.color}"
                />
              {/if}
              <span
                class="text-[10px] font-medium whitespace-nowrap {isSet ? '' : 'opacity-40'}"
                style="color: {def.color}"
              >
                {def.displayName}
              </span>
              {#if isSet && typeof rawVal === 'number'}
                <div class="bg-muted/50 relative h-3.5 w-16 overflow-hidden rounded-sm">
                  <div
                    class="h-full rounded-sm"
                    style="width: {getProgressPercent(
                      def,
                      rawVal,
                    )}%; background-color: {def.color}; opacity: 0.6"
                  ></div>
                  <span
                    class="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums"
                    style="color: {def.color}"
                  >
                    {rawVal}/{def.maxValue}
                  </span>
                </div>
              {:else}
                <span class="text-[10px] italic opacity-40">--</span>
              {/if}
            </div>
          {:else if def.variableType === 'number'}
            <!-- Number without range: chip with value -->
            <div
              class="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
              style="background-color: color-mix(in srgb, {def.color} {isSet
                ? '12%'
                : '6%'}, transparent)"
            >
              {#if Icon}
                <Icon
                  class="h-3.5 w-3.5 shrink-0 {isSet ? '' : 'opacity-40'}"
                  style="color: {def.color}"
                />
              {/if}
              <span
                class="text-[10px] font-medium whitespace-nowrap {isSet ? '' : 'opacity-40'}"
                style="color: {def.color}"
              >
                {def.displayName}
              </span>
              {#if isSet}
                <span class="text-xs font-bold tabular-nums" style="color: {def.color}"
                  >{rawVal}</span
                >
              {:else}
                <span class="text-[10px] italic opacity-40">--</span>
              {/if}
            </div>
          {:else if def.variableType === 'enum'}
            <!-- Enum: colored badge chip -->
            <div
              class="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
              style="background-color: color-mix(in srgb, {def.color} {isSet
                ? '12%'
                : '6%'}, transparent)"
            >
              {#if Icon}
                <Icon
                  class="h-3.5 w-3.5 shrink-0 {isSet ? '' : 'opacity-40'}"
                  style="color: {def.color}"
                />
              {/if}
              <span
                class="text-[10px] font-medium whitespace-nowrap {isSet ? '' : 'opacity-40'}"
                style="color: {def.color}"
              >
                {def.displayName}
              </span>
              {#if isSet}
                <span class="text-[10px] font-bold" style="color: {def.color}">
                  {getEnumLabel(def, rawVal)}
                </span>
              {:else}
                <span class="text-[10px] italic opacity-40">--</span>
              {/if}
            </div>
          {:else}
            <!-- Text: colored text chip -->
            <div
              class="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
              style="background-color: color-mix(in srgb, {def.color} {isSet
                ? '12%'
                : '6%'}, transparent)"
            >
              {#if Icon}
                <Icon
                  class="h-3.5 w-3.5 shrink-0 {isSet ? '' : 'opacity-40'}"
                  style="color: {def.color}"
                />
              {/if}
              <span
                class="text-[10px] font-medium whitespace-nowrap {isSet ? '' : 'opacity-40'}"
                style="color: {def.color}"
              >
                {def.displayName}
              </span>
              {#if isSet}
                <span
                  class="max-w-[100px] truncate text-[10px] font-medium"
                  style="color: {def.color}"
                  title={String(rawVal)}
                >
                  {rawVal}
                </span>
              {:else}
                <span class="text-[10px] italic opacity-40">--</span>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}
