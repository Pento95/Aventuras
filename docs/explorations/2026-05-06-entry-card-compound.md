# 2026-05-06 — EntryCard compound

Design pass for the reader-composer narrative-row compound.
Resolves the
[`component-inventory.md → Compounds — needs design`](../ui/component-inventory.md#compounds--needs-design)
row.

## Outcome

EntryCard is a single compound with a kind discriminator that
renders the four committed entry kinds (`user`, `ai`, `opening`,
`system`) plus the live `streaming` shape. Variable-height by
contract; calendar-agnostic; opening parity with AI for visual
treatment but not action set; in-place textarea edit on every tier.

This pass also closes a data-model gap: `metadata.reasoning?:
string` is added to `story_entries.metadata` so the brain-toggle
reasoning-expansion feature can persist provider reasoning text
beyond the streaming window.

## Why a single compound with kind discriminator

The reader-composer narrative loop iterates over a typed array of
entries with `kind` already discriminated; hosts want
`<EntryCard kind={entry.kind} {...} />` without a switch-case
wrapper. Splitting into `<EntryCard.User>`, `<EntryCard.AI>`,
etc. would push the same dispatch into every consumer for no
gain — all five kinds share enough structure (bubble shape,
content slot, world-time footer, kind-keyed styling) that the
divergence sits in slots, not skeleton.

The five kinds are:

- **`user`** — user-typed entry. Pack-wrapped per the composer
  mode at send time.
- **`ai`** — AI-generated narrative reply. Carries reasoning,
  token meta, model provenance.
- **`opening`** — first entry of the initial branch. Renders
  identically to `ai` visually (per
  [data-model.md → Opening entry](../data-model.md#opening-entry));
  action set differs (no regen, no delete — per the opening's
  block-delete invariant).
- **`system`** — pipeline error or system event. Warn-tinted,
  inline action buttons (Retry / Details / Dismiss) instead of
  the top-right action cluster.
- **`streaming`** — live-streaming AI entry. Same skeleton as
  `ai`; brain pulses; token display has trailing arrow; no per-
  entry actions (cancel routes through the composer).

## Compound API

```ts
type EntryCardProps = {
  kind: 'user' | 'ai' | 'opening' | 'system' | 'streaming'
  content: string
  worldTimeLabel?: string

  onEdit?: () => void
  onDelete?: () => void // not for opening (block-delete) and not for system/streaming

  // AI / opening:
  meta?: { tokens: { reply: number; reasoning?: number }; model?: string }
  reasoning?: string
  onRegen?: () => void // ai only
  onBranch?: () => void // ai, opening
  onFlipEra?: () => void // user, ai, opening — host hides when eras: null

  // Streaming-only:
  streamingPhase?: 'reasoning' | 'reply'

  // System-only:
  detail?: string
  onRetry?: () => void
  onDismiss?: () => void

  // Edit-restrictions (uniform with principles):
  disabled?: boolean
  disabledReason?: string

  // Edit mode (host-controlled):
  editing?: boolean
  onContentChange?: (next: string) => void
  onCommitEdit?: () => void
  onCancelEdit?: () => void

  className?: string
}
```

Two design decisions baked into the API:

1. **Edit mode is controlled.** `editing` boolean plus controlled
   `content` value plus `onContentChange / onCommitEdit /
onCancelEdit` callbacks. Host owns dirty-state machinery
   (delta-log writes); compound renders textarea-or-prose based
   on `editing` and relays keystrokes.
2. **`worldTimeLabel` is pre-formatted.** Calendar formatting
   lives in the host's render pass via the active calendar's
   renderer (see
   [data-model.md → In-world time tracking](../data-model.md#in-world-time-tracking)).
   EntryCard renders the string opaque — same treatment the
   top-bar chip uses. Compound stays calendar-agnostic.

## Per-kind structure

| Slot                       | user                             | ai                                        | opening                                | system                                    | streaming                             |
| -------------------------- | -------------------------------- | ----------------------------------------- | -------------------------------------- | ----------------------------------------- | ------------------------------------- |
| Top line                   | `You` badge                      | meta line (glyph, brain, tokens)          | meta line                              | `System` + warn glyph                     | meta line (brain pulses, trailing → ) |
| Reasoning body             | —                                | conditional (`reasoning` set, expanded)   | conditional                            | —                                         | live-streaming on `streamingPhase`    |
| Content                    | prose (or textarea if `editing`) | prose                                     | prose                                  | error description + inline action buttons | partial prose tokens                  |
| Action cluster (top-right) | edit, `[flip era]`, delete       | edit, regen, branch, `[flip era]`, delete | edit, branch, `[flip era]` (no delete) | — (uses inline buttons)                   | —                                     |
| World-time footer          | shown                            | shown                                     | shown                                  | hidden                                    | hidden                                |
| Bubble styling             | `bg-highlight border-line-soft`  | `bg-region border-line`                   | same as ai                             | warn-tinted                               | ai styling plus dashed border         |

`opening` renders identically to `ai` for visual treatment; the
discriminator only affects available actions, per the
[data-model.md → Opening entry → Reader rendering](../data-model.md#opening-entry)
invariant.

## Reasoning expansion mechanic

**Data source.** `props.reasoning` (from
`story_entries.metadata.reasoning?: string` — see
_Data-model addition_ below). Brain icon renders only when
`reasoning` is present, or `streamingPhase === 'reasoning'` for
the live shape.

**State.** Internal `expanded: boolean`, default `false`. Click
brain toggles. No external override prop — host doesn't
coordinate cross-entry expansion state.

**Animation.** Height-auto transition on the reasoning-body
wrapper:

- Web: `transition: max-height 200ms ease-out` with
  measured-height clamp.
- Native: reanimated worklet on a shared `expanded` value with
  `withTiming(expanded ? measured : 0, { duration: 200 })`.
- Reasoning body uses `display: none` when collapsed so it
  doesn't take layout space and doesn't measure.

**Scroll-anchor concern (load-bearing for the parent list).**

The reasoning body sits above content. When expanded above the
viewport top, the user's view would shift down without
intervention. EntryCard does NOT own scroll-anchor — that's the
parent virtualized list's responsibility. EntryCard's contract
is: emit a measurable, deterministic layout transition; never
pin its own height; let the parent's `measureElement` or
`maintainVisibleContentPosition` track the shift.

The [reader narrative scroll-anchoring on prepend](../ui/screens/reader-composer/reader-composer.md#anchor-preservation-under-shifts)
followup covers the parent's mechanic; EntryCard ships
compatible.

## Edit mode

When `editing === true`:

- Content slot renders `<Textarea>` instead of prose `<Text>`.
- Textarea seeded with current `content`.
- `onContentChange(next)` fires on each keystroke (host owns
  dirty state).
- `<SaveBar>` is NOT rendered inside EntryCard. The host wires
  the existing
  [save-session pattern](../ui/patterns/save-sessions.md) at
  detail-pane level; EntryCard exposes `onCommitEdit /
onCancelEdit` for the host to bind.
- Brain / reasoning body / action cluster: hidden during edit.
  The entry is in edit-mode focus.
- Reasoning text is NOT editable. Only `content`. Reasoning is
  generation provenance, not user-authored.

**Cross-tier:** identical on phone and desktop. Textarea spans
full content width. Mobile keyboard pushes the textarea up via
existing form-row patterns. No sheet / modal — keeps the edit
in narrative flow.

## World-time footer

- Muted small text, bottom-right of bubble (`text-fg-muted
text-xs`).
- Renders `props.worldTimeLabel` opaque (host pre-formats via
  active calendar's renderer — same opaque-render contract the
  top-bar chip uses).
- Hidden for `kind` ∈ { `system`, `streaming` } — system is
  generation-meta, streaming has no committed worldTime yet.
- Hidden when `worldTimeLabel` undefined (host's choice — e.g.,
  formatter failure or calendar omits this entry).

**Future hook (resolved 2026-05-17):** the footer became
click-to-edit per
[`2026-05-17-manual-worldtime-correction.md`](./2026-05-17-manual-worldtime-correction.md) —
click opens a Popover (desktop) / Sheet (phone) with a
TierTupleInput; Save writes one delta. The footer's existence at
this design's landing was the surface that correction UX wired to.

## Action cluster

Per-kind action sets:

| Kind      | edit                                                  | regen | branch | flip-era    | delete            |
| --------- | ----------------------------------------------------- | ----- | ------ | ----------- | ----------------- |
| user      | yes                                                   | —     | —      | conditional | yes               |
| ai        | yes                                                   | yes   | yes    | conditional | yes               |
| opening   | yes                                                   | —     | yes    | conditional | no (block-delete) |
| system    | (inline buttons inside content; no top-right cluster) |
| streaming | (no actions; cancel via composer)                     |

`flip-era` conditional: host passes `onFlipEra` only when active
calendar has eras. Same gating as the
[per-screen doc](../ui/screens/reader-composer/reader-composer.md#per-entry-actions).

Position: absolute top-right of bubble; opacity 0.55 default,
1.0 on hover or focus per the
[icon-actions pattern](../ui/patterns/icon-actions.md). Cluster
gap and density-aware sizing inherit from icon-actions.

## Variable-height plus virtualization compatibility

EntryCard's contract for parent virtualized lists:

- **No fixed height.** Bubble height is content-driven.
- **No key shenanigans.** Same key across re-renders (host
  passes `entry.id`).
- **Deterministic layout transitions.** Reasoning expand/collapse
  uses height-auto with predictable timing; parent's
  `measureElement` (web) or `FlatList`'s native layout (mobile)
  reacts naturally.
- **No layout effects fighting the parent.** EntryCard doesn't
  measure itself or apply scroll fixes.

The reader narrative scroll-anchoring followup is the parent
list's concern, not EntryCard's. EntryCard ships compatible; the
parent's anchor logic plugs in cleanly.

## Data-model addition

`story_entries.metadata.reasoning?: string` is added alongside
the existing `tokens.reasoning?: number` count:

```ts
story_entries.metadata: {
  // Generation provenance (AI entries only)
  tokens?: { prompt: number, completion: number, reasoning?: number }
  model?: string
  generationTimingMs?: number
  reasoning?: string // NEW: persisted reasoning text

  sceneEntities: string[]
  currentLocationId: string | null
  worldTime: number
}
```

- **Optional.** Mirrors `tokens.reasoning` (count) and
  `tokens.completion` (count for content). Some providers don't
  expose reasoning text — field stays undefined.
- **Persisted at stream completion** via the same per-entry
  write that closes the AI reply.
- **Delta-logged** as a metadata mutation, consistent with all
  other metadata fields.
- **Translation behavior:** stays untranslated. Provenance, not
  user-facing narrative. Same treatment as `model`.
- **No migration concern** — additive optional field on an
  existing JSON column.

This addition closes the data-model gap that surfaced during the
design pass: the brain-toggle reasoning expansion can re-show
text post-stream, not just count.

## What this design defers

- **Manual worldTime correction UI** — resolved 2026-05-17 in
  [`2026-05-17-manual-worldtime-correction.md`](./2026-05-17-manual-worldtime-correction.md);
  the footer is now click-to-edit (Popover / Sheet with
  TierTupleInput) when the entry has authored worldTime metadata.
- **Reasoning text in search scope** — provenance, not narrative
  content; lean: don't include. Revisit if real demand surfaces.
- **Reasoning text in export / backup** — yes by default
  (provenance is part of the entry record); confirms with the
  existing export shape when that pass lands.
- **Click-to-edit on the world-time footer** — resolved 2026-05-17
  alongside manual worldTime correction (same design pass).

## Adversarial summary

**Load-bearing assumption:** all five entry kinds fit one
component with kind discriminator. If wrong, component fragments
by kind. Risk small: shared structure dominates per-kind
divergence.

**Verified:**

- Entry shape (data-model.md:1062), per-kind wireframe structure
  (reader-composer.html), action sets (reader-composer.md:184),
  reasoning expansion behavior (reader-composer.md:278),
  streaming behavior (reader-composer.md:301), system entry
  shape (reader-composer.md:319), opening parity with AI
  (data-model.md:1159).

**Assumed:**

- Reasoning text is persisted at stream completion (was the
  data-model gap; resolved by adding the field).
- World-time footer placement (bottom-right) doesn't conflict
  with action cluster (top-right). Confirmed via wireframe —
  different corners.
