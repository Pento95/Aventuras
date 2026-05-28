import * as PopoverPrimitive from '@rn-primitives/popover'
import { ChevronDown } from 'lucide-react-native'
import { useCallback, useId, useMemo, useState } from 'react'
import { Platform, Pressable, View, type ViewStyle } from 'react-native'
// rn-primitives Content stamps onStartShouldSetResponder, which competes with
// RN's JS-side ScrollView pan claim. Gesture-handler's ScrollView uses native
// gesture handling and bypasses the JS responder — same workaround as the
// Select primitive.
import { ScrollView } from 'react-native-gesture-handler'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Text } from '@/components/ui/text'
import { useTier } from '@/hooks/use-tier'
import { cn } from '@/lib/utils'

import {
  clearAll,
  computeSelectionState,
  normalizeSelection,
  selectAll,
  selectionLabel,
  toggleValue,
  type MultiSelectOption,
} from './multi-select-state'

type MultiSelectProps = {
  /** Label prefix shown before the auto-computed state on the trigger (e.g. `Subsystem`). */
  prefix: string
  /** Source-order list. Render order is preserved; primitive does not sort. */
  options: readonly MultiSelectOption[]
  /** Current selection. Accepts Set or array; primitive normalizes internally. */
  selected: ReadonlySet<string> | readonly string[]
  /** Fired on every toggle, Select-all, and Clear-all. Emits an array in source order. */
  onChange: (next: string[]) => void
  /** Whole-control disable. */
  disabled?: boolean
  /** Title-tooltip when disabled (parity with Input / Select). */
  disabledReason?: string
  /** Class override for the trigger (consumer customization, e.g. de-emphasis on `all`). */
  triggerClassName?: string
}

function emitSelection(
  next: ReadonlySet<string>,
  options: readonly MultiSelectOption[],
  onChange: (next: string[]) => void,
) {
  const ordered = options.filter((o) => next.has(o.value)).map((o) => o.value)
  onChange(ordered)
}

export function MultiSelect({
  prefix,
  options,
  selected,
  onChange,
  disabled,
  disabledReason,
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const tier = useTier()
  const usesSheet = Platform.OS !== 'web' && tier === 'phone'

  const normalized = useMemo(() => normalizeSelection(selected, options), [selected, options])
  const state = useMemo(() => computeSelectionState(normalized, options), [normalized, options])
  const stateLabel = selectionLabel(state)

  const handleSelectAll = useCallback(() => {
    emitSelection(selectAll(options), options, onChange)
  }, [options, onChange])

  const handleClearAll = useCallback(() => {
    emitSelection(clearAll(), options, onChange)
  }, [options, onChange])

  const handleToggle = useCallback(
    (value: string) => {
      emitSelection(toggleValue(normalized, value), options, onChange)
    },
    [normalized, options, onChange],
  )

  const overlay = (
    <Overlay
      options={options}
      selected={normalized}
      state={state}
      onSelectAll={handleSelectAll}
      onClearAll={handleClearAll}
      onToggle={handleToggle}
      isPhone={usesSheet}
    />
  )

  const triggerInner = (
    <>
      <Text nativeID={labelId} size="xs" className="text-fg-muted">
        {prefix}:
      </Text>
      <Text size="xs" className="text-fg-primary">
        {stateLabel}
      </Text>
      <Icon as={ChevronDown} size="sm" className="text-fg-muted" />
    </>
  )

  const triggerClass = cn(
    'h-control-xs flex-row items-center gap-2 rounded-md border border-border bg-bg-base px-3',
    'active:bg-tint-hover',
    Platform.select({
      web: 'outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-focus-ring',
    }),
    disabled && 'opacity-50',
    triggerClassName,
  )

  const webTitle = Platform.OS === 'web' ? { title: disabled ? disabledReason : undefined } : null

  if (usesSheet) {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${prefix}: ${stateLabel}`}
          accessibilityState={{ expanded: open, disabled: !!disabled }}
          disabled={disabled}
          onPress={() => setOpen(true)}
          {...webTitle}
          className={triggerClass}
        >
          {triggerInner}
        </Pressable>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent anchor="bottom" size="medium" title={prefix}>
            {overlay}
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <Popover onOpenChange={setOpen} ariaLabelledBy={labelId}>
      <PopoverTrigger asChild disabled={disabled}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${prefix}: ${stateLabel}`}
          accessibilityState={{ expanded: open, disabled: !!disabled }}
          {...webTitle}
          className={triggerClass}
        >
          {triggerInner}
        </Pressable>
      </PopoverTrigger>
      <PopoverContent
        accessibilityRole="dialog"
        className={cn(
          'p-0',
          // Web: match trigger width via radix's exposed CSS variable so the
          // popover never looks narrower than its trigger. Native equivalent
          // applied via inline style below.
          Platform.select({ web: 'min-w-[var(--radix-popover-trigger-width)]' }),
        )}
      >
        <NativeWidthSync>{overlay}</NativeWidthSync>
      </PopoverContent>
    </Popover>
  )
}

