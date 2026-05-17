# Observability substrate + surface inventory

**Date:** 2026-05-17
**Status:** Integrated. Resolves the previously-parked
`Observability / debug UI` entry (removed from `docs/parked.md` by
this session's commit; the canonical home is now
[`observability.md`](../observability.md) plus
[`ui/screens/diagnostics/diagnostics.md`](../ui/screens/diagnostics/diagnostics.md)).

## Problem

The codebase has scattered footprints of observability: classifier
emits a "logged anomaly" with no destination, memory probe is fully
designed but is one instance of a broader pattern, App Settings ·
Diagnostics is a placeholder with a "view-logs button" but no log
sink, the parked entry calls for the design pass this session
delivers.

Memory probe was built for a specific use case (empirical-tuning
workflow with capture+simulator). It generalized into "every
subsystem should be inspectable" without the contracts that would
let other subsystems wire in cleanly. The user explicitly framed
this session as **before code is woven through the app** — define
the contracts up-front so each subsystem can emit observability
data from its first commit instead of bolt-on later.

This pass defines:

- The capture-and-storage substrate (what persists, what doesn't,
  where in-memory data lives).
- The logger contract (level vocabulary, kind namespace, record
  shape, subsystem emission inventory).
- The structural sinks (`httpCallSink`, `turnCaptureSink`).
- The gating model (master toggle, debug-level toggle, wipe
  semantics).
- The surface inventory (five tabs in a unified Diagnostics Hub).
- Cross-cuts (privacy, performance budget, cross-platform).

Each surface gets a high-level spec; per-surface detail passes
follow when each is built. The contracts pass is the deliverable.

## Scope

**In:** observability contracts for inspecting what the AI
pipeline did (prompts, retrieval, classifier outputs, mutations,
errors, anomalies, performance), plus the structural surfaces
that consume those contracts.

