# 2026-05-13 — CollisionResolveDialog + CollisionListRow design

Implementation design for the needs-design compound at
[`component-inventory.md → Compounds — needs design`](../ui/component-inventory.md#compounds--needs-design)
and the inventory's
[`Compounds — shipped → CollisionListRow`](../ui/component-inventory.md#compounds--shipped)
row. The feature spec lives in
[`world.md → Collision review and entity merge`](../ui/screens/world/world.md#collision-review-and-entity-merge);
this doc settles the **implementation** (component split, API
shapes, merge body state machine, diff computation, Storybook
strategy, scope boundary).

## Outcome

Ship two compounds in isolation:

1. **`CollisionListRow`** — composes the shipped `ListRow` plus a
   below-row warn-tinted collision strip. The strip carries a
   `⚠ Collides with <other-name>` link and a `Resolve →` button.
   ListRow itself is **not** modified — the strip is its own
   compound, not a fifth indicator channel grafted onto ListRow.
2. **`CollisionResolveDialog`** — three-body-mode modal
   (Merge / Rename / Keep as distinct), built on the freshly-landed
   `Dialog` primitive. Pure View component; caller passes both
   entity projections and supplies an async `onResolve` driver.

Driver implementations (real DB writes against the three resolution
paths) are followups — caller-side concerns when World consumes the
dialog. Stories ship with stub drivers (resolve, never-resolve,
reject), same pattern as
[`embedder-download-dialog`](./2026-05-11-embedder-download-dialog-compound.md).

## Why a separate compound, not a ListRow extension

The
[entity row indicators rule](../ui/patterns/entity.md#entity-row-indicators--four-orthogonal-channels)
fixes four orthogonal channels on the pan-domain row (lead badge,
status pill, scene-presence, recently-classified). The collision
strip is a different shape: it's a row-conditional **below-row
appendage** with its own tap targets — not a slot, not a tint, not
a stripe. Adding it as a fifth channel on ListRow conflates two
concerns: ListRow stays a single Pressable with internal slots, and
the strip is a sibling element outside that Pressable.

Composition wins:

- ListRow's pan-domain shape stays unchanged. Every other
  consumer (Plot, Story Settings, Memory Probe, Story List)
  imports the same primitive untouched.
- The wrapping compound owns the warn-tint contract for the strip
  and the Resolve button — concerns that don't belong on a generic
  list row.
- At v1 the only call site is the World list-renderer's
  flagged-row branch. Consumers without collision flags use plain
  ListRow.
- Naming stays pan-domain (`CollisionListRow`, not
  `EntityCollisionRow`): the strip's contract isn't
  entity-specific even if v1 only fires for entities. Lore's
  immunity to the flag is enforced at the call site, not in the
  type system.

## File structure

```
components/compounds/
  collision-resolve-diff.ts          pure: computeDivergence + types
  collision-resolve-diff.test.ts     vitest
  collision-resolve-machine.ts       pure: merge reducer + types
  collision-resolve-machine.test.ts  vitest
  collision-resolve-dialog.tsx       View: mode picker + body switch
  collision-resolve-dialog.stories.tsx
  collision-list-row.tsx             row + strip compound
  collision-list-row.stories.tsx
```

Two pure modules split because the testable surfaces are distinct:
`computeDivergence` exercises entity-shape comparison logic;
`mergeReducer` exercises form-state transitions. Combining them
into a single machine file would couple two concerns that don't
share state.

Rename and Keep bodies render inline in `collision-resolve-dialog.tsx`
— each is small enough (a couple of inputs / a confirmation
paragraph) that lifting them into separate files would obscure
the mode-switch logic.

## API shapes

### Dialog props

```ts
type CollisionResolveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityA: EntitySummary // older by createdAt; default canonical
  entityB: EntitySummary // newer; the flagged row in v1
  onResolve: (resolution: Resolution) => Promise<void>
}
```

The caller sorts by `createdAt` before passing, matching the spec's
"older = default canonical" rule. The dialog never reorders
internally — caller data is the source of truth.

### Entity projection

```ts
type EntitySummary = {
  id: string
  kind: 'character' | 'location' | 'item' | 'faction'
  createdAt: string // ISO
  name: string
  description?: string
  status: EntityStatus
  retiredReason?: string
  injectionMode: InjectionMode
  tags: string[]
  state: Record<string, unknown> // whole-side; no per-field diff in v1
  relationCounts: {
    awarenessRows: number
    involvements: number
    inverseRefs: number
    embeddings: 0 | 1
    translationRows: number
  }
}
```

Each side carries its own `relationCounts`. The merge body's
relations-summary block shows the **non-canonical**'s counts (the
ones that will move on merge), so toggling canonical flips the
displayed counts to the other side.

`state` is opaque (`Record<string, unknown>`). The dialog only
deep-equals it to decide whether to render the inline note
("follows the canonical row · edit on detail pane after merge").
Per-field traversal inside `state` is explicitly out of scope per
the
[v1 limitation in world.md](../ui/screens/world/world.md#merge).

### Resolution shape

```ts
type Resolution =
  | {
      mode: 'merge'
      canonicalId: string
      fieldChoices: Record<ScalarField, 'A' | 'B'>
      finalTags: string[]
    }
  | {
      mode: 'rename'
      renames: Array<{ id: string; newName: string }> // 1 or 2 entries
    }
  | { mode: 'keep' }

type ScalarField = 'name' | 'description' | 'status' | 'retiredReason' | 'injectionMode'
```

`fieldChoices` only carries entries for fields that diverge.
Identical-on-both-sides fields stay implicit (caller writes
canonical's value unconditionally). `finalTags` is the union after
the user's deselects are applied — empty array is allowed (entity
becomes untagged).

The rename array is sparse: only entities whose name actually
changed are included. Validation enforces that at least one entry
is present.

### Strip compound props

```ts
type CollisionListRowProps = {
  row: ListRowProps // forwarded verbatim
  collision: {
    otherName: string
    onJumpToOther: () => void
    onResolve: () => void
  }
}
```

Forwarding `ListRowProps` verbatim keeps the row's contract intact.
The strip is rendered as a sibling `<View>` below the row's
`<Pressable>` — outside its tap surface so the strip's own buttons
own their tap targets cleanly.

## Computational concerns

### `computeDivergence` (pure)

```ts
type DiffPayload = {
  divergentScalars: ScalarField[]
  tags: { onlyInA: string[]; onlyInB: string[]; both: string[] } | null
  stateDivergent: boolean
}
```

Behavior:

- **Scalars** — strict equality (`===`). `description` is not
  whitespace-normalized. The right way to converge cosmetic
  whitespace differences is to edit one side in the detail pane,
  not paper over divergence at the dialog level.
- **Tags** — partitioned into `onlyInA` / `onlyInB` / `both`.
  `null` when both sides have identical tag sets (order-independent).
- **State** — structural deep-equal: sort keys, compare leaves.
  Inline helper (~20 lines); no lodash dependency.

Returned `divergentScalars` preserves a fixed field order
(name, description, status, retiredReason, injectionMode) for
stable rendering — order isn't data-dependent.

### Merge reducer

```ts
type MergeState = {
  canonicalId: string
  fieldChoices: Record<ScalarField, 'A' | 'B'>
  deselectedTags: string[]
}

type MergeAction =
  | { type: 'pick-canonical'; id: string }
  | { type: 'pick-field'; field: ScalarField; side: 'A' | 'B' }
  | { type: 'toggle-tag'; tag: string }
  | { type: 'reset'; diff: DiffPayload; defaultCanonicalId: string }
```

Transition rules:

- **`pick-canonical`** — rebases `fieldChoices`: every divergent
  scalar resets to the new canonical's side. Matches user
  expectation ("this side wins by default; override per field"),
  and keeps the relations-summary's "loser → canonical" framing
  consistent.
- **`pick-field`** — overrides a single scalar without touching
  the canonical or other choices.
- **`toggle-tag`** — adds or removes a tag from `deselectedTags`.
  `finalTags` is derived in the view as
  `union - deselectedTags` (sorted).
- **`reset`** — re-initializes on entity-input change. Defensive;
  in practice the dialog is keyed by entity ids so unmount
  handles most cases.

Initial state is constructed by:

```ts
function initMergeState(diff: DiffPayload, defaultCanonicalId: string): MergeState
```

— sets `canonicalId` to `defaultCanonicalId`, initializes
`fieldChoices[field] = 'A' | 'B'` based on which side matches the
canonical, and `deselectedTags = []`.

### Submit-enabled rules

- **Merge** — always enabled once the canonical is picked. Init
  defaults canonical to A, so this is true from open. The user
  cannot get stuck in an un-submittable state.
- **Rename** — enabled when at least one of the two name inputs
  differs from its current value (`a !== entityA.name ||
b !== entityB.name`).
- **Keep** — always enabled.

## Bodies

### Merge

Renders in order:

1. **Canonical picker** — segment toggle (Select primitive in
   segment mode) with two options:
   `<A.name> · <ago(A.createdAt)>` /
   `<B.name> · <ago(B.createdAt)>`. The "(canonical)" suffix
   appears on the selected side.
2. **Divergent-field table** — one row per divergent scalar.
   Each row: field label · radio for A's value · radio for B's
   value. Identical fields are omitted entirely (no
   "matches" row). Empty when no scalars diverge.
3. **Tag union** (when `diff.tags != null`) — single row labeled
   "Tags". Renders all tags from the union as chips; each chip has
   an inline `×` to deselect. Deselected chips render in a
   strikethrough / dimmed variant and can be re-selected.
4. **State JSON note** (when `stateDivergent` is true) — inline
   muted text: "`state` will follow the canonical row · edit on
   detail pane after merge."
5. **Relations summary** — read-only block showing non-canonical's
   counts: "Awareness rows: N · Involvements: N · Inverse refs: N
   · Embeddings: N · Translation rows: N." Counts re-derive when
   canonical flips.
6. **Footer** — `[ Cancel ]` · `[ Merge into <canonical-name> ]`.
   The primary button echoes the canonical pick so the destructive
   direction is obvious.

### Rename

Two stacked text inputs, one per entity, labeled with the entity
id and age (`ent_kael_1 · 12 turns ago`). Each input initialized
to the entity's current name. Inline help: "Change at least one
name to clear the collision."

Footer: `[ Cancel ]` · `[ Save renames ]`. Save disabled per the
submit rule above.

### Keep as distinct

Single muted paragraph (spec verbatim from world.md):

> Both `<name>` entities will continue to exist with the same
> name. Retrieval treats them by id, but storyteller responses
> may conflate them in prose. Polymorphic naming is a documented
> v1 limitation — the schema doesn't enforce unique names. The
> flag clears; no other writes.

Footer: `[ Cancel ]` · `[ Keep as distinct ]`.

## Strip

`CollisionListRow` renders a wrapping `<View>` that stacks two
children:

1. `<ListRow {...row} />` — the existing primitive, untouched.
2. `<View>` strip — warn-tinted background, padded, with two
   children:
   - `<Pressable onPress={collision.onJumpToOther}>` rendering
     `⚠ Collides with <otherName>` (link styling, underlined).
   - `<Button>` labeled `Resolve →` (compact / secondary
     variant), wired to `collision.onResolve`.

The strip's tap surfaces are separate from the row's `Pressable`.
On phone, the strip's two children stack vertically if the layout
overflows; on tablet+ they sit on one row with the link taking
remaining width.

Accessibility — the strip is its own region:
`accessibilityRole="region"`, `accessibilityLabel="Collision
warning"`. Screen readers announce row + region as siblings.

## Storybook strategy

### Dialog stories

`Primitives` for `components/ui/*`, `Compounds` for
`components/compounds/*` — `collision-resolve-dialog.stories.tsx`
goes under `Compounds/CollisionResolveDialog`.

Stories (full matrix):

| Story                     | What it demonstrates                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `Default`                 | Merge mode, divergent description + status + tags, populated relations                     |
| `MergeNoScalarDivergence` | Names + descriptions identical; only tags differ                                           |
| `MergeOnlyTagsDiffer`     | All scalars match; tag sets diverge                                                        |
| `MergeStateDivergent`     | Identical scalars and tags; divergent `state` JSON — shows inline note only                |
| `MergeNoDivergence`       | Truly-identical entities — table empty, canonical picker still functional                  |
| `MergeLongDescriptions`   | Prose long enough to exercise wrap on desktop                                              |
| `MergeCanonicalFlip`      | Interactive: confirms `fieldChoices` rebases on canonical toggle                           |
| `MergeLoading`            | `onResolve` returns never-resolving Promise; gated dismissal                               |
| `MergeError`              | `onResolve` rejects; error renders inline above footer, dialog stays open                  |
| `RenameMode`              | Rename body, default state, save disabled                                                  |
| `RenameDirty`             | At least one input edited; save enabled                                                    |
| `RenameLoading`           | Save in flight                                                                             |
| `KeepMode`                | Keep body, confirmation panel                                                              |
| `KeepLoading`             | Confirm in flight                                                                          |
| `ThemeMatrix`             | All four themes × one merge body; per-row `PortalHost` (matches embedder-download pattern) |

No `autodocs` tag. Controlled-open + Promise-driver pattern
doesn't render meaningfully on the docs page (same constraint as
the embedder-download dialog).

### Strip stories

`Compounds/CollisionListRow`:

| Story                 | What it demonstrates                           |
| --------------------- | ---------------------------------------------- |
| `Default`             | Row + strip, normal-length names               |
| `LongCollisionTarget` | `otherName` long enough to exercise truncation |
| `WithKindIcon`        | `row.leading` populated with an EntityKindIcon |
| `WithStatusPillSlot`  | `row.trailing` carries a status pill           |
| `ThemeMatrix`         | All four themes                                |

Autodocs is fine for the strip — it's a pure-presentation
compound, no controlled state.

### Stub driver pattern

Same as embedder-download:

- Resolved: `onResolve: async (r) => { /* log */ }`
- Loading: `onResolve: () => new Promise(() => {})`
- Error: `onResolve: () => Promise.reject(new Error('Write failed'))`

## Out of scope

- **World top-bar `⚠ N need review` pill** — screen chrome.
  Depends on `StatusPill` (still in
  [`Compounds — needs design`](../ui/component-inventory.md#compounds--needs-design)).
- **Collapsed-accordion `⚠ N` badge** — screen chrome on the
  World accordion groups.
- **3+ collision iteration** — multi-way collision orchestration
  is the caller's responsibility. The dialog handles 2-side
  merges only per the v1 limitation in
  [`world.md → Authorship and 3+ collisions`](../ui/screens/world/world.md#authorship-and-3-collisions).
- **Disabled-while-generating gating on the `Resolve →` button** —
  the caller passes `row.disabled` through; the dialog and the
  strip are unaware of generation state. The
  [edit-restrictions rule](../ui/principles.md#edit-restrictions-during-in-flight-generation)
  is enforced at the World consumer.
- **Mobile phone-tier prose clamp** — the spec's "3-line clamp
  with tap-to-expand" on long descriptions is deferred to a v1
  mobile pass. Stories test desktop wrap behavior; phone-tier
  clamping has no consumer mobile-tested yet (embedder-download
  was deferred similarly).

## Followups

Adds `### CollisionResolveDialog` section to
[`docs/followups.md`](../followups.md):

- **Real DB-write drivers per resolution path** — Merge/Rename/Keep
  drivers writing entities/awareness/involvements/translations
  deltas under one `action_id`. World consumer wires these.
- **Phone-tier prose clamp** — 3-line clamp + tap-to-expand on
  long descriptions in the merge body, per
  [`world.md → Merge`](../ui/screens/world/world.md#merge).

## Inventory delta

Lands in same commit as the shipped code (`feedback_inventory_double_entry` memory rule — recurring oversight that has needed three chore-commit followups):

1. **Compounds — shipped** — add `CollisionResolveDialog` row and
   `CollisionListRow` row. Both reference this design doc.
2. **Compounds — needs design** — remove `CollisionResolveDialog`
   row.
3. **Modifications pending** — remove the `ListRow` row entirely.
   The strip moved to its own compound; ListRow ships unchanged.
4. **ListRow shipped row** — drop the trailing sentence "Below-row
   collision strip extension pending — see Modifications pending."

## Test surface

- `collision-resolve-diff.test.ts` — covers `computeDivergence`:
  - identical entities (no divergence)
  - one scalar differs
  - multiple scalars differ (order-stability check)
  - tags differ (partitioning + sorting)
  - state differs (deep-equal edge cases: nested objects, arrays,
    null vs missing)
  - all of the above combined
- `collision-resolve-machine.test.ts` — covers the merge reducer:
  - init: canonicalId from default, fieldChoices from canonical
    side, deselectedTags empty
  - `pick-canonical`: fieldChoices rebases to new canonical
  - `pick-field`: overrides a single scalar without touching others
  - `toggle-tag`: adds and removes
  - `reset`: replaces state cleanly

Target ~15-20 tests across the two files. Less than
embedder-download's 25 because the surface is smaller
(no workflow states, no error variants).
