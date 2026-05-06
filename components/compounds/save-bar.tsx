import { AlertTriangle } from 'lucide-react-native'
import * as React from 'react'
import { Platform, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

type SaveBarProps = {
  /**
   * Field labels in user-recognizable copy — comma-separated in
   * the dirty-note. e.g. `['description', 'visual.hair', 'traits']`.
   * Empty array hides the field listing but still shows the count.
   */
  dirtyFields: readonly string[]
  /**
   * Total dirty change count. Defaults to `dirtyFields.length`.
   * Override when a single field accumulates multiple distinct
   * changes that should count individually (rare).
   */
  dirtyCount?: number
  /**
   * Optional informational note. Renders as a `⚠` icon after the
   * field list with the text shown via web tooltip / aria-label.
   * Used by surface-specific propagation warnings (calendar swap,
   * model deletion, etc.) per
   * [`save-sessions.md → Visual`](../../docs/ui/patterns/save-sessions.md#visual).
   */
  notice?: string
  onSave: () => void
  onDiscard: () => void
  /**
   * Saving in flight — disables both actions and suppresses the
   * keyboard shortcut. Caller flips back to `false` after the
   * persistence call resolves; SaveBar typically unmounts at that
   * point because the session is no longer dirty.
   */
  saving?: boolean
  className?: string
}

// Save bar — the visible UI for the save-session pattern.
// Spec: docs/ui/patterns/save-sessions.md → Save bar.
//
// Color treatment derives from `--warning` rather than the wireframe's
// hardcoded `#fff7dc` so the bar reads as warning-state across all
// 11 themes (the warm yellow looked alien on the dark themes). Bg is
// `--warning` at 12% mixed with the surface; the dot is `--warning`
// at full saturation. Cross-platform mechanism mirrors the
// recently-classified-fading approach: an absolute-positioned
// overlay View carries the warning color at low opacity behind the
// content, leaving text + buttons fully opaque.
export function SaveBar({
  dirtyFields,
  dirtyCount,
  notice,
  onSave,
  onDiscard,
  saving = false,
  className,
}: SaveBarProps) {
  const count = dirtyCount ?? dirtyFields.length
  const fieldList = dirtyFields.length > 0 ? dirtyFields.join(', ') : null

  // ⌘/Ctrl-S keystroke listener — mounted only on web while the
  // bar exists. The bar self-mounts on dirty (consumers conditionally
  // render), so this listener's lifetime tracks the dirty session
  // exactly, with no risk of catching stray Cmd-S in clean state.
  //
  // Bound in **capture phase** (third arg `true`) because RN-Web
  // wires TextInput's onKeyDown via React's synthetic event system;
  // when an Input has focus, the keystroke goes through the synthetic
  // dispatcher first, which can stop propagation before bubble-phase
  // window listeners fire. Capture phase runs before the input gets
  // the event, so Ctrl-S works whether or not a field has focus.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        e.stopPropagation()
        if (!saving) onSave()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onSave, saving])

  // Keyboard hint shown inline in the Save button. Only render on
  // web — native users have no equivalent shortcut. macOS users see
  // ⌘S; everyone else web sees Ctrl+S. Detection sniffs the user
  // agent because RN-Web's `Platform.OS` is just `'web'` and
  // `navigator.platform` is deprecated.
  const shortcutHint = React.useMemo(() => {
    if (Platform.OS !== 'web') return null
    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent ?? '')
    return isMac ? '⌘S' : 'Ctrl+S'
  }, [])

  return (
    <View
      role="status"
      aria-live="polite"
      className={cn(
        'relative flex-row items-center justify-between gap-3 border-t border-border px-row-x-md py-row-y-sm',
        className,
      )}
    >
      {/* Warning-tinted bg overlay. Cross-platform equivalent of
          web's color-mix(in srgb, var(--warning) 12%, transparent).
          Sits behind content; pointerEvents="none" so the row's
          buttons own the press surface. */}
      <View
        className="absolute inset-0 bg-warning opacity-[.12]"
        aria-hidden
        pointerEvents="none"
      />

      <View className="min-w-0 shrink flex-row items-center gap-2">
        {/* State dot — full-saturation warning, 8 px circle. */}
        <View className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
        <Text size="xs" numberOfLines={1} className="shrink">
          <Text size="xs" className="font-semibold text-fg-primary">
            {count} unsaved change{count === 1 ? '' : 's'}
          </Text>
          {fieldList != null ? (
            // Field list uses `secondary` rather than `muted`. The
            // warning-tinted bg cuts perceptual contrast on dark
            // themes (tokyo-night and friends), and `text-fg-muted`
            // drops below readable. Secondary is the right tier
            // for "lower-emphasis but still readable."
            <Text size="xs" variant="secondary">
              {' — '}
              {fieldList}
            </Text>
          ) : null}
        </Text>
        {notice != null ? (
          // RN-Web's `<View>` filters unknown HTML attrs, so a
          // `title` prop on a View doesn't reach the DOM and the
          // native browser tooltip never shows. Wrapping the icon
          // in a raw `<div>` on web is the existing pattern (see
          // IconAction's `disabledReason`). Native gets the
          // accessible label via `aria-label` for screen readers.
          Platform.OS === 'web' ? (
            <div title={notice} style={{ display: 'inline-flex' }} aria-label={notice}>
              <Icon as={AlertTriangle} size="sm" className="text-warning" />
            </div>
          ) : (
            <View aria-label={notice}>
              <Icon as={AlertTriangle} size="sm" className="text-warning" />
            </View>
          )
        ) : null}
      </View>

      <View className="shrink-0 flex-row items-center gap-2">
        <Button variant="secondary" size="sm" onPress={onDiscard} disabled={saving}>
          <Text>Discard</Text>
        </Button>
        <Button variant="primary" size="sm" onPress={onSave} disabled={saving}>
          <Text>Save{shortcutHint != null ? ` ${shortcutHint}` : ''}</Text>
        </Button>
      </View>
    </View>
  )
}

export type { SaveBarProps }