**Out:** end-user analytics (we're local-first), external crash
reporting (none, by data strategy), business-state surfaces
(Plot, World — those are domain surfaces that incidentally show
classifier output), parameter tuning beyond memory probe (the
simulator pattern doesn't generalize), production-support export
bundles (parked-until-signal), file-based persistent logging
(parked-until-signal).

## Use cases — primary motivators

- **Per-turn transparency.** "What did the AI do on this specific
  turn?" Click an entry, see prompts that produced it, what was
  retrieved, what the classifier wrote, any anomalies. Strong
  anchor in the reader-composer flow.
- **Cross-cutting forensics.** "Why is the system slow / failing
  / wrong?" Live HTTP call log, structured log viewer, cross-tab
  navigation via `actionId`. The parked global delta-log browser
  fits naturally here as Tab 5.

**Out:** parameter tuning (memory probe owns this — does not
generalize), production support (parked).

## Audience

Dev / power-user, gated by an explicit toggle. Same shape as
memory probe's master gate. Capture content is technical (raw
prompts, raw classifier JSON, raw event trace) — no UX softening
for non-developers. Off by default.

## Substrate

Three storage modes coexist:

- **Persisted, story-anchored** — `probe_captures` table. Unchanged
  from the existing [memory probe design](../memory/probe.md).
  Genuine persistence is justified by the simulator workflow
  (capture today, return tomorrow with edited params).
- **In-memory, story-anchored** — per-turn diagnostic data keyed by
  `actionId`. Classifier raw output, event-bus trace,
  cross-references to HTTP call IDs and log entry IDs from the same
  actionId. Cap ~100 turns most-recent, FIFO.
- **In-memory, app-anchored** — HTTP call log (~200 cap) and
  structured log entries (~500 cap). No story dimension; ring
  buffers ordered by time-of-emission.

All three in-memory slices live in **one renderer-side Zustand
`diagnosticsStore`** with three slices: `turnCaptures`, `httpCalls`,
`logEntries`. Renderer-side because all HTTP and classifier work
happens renderer-side in both Electron and React Native.
Cross-platform with no IPC dance.

**Persistence is the exception, not the default.** The heuristic:
persistence is justified when the use case is "return to it later"
(across sessions, across days). It's not justified for "see it now
or recently" which an in-memory ring buffer covers. Memory probe is
the only case where return-to-it-later semantics are load-bearing
(simulator).

### Why not event-bus-driven

The existing event bus (per
[`generation-pipeline.md → Event bus`](../generation-pipeline.md#routing-model))
emits production events including `delta_emitted`, with a comment
"for dev / debug surfaces." This design **deliberately does not
route diagnostics through the event bus.** Subsystems already know
they're doing something diagnostic-worthy (sending an HTTP call,
logging a warning). A direct `httpCallSink.record(...)` or
`logger.warn(...)` call is no heavier than emitting a bus event and
clearer about intent. The event bus stays focused on production
state-flow; diagnostics is a parallel concern with no coupling.

### Ingress

Subsystems emit directly into sinks. The sinks are **small
singletons** living in the renderer:

- `logger` — for free-form structured emissions.
- `httpCallSink` — for HTTP request/response capture.
- `turnCaptureSink` — for per-turn phase events + classifier output.

Each sink no-ops at function entry when the master gate is off.
No middleware. No bus subscription. Direct.

### Lifecycle

- **Master toggle on.** Sinks active. Ring buffers fill as
  subsystems emit. UI subscribes and renders live.
- **Master toggle off.** All sinks no-op. The three in-memory
  ring buffers **clear immediately**. "Off means off." Persisted
  `probe_captures` are NOT wiped (memory probe's existing rule —
  explicit clear-all is the only path).
- **App quit.** In-memory buffers vaporize. Probe_captures persist
  (existing behavior).

## Logger contract

Three levels: `error | warn | debug`. No `info` — structural events
(phase boundaries, action commits) flow through the turn-capture
sink, not the logger. The logger is for **semantic** emissions where
a subsystem deliberately reached for "this is noteworthy."

- **`error`** — failure that did not recover (pipeline aborted,
  provider error after retries exhausted).
- **`warn`** — degraded path taken or anomaly handled (classifier
  clamped, retry succeeded, soft-fail, schema repair).
- **`debug`** — verbose detail, off by default even when master is
  on. Gated by a secondary `debug_level_enabled` toggle.

### Record shape

```ts
type LogEntry = {
  id: string // ulid
  emittedAt: number // ms epoch
  level: 'debug' | 'warn' | 'error'
  kind: LogKind // template-literal-typed
  fields: Record<string, unknown>
  actionId?: string // present when emission is turn-bound
}
```

### Kind namespace

`<subsystem>.<event_name>`, snake_case. The subsystem half is a
**closed union**:

```ts
type LogSubsystem =
  | 'pipeline'
  | 'action_layer'
  | 'classifier'
  | 'retrieval'
  | 'provider'
  | 'embedder'
  | 'translation'
  | 'memory'

type LogKind = `${LogSubsystem}.${string}`
```

The template-literal type rejects any `kind` whose prefix isn't a
known subsystem at compile time. A runtime regex check
(`/^[a-z][a-z0-9_]*$/` against the event-name half) catches
snake_case drift in dev builds with a `console.warn`. Adding a new
subsystem extends the union in one source-of-truth file
(`types/diagnostics.ts`); the Logs tab UI iterates the same union
directly to render its subsystem filter chips, so subsystem
additions propagate to the UI with no manual wiring.

Typed `fields` per kind (full per-kind schema enforcement) is
heavier than needed at the contracts pass. Fields stays
`Record<string, unknown>` for v1.

### Subsystem emission inventory

Illustrative, not exhaustive. The contracts pass enumerates the
surface so each implementation knows from day 1 to reach for
`logger` rather than `console.warn`:

- `pipeline.*` — `phase_failed`, `run_aborted`, `recovered`
- `action_layer.*` — `user_write_rejected`, `constraint_violation`
- `classifier.*` — `delta_clamped`, `schema_repair`, `empty_output`
- `retrieval.*` — `row_skipped_stale`, `empty_pool`, `knn_error`
- `provider.*` — `retry_succeeded`, `rate_limited`,
  `stream_interrupted`, `request_failed`
- `embedder.*` — `offline`, `compute_failed`, `staleness_detected`
- `translation.*` — `soft_failed` (when that followup lands)
- `memory.*` — periodic-classifier and chapter-close phase
  emissions

The contract is the **shape** (level, kind, fields, optional
actionId), the namespacing convention, and the expectation that
subsystems route through `logger` from their first commit. Kinds
grow organically.

### Console mirroring

When master gate is ON, `logger.<level>` writes the store entry AND
mirrors to `console.<level>`. Both are gated by the same master
toggle. When OFF, both no-op.

The contract does NOT define a build-time override that auto-enables
the gate in dev builds; that's an implementation choice for the
launch config (so engineers can default to "diagnostics on" when
running `pnpm dev` without flipping the toggle every session).
Production builds always default OFF.

## Structural sinks

Two non-logger sinks for data that's structurally captured rather
than free-form emitted.

### `httpCallSink`

Every outbound HTTP request, app-global. Browser-dev-tools-Network
mental model.

```ts
type HttpCall = {
  id: string                       // ulid, assigned at beginCall
  startedAt: number
  method: string
  url: string
  requestHeaders: Record<string, string>   // redacted at sink boundary
  requestBody?: unknown
  source?: string                  // 'provider:<id>' | 'embedder:download' | ...
  actionId?: string                // present when call was made inside a turn

  state: 'in_flight' | 'completed' | 'failed'

  // Populated on state transition out of 'in_flight':
  endedAt?: number
  durationMs?: number
  status?: number | null
  responseHeaders?: Record<string, string>  // redacted at sink boundary
  responseBody?: unknown
  streamed?: boolean
  error?: string                   // present when state === 'failed'
}

httpCallSink.beginCall(args: {
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody?: unknown
  source?: string
  actionId?: string
}): string                         // returns the assigned id

httpCallSink.completeCall(id: string, args: {
  status: number
  responseHeaders: Record<string, string>
  responseBody?: unknown
  streamed?: boolean
}): void

httpCallSink.failCall(id: string, error: string): void
```

#### Pairing

The `id` returned by `beginCall` is the handle. The HTTP wrapper
holds it locally between begin and complete/fail. No correlation
logic; the wrapper threads its own id through:

```ts
const fetchWithCapture = async (url, opts) => {
  const id = httpCallSink.beginCall({
    method: opts.method ?? 'GET',
    url,
    requestHeaders: opts.headers,
    requestBody: opts.body,
    source: opts.source,
    actionId: getCurrentActionId(),
  })
  try {
    const res = await fetch(url, opts)
    const body = await res.text() // or accumulate for streamed
    httpCallSink.completeCall(id, { status: res.status /* ... */ })
    return res
  } catch (err) {
    httpCallSink.failCall(id, String(err))
    throw err
  }
}
```

#### Streaming

Body accumulation during streaming happens **inside the wrapper** —
no incremental sink updates during the stream. At stream end,
`completeCall` fires once with the final concatenated body and
`streamed: true`. UI shows the in-flight indicator throughout,
then resolves to completed in one transition. A future
`progressCall(id, { chunks, bytes })` for live byte-count
visibility is parked.

#### Ring buffer behavior

- `beginCall` allocates a slot. If buffer is at cap, oldest
  **non-in-flight** entry evicts. In-flight entries are protected.
- `completeCall` / `failCall` mutate the existing slot in place;
  state flips to `'completed'` or `'failed'`. Row identity (ULID)
  is stable across the transition, so React keys don't churn.
- **Cross-protection with turnCaptures:** a completed HTTP call
  whose `actionId` is still in the `turnCaptures` buffer is also
  protected from eviction. Preserves cross-tab nav from
  per-turn-inspector for buffer-resident turns even when call
  fan-out exceeds the default 200 cap (translation-heavy workloads
  fire 8-10 calls per turn).
- Pathological "all 200 concurrent in-flight" → silent skip + a
  debug log entry. Essentially impossible in practice.

#### Redaction

Auth-style headers are redacted at the **sink boundary**, not the
call-site. `beginCall` and `completeCall` both sanitize headers
through a denylist before store-write:

```ts
const REDACTED_REQUEST_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  // Provider-specific auth headers extend here
])

const REDACTED_RESPONSE_HEADER_NAMES = new Set([
  'set-cookie',
  // Response auth headers extend here
])
```

Case-insensitive match. Redacted values render as `'***'` so the
header's presence is visible (useful for "did we send auth?") but
the value is hidden. Net effect: API keys exist in unredacted form
only at the actual `fetch()` boundary; they never reach the
Zustand store, never appear in the diagnostics hub, never can leak
via screenshot/share.

### `turnCaptureSink`

One `TurnCapture` per turn, anchored to `actionId`, accumulated
across the turn's lifecycle.

```ts
type TurnCapture = {
  actionId: string
  branchId: string
  targetEntryId?: string           // set when AI entry lands; undefined for aborted-before-write
  startedAt: number
  endedAt?: number                 // undefined while in-flight
  outcome?: 'completed' | 'aborted' | 'failed'
  outcomeReason?: string
  phaseEvents: PhaseEvent[]
  classifierOutputRaw?: unknown    // pre-action-layer-validation structured output
}

type PhaseEvent = {
  phase: string                    // 'pre' | 'retrieval' | 'narrative' | ...
  kind: 'enter' | 'exit'
  at: number
  durationMs?: number              // present on 'exit'
}

turnCaptureSink.beginTurn(args: { actionId; branchId }): void
turnCaptureSink.appendPhaseEvent(actionId: string, event: PhaseEvent): void
turnCaptureSink.recordClassifierOutput(actionId: string, raw: unknown): void
turnCaptureSink.endTurn(actionId: string, outcome: TurnOutcome, reason?: string): void
```

#### No explicit cross-slice linking

`TurnCapture` does NOT store `httpCallIds[]` or `logEntryIds[]`.
The `actionId` on each `HttpCall` and `LogEntry` is the join key;
the per-turn inspector filters those slices by actionId at render
time. Single source of truth (the actionId on the source record),
zero linking drift, zero append-coordination across sinks.

#### Eviction

Cap ~100 turns. When `beginTurn` pushes over cap, oldest
**finalized** turn evicts. In-flight turns (`endedAt` undefined) are
protected. Pathological "100 concurrent in-flight" → silent skip +
debug log entry (essentially impossible given pipeline
single-writer-per-branch).

### Ambient `actionId` mechanism

The cross-tab nav model depends on every HTTP call and log entry
made during a turn carrying the turn's `actionId`. This is
contract-critical but **implementation-defined**: the
mechanism by which sinks read the "current actionId" is the
implementation's choice (AsyncLocalStorage isn't usable in
renderers; React's async render context isn't AsyncLocalStorage-
friendly; a module-level mutable variable works under single-
writer-per-branch but breaks under cross-branch concurrency).

**Contract requirement:** the orchestrator MUST set an ambient
actionId at `beginRun` and clear at `commitRun` / `abortRun`. Sinks
read from that ambient source. Implementations MUST guarantee
threading through every async hop during a turn (or the
correlations break silently — entries appear in the global log but
without a turn pointer, no error, no warning).

A lint rule banning direct sink calls that bypass the ambient
provider is a worthwhile implementation guardrail. Note as
implementation followup.

## Gating model

### Settings fields

Under `app_settings.diagnostics.*` (inside the existing JSON, not
promoted to columns — matches placement pattern for every other
debug toggle):

- **`enabled: boolean`** — master toggle. Default `false`. When
  off: every sink (`logger`, `httpCallSink`, `turnCaptureSink`)
  and memory probe captures no-op. Console mirroring also off.
- **`debug_level_enabled: boolean`** — secondary. Default `false`.
  Only meaningful when master is on. When off, `logger.debug(...)`
  no-ops; warn and error still flow.

Per-story on `stories.settings.probe_mode_active: boolean`
(existing, unchanged) — gates memory probe persistent captures for
that story.

### Memory probe gate consolidation

The existing `app_settings.diagnostics.probe_mode_enabled` field is
**renamed** to `app_settings.diagnostics.enabled` and gains broader
scope — now the master gate for the entire diagnostics layer.
Memory probe writes happen when master is ON AND per-story
`probe_mode_active` is ON. Net effect for memory probe: same
two-level gate, app-level field renamed and scope widened. Doc-
only change at this stage since memory probe is designed but not
yet built.

### Wipe semantics

Master flips OFF → the three in-memory ring buffers
(`turnCaptures`, `httpCalls`, `logEntries`) clear immediately.
Persisted `probe_captures` are NOT wiped (memory probe's existing
rule). The asymmetry tracks the persistence asymmetry: ephemeral
data vaporizes on explicit off; persisted data only clears via
explicit "Clear all captures" action.

### UI placement

All toggles live under **App Settings · Diagnostics**. The tab
body graduates from a thin placeholder to:

1. Master toggle — `Enable diagnostics capture`
2. Debug-level subtoggle — `Include debug-level emissions`
   (disabled when master is off)
3. Memory probe section — existing per-story-toggle copy stays;
   references master toggle as required prerequisite
4. Performance stats + raw-settings export (existing placeholder
   items that stay; they're configuration/display surfaces, not
   capture-stream views)

The previously-placeholdered "view-logs button" is **subsumed**
by the Diagnostics Hub's Logs tab. No separate button.

### Hub entry point

**Actions (⚲) menu gains: `Open Diagnostics Hub`.** Reachable from
every screen's top-bar (Actions menu is universal chrome).
**Hidden when master toggle is OFF** — the toggle itself is the
discovery point. Not "show as disabled" — fully absent.

## Surface inventory — Diagnostics Hub

New screen at `docs/ui/screens/diagnostics/diagnostics.md`.
App-level chrome, top-bar `[←] [Diagnostics] [⚲]`. Per-tab detail
passes follow when each is built.

### Tab strip — five tabs

#### Tab 1 — Memory probe (existing, story-anchored)

Sources `probe_captures` (persisted). Tab content per the existing
[`screens/memory-probe/memory-probe.md`](../ui/screens/memory-probe/memory-probe.md);
the hub doc **references** rather than relocates the existing
screen — keeps blast radius small for this design pass. Requires
picking a story (existing behavior).

#### Tab 2 — Per-turn inspector (new, story-anchored AND turn-anchored)

Sources `turnCaptures`. Two-pane: list of recent turns (reverse-
chronological by `startedAt`, branch filter, outcome-colored),
detail pane shows selected turn's phase timeline + classifier raw
output (JSON viewer) + cross-cut rows from `httpCalls` and
`logEntries` filtered by `actionId`. Cross-tab: row click on a
referenced HTTP call → opens Call log focused on that row; row
click on a log entry → opens Logs focused on that entry.

#### Tab 3 — Call log (new, app-global)

Sources `httpCalls`. Single-list, reverse-chronological by
`startedAt`. Row state-aware: pulsing in-flight, status chip +
duration on completed, error chip on failed. Click expands the
row to show request + response payloads in the JSON viewer (per
[`patterns/data.md`](../ui/patterns/data.md)). Filters: source,
state, HTTP-status range, free-text URL/body search. Cross-tab:
actionId chip on a row → per-turn inspector when actionId is
present.

#### Tab 4 — Logs (new, app-global)

Sources `logEntries`. Single-list, reverse-chronological by
`emittedAt`. Row shows level chip + kind + one-line field summary.
Click expands to show full `fields` JSON. Filters: level
multi-select (debug option present only when `debug_level_enabled`
is on), subsystem multi-select iterating the `LogSubsystem` union
directly, kind free-text. Cross-tab: actionId chip → per-turn
inspector.

#### Tab 5 — Delta log (new, story-anchored, branch-scoped by default)

Sources the canonical `deltas` table (persisted by design — the
second persisted source after `probe_captures`). Branch-scoped by
default, with a filter to expand to "all branches in this story."

Row shape extends the existing
[`DeltaLogRow` pattern](../ui/patterns/delta-log-row.md). Same
primitive World and Plot History tabs already use; the global view
inherits the row shape directly. Difference from per-entity
History tabs: those scope to one target_id's lineage. The delta
log tab is unscoped across rows (every delta) but scoped within a
story.

Filters: `source` multi-select (`classifier | lore_mgmt |
user_edit | chapter_close | ...`), `target_table` multi-select
(`entities | lore | happenings | threads | translations | ...`),
`branch_id` within-story (default current; expand-to-all-branches
toggle), `action_id` (implicit when navigated from per-turn
inspector), free-text search across target names + field paths,
optional time range.

**Cross-tab:** actionId chip → per-turn inspector when actionId is
present on the delta AND the corresponding turn capture is still
in the ring buffer. When the turn has aged out, chip is
informational only.

**Prerequisite:** the [delta diff cache followup](../followups.md#delta-diff-cache-for-history-surfaces)
covers `(old → new)` rendering for ALL history surfaces. Tab 5
inherits the prerequisite; doesn't add a new one. Fallback while
cache is pending: raw `undo_payload` JSON viewer, less readable
but functional.

**Cost.** Query needs `LIMIT` + virtualization per
[`patterns/lists.md`](../ui/patterns/lists.md) (its Used-by line
"Future global delta-log observability panel" updates to "Delta
log tab in Diagnostics Hub" on integration).

### Anchoring split

- **Story-anchored:** Memory probe, Per-turn inspector, Delta log
  (three tabs).
- **App-global:** Call log, Logs (two tabs).

The hub has a "no current story" UX: a story picker that all three
story-anchored tabs share, following the pattern Memory probe
already has. Single source of truth for "which story are we
inspecting"; tabs subscribe to it. Detail for the per-tab future
pass.

### Cross-tab nav substrate

Tabs share an `actionId` deep-link param. A tab transition that
includes an actionId sets this param and auto-focuses the
appropriate row. State persists across tab switches within a hub
session; clears on master toggle-off (consistent with ring-buffer
wipe).

### Empty states

- Master OFF + deep-link to hub: "Diagnostics is off — turn on the
  master toggle to enable capture" with link to App Settings ·
  Diagnostics.
- Master ON + buffers empty: per-tab copy ("No turns captured yet
  — trigger a turn to start" / "No calls yet" / "No log entries
  yet").

### Mobile expression

Tab strip via the [`patterns/tabs.md`](../ui/patterns/tabs.md)
primitive — horizontal strip on tablet+, falls back to Select at
phone tier per the existing Group C rule. Each tab body inherits
whatever list-pane / two-pane pattern fits its shape (per-turn
inspector uses two-pane; Call log / Logs are single-list).
Memory probe's existing mobile design carries over unchanged.

### Top-bar

App-level chrome `[←] [Diagnostics] [⚲]` throughout. No status
pill, no chapter chip, no story chrome at the hub level — even
when a tab body pivots into per-story content. Tab body owns its
own story context internally.

## Cross-cuts

### Privacy

The in-memory-only stance changes the privacy profile materially.

- HTTP request headers (including provider API keys in
  `Authorization: Bearer ...`) are **redacted at the sink
  boundary** before any store-write. Auth-style headers replaced
  with `'***'`. Unredacted secrets never reach the Zustand store;
  they exist only inside the HTTP wrapper's local scope during a
  single request lifecycle.
- Prompt bodies (assembled story context, entity descriptions,
  retrieval results) live in RAM only. Vaporize on app quit.
- `probe_captures` remains the only diagnostic data that touches
  disk; per memory probe's existing design, payloads are gzipped
  retrieval-state JSON — no full prompts, no LLM responses, just
  candidates and scores. Sensitivity profile unchanged.

**Outstanding concern:** the "manual export to JSON file" parked
followup. If/when that lands, it WILL persist whatever the user
chose to export with the sensitivity that implies. The export
feature's own design pass owns the redaction policy (API keys
auto-stripped, prompt bodies opt-in or auto-truncated). Flagged
in followups so the constraint carries forward.

### Telemetry boundary

**No external reporting.** Purely local. The diagnostics layer
does not phone home, does not submit crash reports to third
parties, does not ship telemetry. The user's diagnostic data
stays on their device. This matches the local-first data strategy
(see [`tech-stack.md`](../tech-stack.md)).

### Performance budget

"Should be undetectable" rather than "fastest possible."

- `logger.<level>(...)` — ~10–50 µs per call (object alloc + store
  update + console mirror).
- `httpCallSink.beginCall / completeCall` — ~50–200 µs each,
  dominated by request/response body structured clone.
- `turnCaptureSink.appendPhaseEvent` — ~10–50 µs.
- Memory probe — unchanged from existing budget (<5 ms light,
  <20 ms deep).

Ring buffers are bounded arrays with O(1) amortized eviction (head-
pointer rotation, no shifting). Zustand selector-based subscribers
re-render only when their slice changes — UI cost scales with
what's visible, not buffer churn.

Master gate OFF → all sinks no-op at function entry. O(1)
regardless of how chatty subsystems become.

### Memory ceiling

Worst-case estimates at default caps:

| Slice          | Cap | Per-entry typical             | Worst-case row | Total typical |
| -------------- | --- | ----------------------------- | -------------- | ------------- |
| `httpCalls`    | 200 | ~50 KB (prompt + streamed)    | ~250 KB        | ~10 MB        |
| `turnCaptures` | 100 | ~10 KB (classifier + events)  | ~50 KB         | ~1 MB         |
| `logEntries`   | 500 | ~1 KB (level + kind + fields) | ~10 KB         | ~0.5 MB       |
| **Total**      |     |                               |                | **~12 MB**    |

Under long-context workloads (Claude 200K context windows), an
individual call's request body can reach 200+ KB; the total can
approach 40 MB before hitting the upper bound (~50 MB). Acceptable
on Electron; reasonable on RN. Cap-tuning is an in-code follow-up
if pathological workflows push consistently against the ceiling.

### Cross-platform

- **Electron renderer:** Zustand store lives in the renderer. All
  v1 outbound HTTP originates renderer-side (AI SDK, embedder
  calls), so no IPC needed. Main-process emit can layer on later
  via the existing IPC bus without changing the contract.
- **React Native:** single JS context, Zustand store works
  identically. No platform-specific paths.
- **Multi-window on Electron:** each window is its own renderer
  with its own diagnostics store. State is window-local; window A
  doesn't see window B's calls. Acceptable — multi-window is
  uncommon; a cross-window aggregator would be over-engineering
  for v1.

### Test harness

Sinks are pure singletons in the renderer's diagnostics store
module. Unit-testable in isolation by importing the module,
calling sink methods, asserting on store state. No mocking
infrastructure required. Integration tests of "subsystem X emits
the right log kinds" sit naturally alongside that subsystem's
tests, not in a centralized observability test suite.
Implementation note, not contract.

## Adversarial pass

### Load-bearing assumptions

1. **The `actionId` threading mechanism.** Most fragile assumption.
   Every cross-tab nav model depends on every HTTP call and log
   entry during a turn carrying the turn's actionId. If a
   subsystem fails to thread it (e.g., async callback that loses
   ambient context), correlations break **silently** — entries
   show up in the global log without a turn pointer; no error,
   no warning, just missing data. Mitigation: explicit contract
   requirement (above) + lint rule banning sink calls that
   bypass the ambient provider.

2. **Sinks honor the gate.** If a subsystem bypasses `logger` and
   calls `console.warn` directly, master-toggle-off doesn't
   suppress it. Mitigation: ESLint rule banning `console.warn |
console.error` outside the logger module. Implementation
   followup.

### Edge cases

- **HTTP cap of 200 small for translation-heavy workloads.** A
  turn with translation fires 8–10 calls; ~20 turns cycle the
  buffer. Mitigation: protect HTTP calls whose owning turn is
  still in `turnCaptures` from eviction (specified above in the
  sink contract).
- **Turn aborted before AI entry lands.** `targetEntryId`
  undefined. Turn shows in inspector list but isn't reachable via
  entry-click. Acceptable; list view is the entry point.
- **HTTP retries.** Each network attempt is one `HttpCall`;
  retries appear as N entries correlated by shared actionId +
  `provider.retry_succeeded` log entry.
- **Master toggle flipped mid-turn.** Off → buffers wipe,
  in-flight turn's subsequent emissions silently no-op (sinks
  fail-safe). On → no retroactive capture; next turn captures
  normally.
- **Multi-branch concurrent turns.** Different actionIds, no
  collision in the buffer — provided the ambient-actionId
  mechanism is branch-scoped (not module-global). Loops back to
  assumption #1.

### Read-site impact

- Memory probe tab: unchanged (existing read path, existing
  table).
- New read sites (Per-turn inspector, Call log, Logs, Delta log):
  all introduced by this design. No existing read site reshapes.
- DeltaLogRow pattern: reused in Tab 5 without contract change.

### Missing perspectives

- **Backup format.** Probe_captures excluded from delta-log
  replay (existing); whether future app-data backup includes it
  is an unanswered question. Decision deferred until backup design
  lands.
- **A11y.** Dev/power-user surface; bar is "inherits primitives'
  defaults" not "fully audited." Detail for per-tab passes.
- **Storybook integration.** Each tab eventually wants stories
  exercising it with mocked data. Implementation followup.

### Verified vs assumed

- **Verified:**
  the previously-parked `Observability / debug UI` entry (removed
  by this commit; full historical text was at `parked.md` pre-edit)
  named delta-log as the initial candidate; memory probe used
  `app_settings.diagnostics.probe_mode_enabled`
  ([`data-model.md:288`](../data-model.md#app-settings-storage),
  [`memory/probe.md → Schema delta`](../memory/probe.md#schema-delta));
  event bus emits ALL events including for dev/debug
  ([`generation-pipeline.md → Routing model`](../generation-pipeline.md#routing-model))
  but this design chose NOT to route diagnostics through it.
- **Assumed:** Zustand works identically in Electron renderer +
  RN (true in general; project-specific wiring with persist
  middleware not checked). AI SDK runs renderer-side on both
  platforms. "Single-writer-per-branch" pipeline model means
  cross-branch concurrency is rare (verified in
  [`generation-pipeline.md`](../generation-pipeline.md)).

## Integration plan

### New canonical docs

- **`docs/observability.md`** — substrate + logger + sinks +
  gating + cross-cuts. Authoritative source for the diagnostics
  layer. Cross-ref from `architecture.md` and the new hub UI doc.
- **`docs/ui/screens/diagnostics/diagnostics.md`** — hub UI doc
  (top-bar, tab strip, per-tab high-level specs, empty states,
  mobile expression). Forward-pointers to per-tab future detail
  passes.
- **`docs/ui/screens/diagnostics/diagnostics.html`** — hub
  wireframe (tab strip + minimal body sketch).

### Canonical doc updates

- **`docs/parked.md`** — REMOVE the `Observability / debug UI`
  entry; this session resolves it.
- **`docs/data-model.md → App settings storage`** — rename
  `diagnostics.probe_mode_enabled` to `diagnostics.enabled` and
  widen its scope (no longer probe-specific). Add
  `diagnostics.debug_level_enabled`. Update the JSON shape
  description.
- **`docs/memory/probe.md → Scope` + `→ Schema delta`** — update
  references to the renamed app-level field
  (`probe_mode_enabled` → `enabled`); note widened scope.
- **`docs/ui/screens/app-settings/app-settings.md → APP ·
Diagnostics`** — revise body content (master toggle +
  debug-level subtoggle + memory probe section; view-logs button
  subsumed by Logs tab; the "Open Diagnostics Hub" link is in
  Actions menu, not body). Update screen-specific open questions
  to remove the resolved parked-entry boundary question (line
  ~763-765).
- **`docs/ui/patterns/lists.md → Used by`** — rename "Future
  global delta-log observability panel" entry to "Delta log tab
  in Diagnostics Hub."
- **`docs/ui/screens/reader-composer/rollback-confirm/rollback-confirm.md:87`**
  — update the anchor ref pointing at the parked entry to point
  at the new hub doc / Tab 5.
- **`docs/architecture.md → Classifier contract — metadata
fields`** — replace the "logged anomaly" phrase with
  `logger.warn('classifier.delta_clamped', ...)` for concreteness;
  reference `observability.md` as the canonical owner of the
  logger contract.
- **`docs/architecture.md → What this doc does not yet cover`** —
  this section currently has no observability item; add a
  cross-reference to `observability.md` so future readers find the
  canonical home.

### Followups introduced

In `docs/followups.md`:

- **Actions menu broader design pass** (under UX). The user noted
  "we kinda neglected the Actions menu overall." This pass adds
  one entry; a fuller design (full inventory, organizational
  shape, contextual variants per screen) lands as a separate
  pass.
- **ESLint guardrail for `console.*` outside logger**
  (implementation followup). Mitigates "forgot to use logger"
  leaks.
- **Header denylist completeness gate** (implementation
  followup). Build-time test walks configured providers' header
  schemas, asserts each maps to known-safe or denylisted.
  Dev-build runtime warning when an unknown header matches a
  heuristic regex (`/auth|key|token|secret|credential|cookie/i`).
- **HTTP cap calibration based on real workloads** (implementation
  followup). The 200 cap is a starting point; real translation +
  embedding workloads may need higher.

### Followups parked-until-signal

In `docs/parked.md → Parked until signal → UX`:

- **File-based persistent logger.** Rotating log file in app data
  dir on Electron; sandbox storage on RN. Same logger interface,
  additional sink. Lands when "I really wish I knew what
  happened before that crash" becomes a load-bearing concern.
- **Manual export to JSON file.** Save current ring-buffer
  contents (or a filtered subset) for triage / bug reports / "let
  me look at this later." Owns its own redaction policy.
- **Pin-to-keep.** Per-row affordance flagging a ring-buffer entry
  to survive eviction. Lightweight selective persistence without
  whole-stream archive.
- **Cross-window aggregator on Electron.** Combine diagnostics
  state from multiple renderer windows into one hub view.
- **`progressCall` for streaming live byte count.** Incremental
  sink updates during streamed responses, enabling live-counter
  UI in the call log row.
- **Performance metrics dashboard tab.** Aggregate across turns
  (mean latency per phase, p95 prompt tokens, etc.). Currently
  available per-turn via Per-turn inspector; aggregate view is
  the natural next ask.

### Doc-integration cascades

The "Observability / debug UI" parked entry's removal cascades to:

- **Inbound anchor refs** at `app-settings.md:765`,
  `rollback-confirm.md:87` — both repoint to the new hub doc.
- **Used-by line** at `lists.md:69` — renames as noted above.

No renames in canonical headings outside the Observability parked
entry's removal. The `probe_mode_enabled` rename is a field-shape
change, not a heading rename; the inbound refs are prose mentions
in `memory/probe.md` and `data-model.md` (covered in updates
above).

### Intentional repeated prose

The `app-settings.md → APP · Diagnostics` body description
intentionally restates the master toggle copy that lives
canonically in `observability.md → Gating model`. This is a
deliberate local restatement for context, not boilerplate; the
authoritative gating definition is in `observability.md` and
`app-settings.md` links to it.
