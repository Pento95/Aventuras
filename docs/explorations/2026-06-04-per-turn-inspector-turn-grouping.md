# Diagnostics Hub · Tab 2 — turn grouping (de-fragmentation)

Session record, 2026-06-04. Resolves the triage item
`turnCaptureSink captures per run, not per user turn` (removed from
[`implementation/triage.md`](../implementation/triage.md) as part of
this landing). Revises decisions from the
[2026-05-28 Tab 2 close-out](./2026-05-28-diagnostics-tab2-per-turn-inspector-close-out.md):
the list pane re-keys from run to turn, the detail pane drops
Classifier raw output and gains a Deltas section. Canonical spec
changes land in [`observability.md`](../observability.md) (capture
contract) and
[`ui/screens/diagnostics/diagnostics.md`](../ui/screens/diagnostics/diagnostics.md)
(the surface); this file is the frozen reasoning trail.

## Problem

`turnCaptureSink` writes one `TurnCapture` per `actionId` — i.e. per
**pipeline run**. A user turn spans several runs: the per-turn run,
an optionally-chained chapter-close successor, and the
turn-counted periodic classifier triggered around it — each with its
own `actionId` (see
[`generation-pipeline.md → chainsTo`](../generation-pipeline.md#chainsto-on-predecessor)
and the concurrency model). So the named "turn" capture is in fact
run-scoped, and one user-perceived turn fragments into 2–3 rows.

The 2026-05-28 close-out designed the whole Tab 2 surface around that
run-keying: the list pane is one row per capture keyed on `actionId`,
and the completed-row summary assumes every run has a `targetEntryId`
(`→ entry #N`) — which only holds for per-turn runs. A completed
classifier or chapter-close run has no target entry; the wireframe
never even drew that case. The defect is structural, not cosmetic.

The triage note pointed at the M7 memory probe as the surface where
this shows. That is wrong: `turnCaptureSink` feeds the **Diagnostics
Hub per-turn inspector (M7.3)** per
[`observability.md → Substrate`](../observability.md#substrate); the
memory probe's `probe_captures` are already entry-keyed
(`target_entry_id`, FK into `entries`) and do not fragment. A stale
line in [`roadmap.md`](../implementation/roadmap.md) ("M7.5 — Memory
probe consumes `turnCaptureSink` retrieval-score content") reinforced
the confusion and is corrected here.

## What this closes vs. defers

**Closes.** The capture-grouping contract (how runs fold into a
turn), the list-pane and detail-pane redesign for the per-turn
inspector, the user-edit visibility gap (via a new Deltas section),
and the removal of the redundant Classifier-raw section.

**Defers.** Nothing new parked. The inspector stays read-only
(force-cancel-turn remains parked-until-signal from the prior pass).

## The unit is the run; the turn is a grouping

The irreducible unit of _detail_ is the run: a phase gantt, an HTTP
call set, and a delta set are all properties of one `actionId`. You
cannot shred a run's timeline across entries. So the capture stays
**run-scoped** (one `TurnCapture` per `actionId`) and we add grouping
metadata; the UI groups captures into turns rather than merging them
into one object.

### Capture contract

Added to `TurnCapture`:

- **`kind`** — the pipeline kind (`per-turn` / `chapter-close` /
  `periodic-classifier` / `suggestion-refresh` / `translation-retry`),
  sourced from `RunState.kind`. Previously absent; needed so the list
  labels each run by role and a completed background run is not
  mis-summarized as `→ entry #undefined`.
- **`anchorEntryId`** — the turn the run is attributed to (the turn's
  `ai_reply` / `opening` entry). The grouping key. Optional: an
  aborted per-turn run that never produced a reply entry has no anchor
  and renders as a singleton turn keyed on its own `actionId`. Group
  on `(branchId, anchorEntryId)` — entry IDs are globally-unique
  kind-prefixed UUIDs so the entry ID alone is safe, but the list is
  already branch/story-scoped.

`targetEntryId` keeps its meaning — _the entry this run produced_
(per-turn: its reply entry; background runs: undefined). For a
per-turn run, `anchorEntryId === targetEntryId`.

Removed: **`classifierOutputRaw`** and the `recordClassifierOutput`
sink method (see the detail-pane section).

### Attribution rule — two cases, set by the orchestrator

- **Per-turn run** → `anchorEntryId =` its own reply entry, set when
  the AI entry lands.
- **Every other run** (periodic-classifier, chapter-close whether
  chained or manual, suggestion-refresh, translation-retry) →
  `anchorEntryId =` the branch's **head reply/opening entry at run
  start**, read once and **frozen** on the capture.

The elegance: a _chained_ chapter-close fires at the per-turn's
commit, so at its `beginRun` the head _is_ that per-turn's reply entry
— it inherits the right turn with zero chain-threading. A _manual_
close or a classifier pass reads whatever is head at trigger — "ran
in the current turn." One rule, no per-kind table.

Because the orchestrator stamps both `kind` and `anchorEntryId`
generically (at `beginRun` / entry-land), every pipeline kind —
including future ones — gets grouping for free; the contract lands
once, not per-slice in M3 / M5 / M8.

This also closes a latent gap: `targetEntryId` is declared on
`TurnCapture` today but **no current sink method ever sets it**. The
fix adds `recordTargetEntry(actionId, entryId)`, which for a per-turn
run lands both `targetEntryId` and `anchorEntryId`; `beginTurn` gains
`kind` and an optional `anchorEntryId` for the head-at-start cases.

### Why not per-fact entry slicing

The triage note floated re-keying captures on the originating entry
via `deltas.entry_id` provenance. Rejected: that axis is many-to-many
(one classifier run commits facts about many entries) and is coherent
only at the _delta_ level — where it already exists as the
[survival anchor](../data-model.md#survival-anchor). At the _capture_
level a run's gantt / calls / raw blob cannot be sliced per entry, so
one classifier run would appear under several entry rows with
duplicated run-level data. Trigger-attribution (attribute the _whole_
run to the turn it ran in, show its `(processedThrough, head]` window
as detail) is the coherent resolution and matches the
[classifier's own provenance head-fallback](../memory/classifier.md#provenance-attribution).

## List pane — turn-grouped tree

One row per turn, children are the runs:

- **Turn parent** = identity only (`entry #N · HH:MM:SS` + run-count).
  **No outcome dot or in-flight state of its own** — those belong to
  runs. Keyed on `(branchId, anchorEntryId)`. Default **collapsed**;
  the collapsed header carries the children's own severity dots so an
  out-of-place failure is spotted on a scan, expand to see which run.
- **Run child** = `[outcome-dot] <kind> <duration> <summary>`. The
  outcome dot and in-flight pulse live **here, per run**. A turn whose
  reply completed but whose classifier failed shows a green per-turn
  child and a red classifier child — no turn-level aggregation lie.
- Turns reverse-chrono by per-turn `startedAt`; children by
  `startedAt` within the turn. Outcome chips filter child runs (a turn
  with zero visible children hides). Count badge: turn count,
  story-scoped, colored by max child severity.

Header tap → expand and select the turn (turn-scope detail); child
tap → select that run (run-scope detail).

**Background-only turns are structural, not an edge.** A classifier
pass anchored to the opening, or any turn whose per-turn capture has
evicted, renders a turn parent with no per-turn child. The design
treats "turn with no per-turn run" as normal.

## Detail pane — uniform sections, scope follows selection

Same composition whether a turn parent or a run child is selected;
only the scope differs:

1. **Timeline** (gantt) — run scope: that run's phase bars; turn
   scope: every run's bars on one shared axis.
2. **Calls** — LLM/HTTP calls. Run scope: that run's `actionId`; turn
   scope: union across the turn's runs.
3. **Logs** — log entries, scoped the same way.
4. **Deltas** (new) — run scope: that run's emitted deltas (by
   `action_id`); turn scope: all the turn's runs' deltas **plus
   user-edit deltas** (which belong to no run, attributed positionally
   into the turn's `log_position` span). Reuses
   [`DeltaLogRow`](../ui/patterns/delta-log-row.md) verbatim; each row
   shows its `source` and `entry #N` provenance.

**Classifier raw output removed.** A periodic classifier's structured
output _is_ its LLM call's response body; a per-turn run's piggyback
output is part of the narrative call's body. Both already live in
**Calls** — the more general "all LLM calls" view. The dedicated
section was a redundant special-case. Dropping it removes
`classifierOutputRaw` / `recordClassifierOutput` from the contract
with **no durability loss**: `httpCallSink` already protects completed
calls whose `actionId` is buffer-resident from eviction, so a
classifier call's response survives in Calls exactly as long as its
turn capture did.

**Deltas durability.** The Deltas section sources the **persisted**
delta log, so unlike Calls/Logs the _data_ never ages out of a ring
buffer. The _grouping link_ is still buffer-bound: if a grouped run's
capture evicts we lose its `actionId` and cannot surface its deltas —
the same muted buffer-truth caveat Calls/Logs already use. Net: the
most durable of the three cross-cuts, partial only under capture
eviction.

## Cross-tab nav

- **Inbound** (`actionId=X` from Tab 3/4/5) → resolve `X` to its
  capture → `anchorEntryId` → expand that turn and select the run
  child whose `actionId === X`. Strictly more precise than the prior
  "select the turn."
- **Outbound** (a detail row's `↗`) → Calls row → Tab 3, Logs row →
  Tab 4, **Deltas row → Tab 5**, each with `actionId=X,
focusEntryId=Y`.
- **User-edit delta from Tab 5** has no run to land on; it links to
  the **turn** it is positionally attributed to (latest anchor entry
  ≤ the edit's `log_position`), at turn-scope, where the edit appears
  in the Deltas section.
- **Aged-out arrival** (deep-link `actionId` whose capture is gone) —
  the prior aged-out empty state stands; the anchor lives on the
  capture, so without it the turn is unresolvable; escape buttons to
  Tab 3/4 (and now Tab 5).

Selection follows eviction: a turn group reflects only buffer-resident
captures; as captures evict the group shrinks, and when its last
capture evicts the row disappears. Master-off wipes the buffer.

## Wizard carve-out

The wizard is not pipeline-adjacent (no `actionId`, no deltas, no
phases — see
[`generation-pipeline.md → Wizard exemption`](../generation-pipeline.md#wizard-exemption)).
Its LLM calls never become turn captures; they surface only in **Tab 3
(Call log)** as app-global HTTP calls carrying a `source` but no
`actionId` (hence no Tab-2 presence, no story dimension, no deltas).
Turn-anchoring begins at the **opening entry**: a post-creation
pipeline run can anchor to it and onward, but the opening's own
generation is invisible to the inspector. This is the documented
answer to "where did the opening-generation call go?" — Tab 3,
unanchored.

## Adversarial pass

- **Load-bearing assumption — `anchorEntryId = head-at-start`,
  frozen.** Tested both directions: a classifier triggered at turn N's
  commit and running concurrently into N+1's wall-clock keeps its
  frozen anchor (= N); a scheduler-delayed classifier that begins
  after N+1's reply landed anchors to N+1 — correct, because its
  window then genuinely covers through N+1. Holds only because head is
  read once at run start and never recomputed. Stated as an invariant.
- **Regenerate / rollback** yields two turn rows for one slot — the
  reverted original (whose anchor entry is gone) and the regenerate
  (new anchor). Honest: the diagnostic history should show the
  reverted attempt. The reverted row shows `entry #N` as-recorded
  though it is gone from the reader — expected, not a dangling ref.
- **Positional user-edit attribution is by _when_, not _what_.**
  Editing old entry #3 (or an entity in the World panel) while turn
  #47 is latest files that delta under #47's Deltas, target `#3`,
  source `user`. Correct for a "what happened around this turn" view;
  the row's target column disambiguates.
- **Verified vs. assumed.** Verified: turn-counted cadence
  ([`cadence.md`](../memory/cadence.md#user-tunable-knobs)); the
  `processedThrough` window; provenance maps facts → entries;
  `httpCalls` protects buffer-resident calls; `targetEntryId` is
  currently never set; delta schema carries `action_id` + `source` +
  `entry_id`, user edits get a fresh `action_id` with `entry_id =
NULL`. Assumed (not traced): the orchestrator can read "branch head
  reply/opening entry" synchronously at `beginRun` — `RunState` has
  `storyId`; flagged as an implementation assumption to confirm when
  M3/M5 wire the stamping.

## Integration plan

**Canonical doc edits:**

- [`observability.md`](../observability.md):
  - `### turnCaptureSink` — rewrite the `TurnCapture` type (+`kind`, +`anchorEntryId`; −`classifierOutputRaw`) and the sink API
    (`beginTurn` gains `kind` + optional `anchorEntryId`; add
    `recordTargetEntry`; remove `recordClassifierOutput`). Add the
    two-case attribution rule and the head-frozen invariant. Update
    the Eviction note for `(branchId, anchorEntryId)` grouping.
  - `## Substrate` — the in-memory story-anchored slice description:
    note grouping by `anchorEntryId` while captures stay run-keyed;
    drop "Classifier raw output" from the listed contents.
  - `### actionId threading` — replace the closing "Folding captures
    back into a user turn is a separate, unsolved concern — see
    triage.md" with the resolution (grouping by `anchorEntryId`).
- [`ui/screens/diagnostics/diagnostics.md`](../ui/screens/diagnostics/diagnostics.md):
  - `### Tab 2 — Per-turn inspector` and subsections — rewrite for the
    turn-grouped tree (parent/child, per-run dots, collapsed-by-
    default with dot preview), the uniform detail composition
    (Timeline / Calls / Logs / Deltas, scope follows selection),
    removal of the Classifier-raw subsection, the new Deltas
    subsection, the two-level selection mechanic, updated context
    header (turn/run identity), cross-tab nav (`actionId` → turn + run
    child; outbound incl. Tab 5; user-edit-delta inbound → turn-scope),
    in-flight UX (per-run dots), count badge (per-turn), empty states,
    phone tier (extra tree level), implementation notes. Add the
    wizard carve-out note.
  - Tab-strip table row for Tab 2 — update the data-source note if
    needed (still `turnCaptures`, now grouped).
  - `#### Cross-tab nav (Delta log)` (Tab 5) — add the Tab 2 ↔ Tab 5
    delta linkage (Deltas rows out to Tab 5; user-edit delta in to Tab
    2 turn-scope).
- [`ui/screens/diagnostics/diagnostics.html`](../ui/screens/diagnostics/diagnostics.html)
  — wireframe: per-turn inspector becomes the turn tree (collapsed
  headers with dot preview, expand to child runs), detail sections
  drop Classifier raw, add Deltas; per-run dots; mode buttons updated.
- [`ui/patterns/delta-log-row.md`](../ui/patterns/delta-log-row.md) —
  Used-by addition: the per-turn inspector Deltas section.
- [`implementation/roadmap.md`](../implementation/roadmap.md) — correct
  the stale "M7.5 — Memory probe consumes `turnCaptureSink`
  retrieval-score content" line (the memory probe consumes
  `probe_captures`; `turnCaptureSink` feeds the M7.3 per-turn
  inspector).
- [`implementation/triage.md`](../implementation/triage.md) — remove
  the `turnCaptureSink captures per run, not per user turn` inbox item
  (routed to its real home: this contract + surface change).

**Renames:** none. New/rewritten subsections live under the existing
`### Tab 2 — Per-turn inspector` heading; the heading slug is stable,
so inbound cross-refs from Tabs 3/4/5 remain valid. The removed
`#### Classifier raw output (Per-turn inspector)` slug is referenced
only from within the Tab 2 detail-composition prose (updated in the
same edit).

**Pattern adoption:** `DeltaLogRow` gains the per-turn inspector as a
new consumer (Used-by update above). No other pattern newly adopted.

**Followups in/out:** removes the triage inbox item; no new
deferrals.

**Intentional repeated prose:** the Deltas section cites
`DeltaLogRow` and the delta-log cross-cut substrate rather than
restating; the wizard carve-out cites the generation-pipeline wizard
exemption rather than restating.
