# Diagnostics Hub

Power-user / dev surface for inspecting what the AI pipeline did.
Tabbed page hosting the family of observability surfaces designed
around the contracts in
[`docs/observability.md`](../../../observability.md).

Gated by `app_settings.diagnostics.enabled` (master toggle). When
off, the hub entry is absent from the
[Actions menu](../../principles.md#top-bar-design-rule) — the
toggle itself is the discovery point.

Surface inventory only at this design stage. **Per-tab body
designs land in their own per-tab detail passes** when each is
built; this doc names the structural pieces (top-bar, tab strip,
story-anchor selector, cross-tab nav, empty states, mobile
expression).

Design record:
[`docs/explorations/2026-05-17-observability-substrate.md`](../../../explorations/2026-05-17-observability-substrate.md).

## Top-bar

App-level chrome `[←] [Diagnostics] [⚲]`. No status pill, no
chapter chip, no story chrome — even when a tab body pivots into
per-story content. Tab body owns its own story context.

Hub entry point lives in the **Actions (⚲) menu** as
`Open Diagnostics Hub`, visible only when the master toggle is on.

## Story selector

Three of the five tabs are story-anchored. The hub renders a
**story selector strip** below the top-bar:

```
Story  [The Tower of Aria ▾]   Branch  [main ▾]
```

Single source of truth for "which story are we inspecting"; the
three story-anchored tabs subscribe to it. App-global tabs ignore
the selector.

When the user opens the hub from an in-story context, the
selector pre-fills with the current story + branch. When opened
from out-of-story chrome (App Settings, Story List), the selector
prompts a pick before the story-anchored tabs render content
(story-anchored tabs show an inline "Pick a story" empty state
until a selection is made).

Detail (selector mobile expression, switch confirmation when
unsaved diagnostic UI state exists, etc.) for the per-tab detail
passes.

## Tab strip

Five tabs, in order:

| #   | Tab                | Anchor                | Source                       | Status                                                         |
| --- | ------------------ | --------------------- | ---------------------------- | -------------------------------------------------------------- |
| 1   | Memory probe       | Story                 | `probe_captures` (persisted) | Existing — see [memory probe](../memory-probe/memory-probe.md) |
| 2   | Per-turn inspector | Story + turn          | `turnCaptures` (in-memory)   | New — detail pass forthcoming                                  |
| 3   | Call log           | App-global            | `httpCalls` (in-memory)      | New — detail pass forthcoming                                  |
| 4   | Logs               | App-global            | `logEntries` (in-memory)     | New — detail pass forthcoming                                  |
| 5   | Delta log          | Story (branch-scoped) | `deltas` (persisted)         | New — detail pass forthcoming                                  |

Tab strip renders via the
[Tabs primitive](../../patterns/tabs.md); optional per-tab count
badges render to the right of each label (Logs typically shows
`warn+error` count; Call log shows in-flight count; per-turn
inspector shows turn count). Configurable per-consumer.

### Tab 1 — Memory probe

Existing tab content per
[`memory-probe.md`](../memory-probe/memory-probe.md). The hub doc
references rather than relocates the existing screen — keeps the
memory-probe design integrity intact. Tab anchored to the story
selector.

### Tab 2 — Per-turn inspector

Story + turn-anchored. Sources `turnCaptures` slice. Two-pane:

- **List pane** — recent turns, reverse-chronological by
  `startedAt`. Branch filter inherits from the story selector.
  Rows colored by outcome (`completed | aborted | failed`).
- **Detail pane** — selected turn's phase timeline + classifier
  raw output (JSON viewer per
  [`patterns/data.md`](../../patterns/data.md)) + cross-cut rows
  pulled from `httpCalls` and `logEntries` filtered by the
  turn's `actionId`.

Cross-tab nav: row-click on a referenced HTTP call → opens Call
log tab focused on that row; row-click on a log entry → opens
Logs tab focused on that entry. Both navigations preserve the
selected turn so the back-affordance returns intact.

Full detail (column choices, time-axis scale on the phase
timeline, copy-to-clipboard affordances, expand/collapse state on
the classifier JSON tree, edit-restrictions interaction during
in-flight generation) lands in this tab's detail pass.

### Tab 3 — Call log

App-global. Sources `httpCalls` slice. Single-list view,
reverse-chronological by `startedAt`. Row state-aware visual
treatment:

- **In-flight** — pulsing indicator, request-side fields visible,
  response-side fields a "Waiting…" placeholder, no duration
  shown yet.
- **Completed** — solid status chip (2xx/3xx/4xx/5xx coloring),
  duration, response body expandable.
- **Failed** — error chip, partial fields, error message.

Row identity (ULID) stable across the in-flight → completed/failed
transition; React keys don't churn and per-row expanded state
persists through the transition.

Click expands the row to show request + response payloads in the
JSON viewer.

Filters: source (provider / embedder / etc.), state, HTTP status
range, free-text URL/body search.

Cross-tab nav: actionId chip on a row → per-turn inspector for
that turn (when actionId present and turn capture is still in the
ring buffer).

Auth-style headers (`Authorization`, `X-API-Key`, `Cookie`,
response `Set-Cookie`) render as `'***'` per the
[redaction contract](../../../observability.md#header-redaction).

### Tab 4 — Logs

App-global. Sources `logEntries` slice. Single-list,
reverse-chronological by `emittedAt`. Row shape:

```
[14:02:18]  [warn]  classifier.delta_clamped  { originalDelta: -1800, … }  [tr_a3kf →]
```

Click expands to show full `fields` JSON.

Filters:

- **Level multi-select** — `warn | error` always available;
  `debug` listed only when `debug_level_enabled` is on.
- **Subsystem multi-select** — iterates the `LogSubsystem` union
  from [`observability.md → Kind namespace`](../../../observability.md#kind-namespace)
  directly. Adding a subsystem to the union surfaces a new filter
  chip with no UI plumbing.
- **Kind free-text** — substring match against the kind string.
- **ActionId** — implicit chip when navigated from per-turn
  inspector.

Cross-tab nav: actionId chip → per-turn inspector.

### Tab 5 — Delta log

Story-anchored. Branch-scoped by default (inherits the story
selector's branch), with a filter to expand to "all branches in
this story." Sources the canonical `deltas` table (persisted by
design — see
[`data-model.md → Entry mutability & rollback`](../../../data-model.md#entry-mutability--rollback)).

Row shape **extends the
[DeltaLogRow pattern](../../patterns/delta-log-row.md)** — same
primitive World and Plot per-entity History tabs use. Difference:
those tabs scope to one target_id's lineage; this tab is
**unscoped across rows** (every delta) but scoped within a story
(and by default within a branch).

Filters:

- `source` multi-select — `classifier | lore_mgmt | user_edit |
chapter_close | ...` (matches the existing source enum on
  `deltas`).
- `target_table` multi-select — `entities | lore | happenings |
threads | translations | ...`.
- Branch — current branch by default; expand-to-all-branches
  toggle.
- `action_id` — implicit when navigated from per-turn inspector.
- Free-text search across target names and field paths.
- Optional time range.

Cross-tab nav: actionId chip → per-turn inspector when actionId
is present on the delta AND the corresponding turn capture is
still in the ring buffer. When the turn has aged out, the chip is
informational only (clicking shows "this turn's diagnostic data
has aged out").

**Prerequisite:** the
[delta diff cache followup](../../../followups.md#delta-diff-cache-for-history-surfaces)
covers `(old → new)` rendering for ALL history surfaces. This
tab inherits the prerequisite; doesn't add a new one. Fallback
while cache is pending: raw `undo_payload` JSON viewer, less
readable but functional.

**Cost:** unlike the other tabs, this one queries a persisted,
growing table. Active stories accumulate dozens of deltas per
turn. Query needs `LIMIT` + virtualization per
[`patterns/lists.md`](../../patterns/lists.md).

## Cross-tab nav substrate

Tabs share an `actionId` deep-link parameter. A tab transition
that includes an actionId sets this parameter and auto-focuses
the appropriate row in the destination tab. State persists across
tab switches within a hub session; clears on master toggle-off
(consistent with the in-memory ring-buffer wipe semantics from
[`observability.md → Wipe semantics`](../../../observability.md#wipe-semantics)).

## Empty states

- **Master OFF + deep link to hub** — "Diagnostics is off — turn
  on the master toggle to enable capture" with a link to App
  Settings · Diagnostics. The hub entry in the Actions menu is
  hidden when master is off, so this state is reached only via
  direct route navigation.
- **Master ON + buffers empty** — per-tab copy ("No turns
  captured yet — trigger a turn to start" / "No calls yet" / "No
  log entries yet" / "No delta rows yet"). Memory probe's empty
  state stays as documented in its own screen doc.

## Mobile expression

Tab strip via the [Tabs primitive](../../patterns/tabs.md) —
horizontal strip on tablet+, falls back to Select at phone tier
per the existing
[Group C cardinality cascade](../../foundations/mobile/layout.md).

Each tab body inherits whatever list-pane / two-pane pattern fits
its shape: per-turn inspector uses two-pane (collapses to
list-first on phone per the standard rule); Call log, Logs, and
Delta log are single-list with row expansion. Memory probe's
existing mobile design carries over unchanged.

Story selector strip on phone collapses to a single-row affordance
showing only the active story name with a tap-to-switch picker;
branch picker moves to the per-tab filter row when a
story-anchored tab is active.

## Screen-specific open questions

- **Story selector switch when buffers contain other-story data.**
  Switching stories doesn't wipe the per-story `turnCaptures` —
  the buffer is keyed by `actionId`, not story. Should
  story-anchored tabs hide entries whose `branchId` doesn't match
  the current story selection (filter at render-time), or should
  the buffer wipe on story switch? Lean: filter at render-time;
  buffer survives story switches so the user can flip back. Detail
  for the per-tab passes.
- **Cross-window aggregation on Electron** — each window has its
  own diagnostics store. If a user opens the hub in window A
  while turns run in window B, hub A's buffers are empty. Parked
  as
  [Cross-window aggregator](../../../parked.md#observability--cross-window-aggregator-on-electron).
  Until then: open the hub in the window where the work is
  happening.
- **Tab count badge calculation semantics** — total buffer count
  vs filter-applied count. Probably total (filter is a view), but
  worth a per-tab decision when each ships.
- **Memory probe tab relocation question.** This design pass
  references the existing
  [`memory-probe.md`](../memory-probe/memory-probe.md) rather
  than relocating its content under `diagnostics/`. If future
  passes find the cross-doc reference structurally awkward, the
  memory-probe content can be relocated via `git mv` to
  `screens/diagnostics/memory-probe/` with inbound anchor sweeps.
  Not load-bearing for v1.

## Top-bar Actions menu

The hub's entry point is the Actions menu — a global affordance
that has not yet had a focused design pass. See
[`followups.md → Actions menu broader design pass`](../../../followups.md#actions-menu-broader-design-pass)
for the pending design work; this hub adds a single entry
(`Open Diagnostics Hub`) without redesigning the menu's broader
inventory or organization.
