# 2026-05-06 — Toolbar compound

Design pass for the list-pane chrome compound shared across Story
List, World list pane, World history tab, Plot list pane, Plot
history tab, and Reader Browse rail. Resolves the
[`component-inventory.md → Compounds — needs design`](../ui/component-inventory.md#compounds--needs-design)
row.

## Outcome

Toolbar is a thin slot-composition compound providing **search,
filter chips, and conditional sort**, plus the cross-tier overflow
rule already pinned in per-screen prose. Kind-selectors stay OUT
of the compound — surfaces with kind-coupling (World, Plot, Reader
Browse rail) wrap Toolbar with their own selector composition.

## Why kind-selector stays out

The kind-selector is the **mode-setter for the entire surface
chrome** — flipping it changes search placeholder, search scope,
filter chip choices, and the row shape downstream. World list
explicitly calls out "category-aware search"; Reader Browse rail
the same. Plot threads-vs-happenings is a 2-way segment with its
own thread-vs-happening filter chips below.

Pulling the kind-selector into the Toolbar would force three
distinct shapes into one compound:

- **Story List, World/Plot history**: 0-way (no kind-selector).
- **Plot main list**: 2-way segment.
- **World main list**: 5-way Select dropdown.
- **Reader Browse rail**: 7-way Select with rail-collapse coupling.

Each cardinality has different rendering rules; Reader Browse
rail's selector hooks into the rail's collapsed-strip mode in
ways the other surfaces don't. A "smart toolbar that handles all
of this" balloons the compound; a "dumb toolbar with kind-selector
slot" leaves the host doing the same kind-coupled work it already
does for placeholder, scope, and filters.

The Toolbar's actual reusable concern — bar layout together with
the overflow rule — doesn't depend on the kind-selector at all.
Pulling it out is structurally honest, not just convenient.

## Surface inventory

| Surface            | Search | Filter chips | Sort | Kind-selector wrapping |
| ------------------ | ------ | ------------ | ---- | ---------------------- |
| Story List         | yes    | yes          | yes  | none                   |
| World list pane    | yes    | yes          | —    | 5-way Select (host)    |
| World history tab  | yes    | yes (op)     | yes  | none                   |
| Plot list pane     | yes    | yes          | —    | 2-way segment (host)   |
| Plot history tab   | yes    | yes (op)     | yes  | none                   |
| Reader Browse rail | yes    | yes          | —    | 7-way Select (host)    |

Sort appears on 3 of 6 surfaces — explicit user-configurable sort
is a Story-List and history-tab affordance. World/Plot main lists
and Reader Browse rail use the static four-layer entity sort
(per [entity.md → Entity-list sort order](../ui/patterns/entity.md#entity-list-sort-order--static-four-layer)),
no dropdown needed.

## Compound API

Composition-via-children with sub-components, matching SaveBar /
JSONViewer / FormRow conventions:

```tsx
<Toolbar>
  <Toolbar.Search
    value={query}
    onChange={setQuery}
    placeholder="Search title, description…"
    scope={['title', 'description', 'definition.genre.label', 'tags']}
  />
  <Toolbar.FilterChips>
    <Chip selected={filter === 'all'} onPress={() => setFilter('all')}>
      All
    </Chip>
    <Chip selected={filter === 'favorited'} onPress={() => setFilter('favorited')}>
      Favorited
    </Chip>
    <Chip selected={filter === 'archived'} onPress={() => setFilter('archived')}>
      Archived
    </Chip>
  </Toolbar.FilterChips>
  <Toolbar.Sort
    value={sortKey}
    onChange={setSortKey}
    label="Sort"
    options={[
      { value: 'last-opened', label: 'Last opened' },
      { value: 'created', label: 'Created' },
      { value: 'title', label: 'Title' },
    ]}
  />
</Toolbar>
```

### `<Toolbar>`

Bar wrapper. Owns layout, density-aware padding, the cross-tier
overflow rule. Iterates children, detects sub-component type,
applies the responsive layout. No additional props beyond
`className`.

### `<Toolbar.Search>`

Wraps the [search-bar-scope pattern](../ui/patterns/lists.md#search-bar-scope).
Props: `value`, `onChange`, `placeholder`, `scope: string[]`,
`disabled?`, `disabledReason?`.

Internally renders `<Input leading={<Icon as={Search}/>}
trailing={<ScopeHelpPopoverTrigger scope={...}/>}/>`. Trailing
icon opens a Popover (Sheet on phone) showing the scope as a
labeled list. Web also gets a focus-tooltip below the input
fading after 2 s; native skips the focus-tooltip and relies on
the ⓘ trigger as the discovery affordance.

Default width: `flex-1` to fill available space at desktop, full
width at narrow tiers per the overflow rule. Consumers can
width-cap via `className="max-w-[360px]"` (Story List uses this).

### `<Toolbar.FilterChips>`

Layout container for `<Chip>` children. `flex-row flex-wrap
items-center gap-2`, density-aware. Single-select vs multi-select
semantics are host concern; the Chip primitive supports both via
`selected` boolean.

### `<Toolbar.Sort>`

`<Select>` forced to `mode="dropdown"` always — bypasses the
cardinality cascade so 3-option sorts don't render as segments.
Visual consistency: every surface's sort affordance is a chevron
trigger with the selected value visible.

Props: `value`, `onChange`, `options: Array<{value, label}>`,
`label?`, `disabled?`. Trigger renders compact: `[Sort: <selected
label> ▾]` if `label` provided, else bare `[<selected label> ▾]`.
Hugs content; right-aligned at desktop, wraps onto the second row
at narrow tiers.

Phone: opens via Sheet (short) per the existing tier-aware Select
binding. Tablet/desktop: anchored Popover.

### Slot detection

Toolbar iterates `React.Children`, type-checks each child against
the sub-component identity, and assigns it to its slot. Unknown
children pass through as-is (escape hatch for surface-specific
extras), but the canonical three are the named ones. Slot order
is fixed: search → chips → sort.

## Cross-tier overflow rule

Already canonical in per-screen prose
([`world.md → Mobile expression`](../ui/screens/world/world.md#mobile-expression),
[`plot.md → Mobile expression`](../ui/screens/plot/plot.md#mobile-expression)).
Promoted to the Toolbar pattern:

### Desktop (`≥ 1024 px`)

Single horizontal row.

```
[search……………………………………] [filter chips] [Sort: Last opened ▾]
```

### Tablet and phone (`< 1024 px`)

Search takes its own full-width row first; filter chips and sort
wrap beneath as a single chip-flow row.

```
[search……………………………………………………………………………………………]
[filter chips wrap…]                [Sort: Last opened ▾]
```

### Mechanism

- Toolbar wrapper uses `flex-row flex-wrap` at narrow tiers; the
  search slot has `flex-basis: 100%` to force its own row.
- Filter chips and sort live in the second row, naturally wrapping
  if chip count overflows.
- Container-keyed via `@container (max-width: 1023px)` on web;
  tier-keyed via `useTier()` on native
  (`tier === 'phone' || tier === 'tablet'`). Same dual-mechanism
  pattern [FormRow](../ui/patterns/forms.md#form-rows--stacked-on-narrow-container)
  uses.

### Why container-keyed not viewport-keyed on web

The Toolbar can sit inside a narrow detail-pane on a wide
viewport (a tablet-landscape Plot history list inside a 600 px
detail container is mobile-narrow). Same trade-off the FormRow
pattern locked.

### Density coupling

- Phone: `min-h-control-lg` per row (44 px touch floor on the
  search input and sort trigger).
- Tablet/Desktop: `min-h-control-md`.
- Vertical gap between rows at narrow tier: `gap-2` (8 px) —
  enough to separate visually, tight enough that the toolbar
  doesn't dominate.

### No overflow menu

Toolbar deliberately doesn't collapse pieces into a `⋯` menu:

- Search must always be visible (blocking it behind a menu
  defeats the surface).
- Filter chips need at-a-glance state; menu collapse hides which
  filter is active.
- Sort being one slot means there's nothing meaningful to
  overflow-menu.
- Wrap-then-stack handles every viewport case the surfaces care
  about.

## What this absorbs

The inventory's reference to "the previous SearchInput primitive
(Input combined with scope tooltip and ⓘ help-popover)" is now
satisfied by `Toolbar.Search`. There IS no separate `SearchInput`
export — the search-with-scope shape lives as a sub-component of
Toolbar.

Consumers wanting search-with-scope outside a Toolbar bar (App
Settings model search, future ad-hoc surfaces) compose
`<Input leading={<Icon as={Search}/>} trailing={<ScopeHelp
scope={...}/>}/>` directly. If a `<ScopeHelp>` micro-component
ends up shared between Toolbar and standalone consumers, it can
graduate to its own export — defer until a second non-Toolbar
consumer surfaces.

## What this design defers

- **Drag-reorder of filter chips, slot order rearrangement** —
  v2+. Slot order is fixed: search → chips → sort.
- **Compact / dense Toolbar variants** — no v1 surface needs a
  stripped-down toolbar. Extension axis if a future consumer
  surfaces.
- **Async-search debouncing, virtualized result counts** — those
  are search-side concerns, not toolbar concerns. The compound
  wires `value` and `onChange` straight through.
- **Per-screen prose drift cleanup** — `world.md` and `plot.md`
  currently describe the overflow rule in their `## Mobile
expression` sections. The new pattern doc is canonical; the
  per-screen prose stays during this design pass and gets
  updated to cite the pattern at phase-3 list-pane build time.

## Adversarial summary

**Load-bearing assumption:** the search-on-own-row plus
chips-and-sort-wrap rule covers every surface adequately. If
wrong, surfaces would need per-surface overflow overrides. No v1
surface stresses this; `flex-wrap` extends gracefully to a third
row if filter chips ever overflow.

**Verified:**

- Surface count and per-surface chrome — read story-list.md,
  world.md, plot.md, reader-composer.md sections.
- Overflow rule pinned in world.md:586 and plot.md:316.
- Search-bar-scope pattern fully specified in lists.md.
- Reader Browse rail uses static "sorted, grouped" — no
  user-configurable sort dropdown (verified via grep on
  reader-composer.md).

**Assumed:**

- Filter chip semantics (single-select vs multi-select) is host
  concern, not Toolbar concern. Reasonable; Chip supports both
  via `selected`. Not blocking.
- Third-row overflow on many filter chips is acceptable. No v1
  surface tests this; `flex-wrap` is gracefully extensible.