type OverlayProps = {
  options: readonly MultiSelectOption[]
  selected: ReadonlySet<string>
  state: ReturnType<typeof computeSelectionState>
  onSelectAll: () => void
  onClearAll: () => void
  onToggle: (value: string) => void
  isPhone: boolean
}

function Overlay({
  options,
  selected,
  state,
  onSelectAll,
  onClearAll,
  onToggle,
  isPhone,
}: OverlayProps) {
  return (
    <View>
      <View className="flex-row items-center gap-3 border-b border-border px-row-x-md py-row-y-sm">
        <Pressable
          accessibilityRole="button"
          onPress={onSelectAll}
          disabled={state.kind === 'all'}
          className={cn('h-control-xs justify-center px-2', state.kind === 'all' && 'opacity-50')}
        >
          <Text size="xs" className="text-fg-primary">
            Select all
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClearAll}
          disabled={state.kind === 'none'}
          className={cn('h-control-xs justify-center px-2', state.kind === 'none' && 'opacity-50')}
        >
          <Text size="xs" className="text-fg-primary">
            Clear all
          </Text>
        </Pressable>
      </View>
      {isPhone ? (
        <View>
          {options.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              checked={selected.has(option.value)}
              onPress={onToggle}
              isPhone={isPhone}
            />
          ))}
        </View>
      ) : (
        <ScrollView className="max-h-80" nestedScrollEnabled>
          {options.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              checked={selected.has(option.value)}
              onPress={onToggle}
              isPhone={isPhone}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

type OptionRowProps = {
  option: MultiSelectOption
  checked: boolean
  onPress: (value: string) => void
  isPhone: boolean
}

// Native popover width has no CSS-var equivalent to web's
// `--radix-popover-trigger-width`. Read the measured trigger from rn-primitives
// root context and apply a minWidth style so the popover matches (or exceeds)
// the trigger width.
function NativeWidthSync({ children }: { children: React.ReactNode }) {
  const { triggerPosition } = PopoverPrimitive.useRootContext()
  const triggerWidth = triggerPosition?.width
  const style = useMemo<ViewStyle | undefined>(() => {
    if (Platform.OS === 'web' || triggerWidth == null) return undefined
    return { minWidth: triggerWidth }
  }, [triggerWidth])
  return <View style={style}>{children}</View>
}

function OptionRow({ option, checked, onPress, isPhone }: OptionRowProps) {
  const handlePress = useCallback(() => onPress(option.value), [onPress, option.value])

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!option.disabled }}
      onPress={handlePress}
      disabled={option.disabled}
      className={cn(
        'flex-row items-center gap-3 px-row-x-md py-row-y-md',
        isPhone && 'min-h-control-lg',
        Platform.select({ web: 'hover:bg-bg-raised' }),
        'active:bg-bg-raised',
        option.disabled && 'opacity-50',
      )}
    >
      <Checkbox checked={checked} onCheckedChange={handlePress} disabled={option.disabled} />
      <Text size="sm" className="flex-1 text-fg-primary">
        {option.label ?? option.value}
      </Text>
    </Pressable>
  )
}

export type { MultiSelectProps }
