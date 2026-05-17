# Delta diff cache — in-memory display-only resolver

Resolves the `Delta diff cache for history surfaces` followup
previously tracked in `followups.md`, removed by the commit that
lands this exploration. The followup framed the work around a
separate persistent cache table with PK shape, eviction policy,
backfill ergonomics, and concurrency rules. The resolution
collapses most of that framing: the cache is an in-memory LRU
`Map<delta_id, { old, new }>` populated lazily per delta on render,
with no persistent storage at all. The schema does not change.

The cache exists for exactly one purpose: deriving the NEW value
side of an `op=update` delta so the `DeltaLogRow` host can render
rich diff prose (`Added "former soldier"; was ["brave", "loyal"]`)
instead of a generic placeholder. Everything else the followup
gestured at — search indexing, persistent rebuild, cross-surface
preheat — falls out of scope.

## What the cache is computing

Each `op=update` delta carries `undo_payload` — the **pre-change**
values of the touched fields (per
[`data-model.md → Deltas table`](../data-model.md#diagram), see
also
[`Entry mutability & rollback`](../data-model.md#entry-mutability--rollback)).
The post-change values are not stored anywhere: the live target
row holds "state right now," not "state right after this specific
delta." For the most recent delta on a target, those are the same;
for older deltas, intermediate updates have overwritten the row.

The `DeltaLogRow` pattern's `summary: string` field
([`delta-log-row.md → Summary`](../ui/patterns/delta-log-row.md#summary))
takes pre-rendered diff prose. To form it for `op=update` rows,
the host needs both the OLD value (from `undo_payload`) and the
NEW value (derived). `op=create` and `op=delete` render as
one-liners (`Created`, `Deleted [name]`) with no walk and no cache
involvement.

## The walk algorithm

A backward walk from current state, scoped per
`(branch_id, target_table, target_id)`.

The key observation: each delta's NEW value is either the **next**
delta's OLD value for the same field, or the **current** state of
that field if no later delta on the same branch touched it.
Walking newest-to-oldest from the live row, each delta's
`undo_payload` reverses the running state by exactly one step.

```
populate(D):
  if D.id in cache: return cache[D.id]

  # 1. Chain: all deltas on D's target at or after D's log_position
  #    within the same branch. Single SQL query.
  chain = SELECT * FROM deltas
          WHERE branch_id = D.branch_id
            AND target_table = D.target_table
            AND target_id = D.target_id
            AND log_position >= D.log_position
          ORDER BY log_position DESC

  # 2. Seed state. Two cases.
  head = chain[0]
  if head.op === 'delete':
    state = head.undo_payload          # full pre-delete row JSON
    walkable = chain.slice(1).filter(op === 'update')
  else:
    state = SELECT * FROM {target_table} WHERE id = target_id
    walkable = chain.filter(op === 'update')

  # 3. Walk newest → oldest, deriving (old, new) for each delta on
  #    the way to D and populating the cache as a side effect.
  for delta in walkable:
    new_partial = pick(state, keys(delta.undo_payload))
    old_partial = delta.undo_payload
    cache.set(delta.id, { new: new_partial, old: old_partial })
    state = merge(state, delta.undo_payload)   # step back one delta
```

Both reads — the chain query and the current-state read — happen
inside a **single SQLite read transaction**. WAL mode gives a
consistent snapshot, so a new delta committing on the same target
mid-walk can't slip in between the two reads and produce an
off-by-one.

The `merge` step applies `undo_payload` onto `state` to produce
the pre-delta state for the next iteration. Its semantics must
match whatever the project's rollback path uses to apply
`undo_payload` to a row — same pre-existing reverse-replay
contract referenced from
[`data-model.md → Entry mutability & rollback`](../data-model.md#entry-mutability--rollback)
and
[`generation-pipeline.md → Crash recovery`](../generation-pipeline.md#crash-recovery-via-pipeline_runs-marker-table).
The cache may share the same code or duplicate the semantics; the
contract is "same observable behavior on the same input," not
"same function."

## Cache shape, capacity, lifecycle

A single process-wide module — proposed location
`lib/deltas/diff-cache.ts`, exact path is implementation-time.

**Key.** `delta.id` (a kind-prefixed UUID, globally unique).
Cross-story and cross-branch sharing is safe because IDs never
collide.

**Value.** Mirrors `undo_payload`'s per-field partial shape on
both sides:

```ts
type DiffCacheEntry = {
  old: Record<string, unknown>
  new: Record<string, unknown>
}
```

**Eviction.** LRU keyed on read and on write. Hard size cap of
**2000 entries** as a single named constant. Reasoning: a
populated entry is two small JSON objects covering only the
touched fields of one delta — usually 1-5 fields of short
scalars or short arrays. Conservative estimate ~500 bytes per
entry, ~1 MB at cap. A heavy session — scrolling ~500 deltas in
the global delta log plus per-entity histories on a dozen
entities plus walk-induced fills along the way — stays well
under cap. Cheap to tune later; not user-configurable.

**Lifecycle.** Process lifetime. No persistence. The cache is
empty on every app launch, and that is the design. Single-renderer
process at v1; if multi-window support ships later, cross-window
coordination would need IPC — that's a separate pass and not v1
scope.

## Consumer contract

Two-method surface from the module:

```ts
// Sync; returns undefined on miss. Never does I/O. Render-path safe.
peek(deltaId: string): DiffCacheEntry | undefined

// Async; runs the walk if needed. Idempotent per delta.id —
// concurrent calls for the same id share one promise. Populates D
// plus every walked-through delta on the path to chain head as a
// side effect.
populate(delta: Delta): Promise<DiffCacheEntry>

// Optional helper for batched render. Groups deltas by target so
// the host can submit a whole visible window as one call; collapses
// N walks to M walks where M ≤ N.
populateBatch(deltas: Delta[]): Promise<void>
```

### Render flow per row

The DeltaLogRow host (each per-screen page) owns diff-summary
string formation per
[`delta-log-row.md → Summary`](../ui/patterns/delta-log-row.md#summary).
The flow:

1. `delta.op !== 'update'` → one-liner directly. Cache not
   involved.
2. `delta.op === 'update'`:
   - `peek(delta.id)` first.
   - **Hit:** format rich `(old, new)` prose, pass as `summary`.
   - **Miss:** kick off `populate(delta)`, fall back to a summary
     derived from `undo_payload` keys alone — e.g.,
     `Modified traits, drives`. When populate resolves, the
     host's normal re-render path picks up the now-cached entry
     and the row upgrades to the rich prose.

This keeps the `summary: string` contract on `DeltaLogRow`
unchanged. Pre-walk and post-walk are both real strings; the
post-walk version is just richer.

### Re-render trigger

Not load-bearing for the design. The host wires it however the
project's data layer prefers — TanStack Query keyed on
`['diff', delta.id]` is the natural fit given the existing
virtualization stack (per the
[reader narrative scroll-anchoring on prepend](../ui/screens/reader-composer/reader-composer.md#anchor-preservation-under-shifts)
followup's library notes), but the cache doesn't dictate.

### Request coalescing

The cache internally coalesces by `delta.id` via an
`inFlight: Map<deltaId, Promise>` so duplicate `populate` calls
during a frame don't issue duplicate queries. `populateBatch`
groups by target to issue one walk per target instead of one
per delta. Stopping there: cross-delta-within-same-target
coalescing (D1's walk populates D2 as a byproduct) adds
complexity for a rare overlap. Worst case for a naive caller is
one redundant SQL query.

### Consumer surfaces in v1

- [`world.md → History tab`](../ui/screens/world/world.md#history-tab) —
  entity History tab and lore History tab (same shape).
- [`plot.md`](../ui/screens/plot/plot.md) — thread and happening
  History tabs.
- [`diagnostics.md → Tab 5 — Delta log`](../ui/screens/diagnostics/diagnostics.md#tab-5--delta-log) —
  story-scoped, unscoped-across-targets Delta log.

All three consume via the same render flow. No surface-specific
cache behavior.

### Error path

If `populate` throws (DB error, corrupt state with row missing
and no `op=delete` in chain, etc.), the host falls back permanently
to the `undo_payload`-keys summary for that row and emits a
`debug`-level log entry through the logger contract per
[`observability.md → Logger contract`](../observability.md#logger-contract).
The row stays usable; the user sees `Modified traits` instead of
the rich form.

## Edge cases

**`op=delete` at the chain head.** Covered by the seed-state
switch above: the delete's `undo_payload` is the full pre-delete
row JSON, which is exactly the post-state of the last update on
that target. Clean seed.

**`op=create` inside the chain.** Cannot happen. Kind-prefixed
UUIDs are not reused
([`data-model.md → ID shape`](../data-model.md#id-shape--kind-prefixed-uuids-throughout)),
so any target's create delta has the lowest log_position on that
target. The `log_position >= D.log_position` filter on an update
D excludes it by construction.

**Wizard-created targets.** Wizard creation does not write deltas
([`data-model.md → Wizard creation is exempt from the delta log`](../data-model.md#entry-mutability--rollback)).
First delta on a wizard-created target is some later update; the
walk seeds from current state and runs normally. No special case.

**Branch forks.** Chain query filters on `D.branch_id`
exclusively. Parent deltas copied into the child branch carry
their parent `undo_payload` verbatim — same merge semantics.
Reverse-applied parent deltas
([`data-model.md → Branch model`](../data-model.md#branch-model))
never enter the child branch's log; the child's chain for any
target starts cleanly post-fork. Cross-branch walks never happen.

**Rollback to entry N.** Reverses-and-deletes deltas with
`log_position >= N`. Cache entries for those delta IDs become
stranded — they point to delta IDs that no longer exist in the
table, but nothing reads them anymore (the deltas don't render
on any surface). LRU absorbs them naturally. Worst-case
quantification: a heavy 100-delta session that gets rolled back
strands ~5% of cache at the 2000 cap. Minor LRU pressure, no
correctness impact, no invalidation API needed.

**CTRL-Z.** Same shape as rollback at `action_id` granularity
([`data-model.md → Entry mutability & rollback`](../data-model.md#entry-mutability--rollback)).
Same conclusion.

**Corrupt state (row missing, no delete delta in chain).** Should
not happen — the write layer enforces "narrative-field mutation
⇒ delta + row update in one transaction"
([`data-model.md → Entry mutability & rollback`](../data-model.md#entry-mutability--rollback)).
If it does occur (manual SQL, broken import), the seed-state
`SELECT` returns null, `populate` throws, host falls back as
described in the error path.

**Long chains.** A delta deep in history on a hot target (a
protagonist with 500 subsequent updates) means a 500-step
in-memory walk per populate. Sub-millisecond per step on typical
hardware; the SQL chain query is the dominant cost and depends
on the composite index named in the followups section below.
Free side effect: the cache picks up the 499 walked-through
deltas, so subsequent populates inside the same window are
instant.

**Translation deltas.** `deltas.target_table` includes
`translations`
([`data-model.md → Translation`](../data-model.md#translation)).
The cache and walk are table-agnostic — they treat translations
rows identically to entities rows. The host's diff-prose renderer
is what knows translations-specific field semantics.

**Action-id grouping (deferred).** `DeltaLogRow`'s `What this
design defers` notes
([`delta-log-row.md`](../ui/patterns/delta-log-row.md#what-this-design-defers))
flag that v1 renders one row per delta; future affordance is
clustering by `action_id`. The cache stays per-delta; when
grouping ships, the host aggregates summaries across `peek` calls.
No cache redesign needed — future-compatible.

## Search story

The cache is display-only. Search does not touch the cache;
search uses SQL over persistent delta data. Per-surface search
scope:

- **Entity and lore History tabs**
  ([`world.md → History tab`](../ui/screens/world/world.md#history-tab))
  — `LIKE` on `target_table` + `op` + field-path strings, plus
  `json_extract` over `undo_payload` JSON. Catches matches where
  the searched value was on the **old** side of any delta.
- **Diagnostics Hub Delta log tab**
  ([`diagnostics.md → Tab 5 — Delta log`](../ui/screens/diagnostics/diagnostics.md#tab-5--delta-log))
  — free-text search across target names and field paths.
  Narrower scope than the per-target tabs; the cost of
  `json_extract` over thousands of rows in an unscoped surface
  argues against it.

What both surfaces miss: **NEW-side-only value strings.** A value
that was just added and not yet replaced lives only in the
current target row, not in any `undo_payload`. Searching deltas
won't find it. Acceptable v1 limitation — users searching for
"find when I added X" can navigate from the current entity's
current state into its History tab instead.

No regression to either per-screen spec; both are preserved as
written.

## UX trade-offs

**Fallback-summary flash on cold scroll-into-view.** A user
opening a history tab for the first time in a session and
scrolling quickly through many rows sees the prose fallback
(`Modified traits, drives`) for ~50-100 ms per row before each
upgrades to the rich form. Perceptible but bounded. Mitigations
available if measurement shows it hurts: render-overscan so
populate triggers before the row enters the viewport; transient
skeleton in place of the fallback string; deliberate suspense
hold. None committed in v1 — acceptable as a known UX state and
revisitable cheaply.

**Cold every launch.** First open of any history surface in a
new session re-walks the chain. The most recent deltas (typically
what the user looks at) are cheapest to walk. Older deltas pay
proportionally; the per-target batched fill amortizes within a
window of visible rows.

## Followups resolved and new sub-followups

### Resolved by this design (removed from `followups.md`)

The entire `Delta diff cache for history surfaces` entry. Its
five deferred decisions:

- **Concrete table schema.** N/A — no table.
- **Eviction / vacuum policy.** In-memory LRU, hard cap 2000
  entries.
- **Cold-read strategy for the global delta-log surface.**
  Per-delta lazy fill, batched per-target by host. First paint
  shows fallback summaries; rows upgrade to rich `(old, new)`
  prose as walks resolve. No precompute, no idle prewarm.
- **Backfill / rebuild ergonomics.** N/A — no persistent state
  to rebuild.
- **Concurrency (in-flight walk vs. fresh delta write).** Single
  SQLite read transaction per walk (chain query plus current
  state read). WAL handles the rest. No cache invalidation API.

The "direction agreed" bullets in the original entry — separate
cache table, per-field, lazy population, render-time formatting
— get superseded. The render-time formatting bullet survives
unchanged and is the entry point for this design.

### New sub-followups (added to `followups.md`)

**`undo_payload` encoding for nested fields.** Pre-existing
data-model gap. `data-model.md:262` and the "Delta storage
economy" decision describe `undo_payload` as a partial diff of
changed fields with PRE-change values but do not pin the
encoding for nested keys: a touch to `entity.state.traits` could
be recorded as `{ state: { traits: [...] } }`,
`{ "state.traits": [...] }`, or `{ state: <whole pre-state> }`.
The cache walk and the rollback path both depend on an
unspecified contract here. Lands as a `## Data-model` followup
to resolve when the write layer is built or when classifier
output validation is next touched.

**Composite index `deltas (branch_id, target_id, log_position)`.**
The chain query's WHERE clause is exactly this composite. Without
the index, every populate scans the `deltas` table — degrading
the cache from "sub-100 ms hidden cost" to "noticeable on any
non-trivial story." The index is mandatory for the cache to
perform, not a nice-to-have. Lands either as a one-line addition
to `data-model.md`'s deltas-table declaration or as a small
`## Data-model` followup if indexes are tracked separately.

### Surfaces this design touches but does not change behavior on

- The DeltaLogRow pattern keeps its `summary: string` contract
  unchanged. One paragraph addition pointing at the new
  architecture section so consumers know where the resolution
  for `op=update` summaries comes from.
- The Diagnostics Hub Delta log tab's "Fallback while cache is
  pending: raw `undo_payload` JSON viewer" sentence
  ([`diagnostics.md:197-199`](../ui/screens/diagnostics/diagnostics.md#tab-5--delta-log))
  needs to align with the uniform prose fallback — JSON viewing
  is the pattern's separately-deferred "inline diff expansion"
  affordance per
  [`delta-log-row.md → What this design defers`](../ui/patterns/delta-log-row.md#what-this-design-defers),
  not the populate-pending state. The same paragraph carries the
  cross-reference that currently points at the
  about-to-be-removed `followups.md` anchor; the redirect lands
  in this design's commit.

## What this design does not do

- **Persist anything.** No table, no FTS index, no on-disk cache.
- **Touch the schema.** `deltas` is unchanged; no migration.
- **Change any per-screen UX.** Wireframes, layouts, filter
  chips, search bars: all unchanged. The cache is invisible to
  the user.
- **Index search.** Search remains pure SQL over `deltas` per
  the existing `world.md` and `diagnostics.md` scopes.
- **Pin or precompute.** No idle prewarm, no
  always-cached-recent-N, no per-story preheat.
- **Expose invalidation.** No `invalidate(deltaId)`, no `clear()`.
  Stranded entries from rollback / CTRL-Z are absorbed by LRU.
- **Coordinate across windows.** Single renderer process at v1;
  IPC if multi-window ships later.
