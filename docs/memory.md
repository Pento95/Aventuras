# Aventuras — memory

How memory works in the app: keeping prose and structured world state
consistent turn by turn, surfacing older content when relevant, and
assembling the per-turn generation context.

[`docs/data-model.md`](./data-model.md) says what's stored;
[`docs/architecture.md`](./architecture.md) says how the pipeline
runs end-to-end. This doc says how those tables stay consistent with
the prose, what gets injected into each generation call, and how
older content ranks against the current scene.

Living doc. Many decisions in here landed across one long design
session; rationale alongside the choice where useful.

---

## What this doc owns

"Memory" in this app is overloaded across distinct concepts:

- **Per-turn scene metadata** — who is in the scene, where, when.
- **In-context retrieval** — what beyond the structural floor gets
  injected each call.
- **Long-term character knowledge** — `happening_awareness` rows and
  how they persist or decay.
- **Slow-evolving identity** — `traits` / `drives` / `agenda` arrays
  on entity state.
- **Procedural memory** — the delta log itself (rollback path).

This doc owns the **pipeline** between them: cadence (when does each
agent run), retrieval (how is per-turn context assembled), and the
contract each layer holds with the others. Storage tables stay
canonical in [`data-model.md`](./data-model.md). UI affordances for
user-facing knobs sit with the relevant Story Settings / App Settings
screens.

---

## Cadence — three layers

Three agents touch memory state at different time scales.

| Layer                      | Trigger                                                                  | Scope                                                                          |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Piggyback**              | Every AI reply, inline on the narrative call                             | Scene-local fast-mutating state                                                |
| **Periodic classifier**    | Background, every N turns or token-budget-tied to recent-buffer eviction | Multi-turn batch extractions                                                   |
| **Chapter-close pipeline** | Token threshold crossed OR user-triggered                                | 5 phases: catch-up classifier, boundary, metadata, lore-mgmt, lifecycle review |

Two architectural drivers shape the stratification:

- **Contradiction prevention.** Piggyback writes the crucial subset on
  the same call that produces the prose, so the prose and the state
  it produces are mutually consistent by construction. The periodic
  classifier keeps the deeper graph (happenings, awareness, status)
  in lockstep with prose for non-crucial surfaces.
- **Cost.** Piggyback adds a few hundred output tokens to a call
  that's already paying its full input cost. A separate per-turn
  classifier would pay duplicate input cost on the same context window
  (potentially ~60k tokens), which dominates per-turn cost even on
  cheap models. The periodic classifier amortizes that cost over many
  turns.

### Why classifier stays essential

Even with [`fullChapterInBuffer`](#user-tunable-knobs) mode active,
the classifier is essential, not optional. The prose being in-buffer
helps the LLM during generation; **retrieval queries the structured
awareness graph, not the prose**. Cross-chapter retrieval needs
structured rows. A chapter-30 turn whose retrieval needs "what does
Aria know from chapter 5" can't glance at chapter 5's prose; the
awareness rows are the indexable surface. The classifier populates
them.

---

## Piggyback contract

The narrative model emits a structured trailing block alongside its
prose, in the same generation call. This block carries the per-turn
fast-mutating subset of state mutations.

### What piggyback writes

| Surface                                                      | Source       | Notes                                                                                                                                     |
| ------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `story_entries.metadata.sceneEntities`                       | LLM-emitted  | Entity IDs present in this entry's scene (characters, items). Bracketed-ID prompt format gives the LLM stable handles.                    |
| `story_entries.metadata.currentLocationId`                   | LLM-emitted  | The singleton location entity that IS the current scene.                                                                                  |
| `story_entries.metadata.worldTime`                           | LLM-emitted  | Seconds delta added to previous entry's `worldTime`.                                                                                      |
| `entities.state.visual.*`                                    | LLM-emitted  | Observed visual changes (attire, hair-state, distinguishing marks).                                                                       |
| `entities.state.equipped_items` / `inventory` / `stackables` | LLM-emitted  | Item transfers between holders.                                                                                                           |
| `entities.state.current_location_id` (per-character)         | **Computed** | If character ∈ `sceneEntities`, set to scene's `currentLocationId`. Otherwise preserve `lastSeenAt.locationId`. No LLM extraction needed. |
| `entities.state.lastSeenAt`                                  | **Computed** | When a character was in `sceneEntities` last turn but isn't this turn, update `lastSeenAt` from the previous entry's metadata.            |

State that doesn't need an LLM to compute, shouldn't. Per-character
`current_location_id` and `lastSeenAt` derive cleanly from
scene-presence deltas.

### Trailing block format

A tagged block at the END of the narrative output, not interleaved.
Tagging beats raw JSON for parse robustness across models that don't
have a strict structured-output mode. Reference shape:

```xml
<state>
  <scene_entities>ent_aria, ent_kael</scene_entities>
  <current_location>loc_marshes</current_location>
  <world_time_delta>120</world_time_delta>
  <visual_changes>
    <entity id="ent_kael">attire: cloak now muddied to the waist</entity>
  </visual_changes>
  <transfers>
    <entity id="ent_aria">+ amulet (from ent_jorin)</entity>
  </transfers>
  <summary>Aria pushed into the marshes; met an exiled noble who recognized House Eldrin's sigil.</summary>
</state>
```

The exact format firms up at implementation; the principle is
"tagged-block alongside prose, parsed best-effort, code-template
fallback per field on parse failure."

### jsonrepair fallback

The trailing block is parsed with jsonrepair (or its tagged-format
equivalent) before being given up on. If parse succeeds (clean or
repaired), the parsed fields are used. If parse fails entirely, the
LLM-emitted fields are skipped for this turn — the periodic classifier
eventually picks up the prose mention, and the structural-template
digest covers retrieval queries in the meantime.

### Auto-promote on staged-ID emission

When piggyback's `sceneEntities` contains an entity ID currently at
`status='staged'`, that's a strong signal of intentional introduction.
Piggyback processing auto-promotes the entity to `status='active'`
inline, in the same `action_id` as the turn's other writes. Single
delta, fully reversible if the user rolls back the turn.

This is the **fast path** to staged promotion. The
[slow path](#staged-entity-promotion) via the periodic classifier
covers cases where prose introduces a character without an explicit
ID emission.

### Capability gate

Piggyback is gated on the narrative model's structured-output
capability (or its empirically-verified ability to emit reliable
tagged blocks at narrative-generation temperatures). The
`app_settings.providers[].cachedModels[].capabilities` schema already
carries this metadata. Story Settings exposes a
`piggybackMode: 'on' | 'off'` toggle — enabled only when the model
declares the capability; falls back to a per-turn classifier pass when
off.

### Mode-mixing across a story

Switching `piggybackMode` mid-story is fine. The data shape is
identical; only the agent that writes which fields differs. Going
piggyback → split rights itself in one turn (next turn's classifier
pass writes the subset piggyback would have). Inverse path is similarly
clean. No retroactive re-extraction.

---

## Periodic classifier contract

A background agent that runs on a configurable cadence (see
[`classifierCadence`](#user-tunable-knobs)) and reads the recent prose
window not yet covered by piggyback's per-turn writes. Its job is
populating the structured graph that retrieval queries against.

### What the classifier writes

- **Happenings** — `happenings`, `happening_involvements`,
  `happening_awareness`. New rows for events extracted from the prose
  window, with `decay_resistance` set per awareness row from the
  model's per-character severity judgment at extraction time.
- **Status transitions** — `entities.status` flips:
  - `staged → active` when prose mentions a staged entity in scene
    (the slow path; see
    [Staged-entity promotion](#staged-entity-promotion)).
  - `active → retired` on hard finality signals only (death, exile,
    faction-disbanded). Conservative bias.
- **First-introduction descriptions** — when the classifier extracts
  a genuinely new character (no name match against existing
  entities), it authors the initial `description` from prose. After
  first introduction, the classifier never amends `description` (the
  authorship contract in
  [`data-model.md → World-state storage`](./data-model.md#world-state-storage)
  remains intact).

### Disambiguation on new-character mentions

For every "new character" candidate the classifier extracts, code-side
reconciliation runs before the create / promote decision. Flow:

1. **Name lookup** against the entity index (active, staged, retired).
   O(1) hash check. The classifier itself doesn't need to know about
   every character; the index does.
2. **No name match** → genuinely novel character. Create fresh entity.
3. **Name match found** → embedding similarity between the
   classifier-extracted description and the existing entity's
   description. Existing entity's embedding is cached (see
   [Embedding infrastructure](#embedding-infrastructure)); the
   extracted description embeds once.
   - **High similarity** (`sim ≥ τ_high`) → promote staged → active OR
     treat as already-known active mention. Update entity if the
     extracted description adds information.
   - **Low similarity** (`sim < τ_low`) → create new entity with
     `name_collision_flag = true` for World-panel review.
   - **Ambiguous** (`τ_low ≤ sim < τ_high`) → conservative create-new
     with the flag, defer to user.

Thresholds (`τ_high`, `τ_low`) are tunable. Defaults TBD empirically
once real story data exists; sensible starting ranges (e.g. 0.75 /
0.50 cosine) until tuning lands.

### Background-task framing

The periodic classifier runs as a background agent, not a synchronous
pipeline phase:

| Field            | Value                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `gateBehavior`   | `'no-gate'`                                                                                                          |
| `conflictPolicy` | `'concurrent-allowed'`                                                                                               |
| `affordance`     | `'pill-only'` (or `'invisible'` — UI surface design TBD)                                                             |
| `writeSet`       | happenings, happening_involvements, happening_awareness, entity status flips, first-introduction entity descriptions |

The single-writer invariant in
[`architecture.md → Generation transactions and edit gating`](./architecture.md#generation-transactions-and-edit-gating)
relaxes to **single-writer-per-write-set** in v1. Piggyback's
write-set and the classifier's write-set are disjoint at the
row-and-field granularity (see [Concurrency](#concurrency)).

If the user starts a new turn while the classifier is mid-run, both
proceed. The classifier holds its own `action_id` for its writes; the
user-turn pipeline holds its own. Reverse-replay on rollback peels
them off independently.

`'abort-self'` was rejected as wasteful — it discards in-flight
classifier work that doesn't conflict with the new turn's writes
anyway.

---

## Chapter-close pipeline

When the open region crosses the per-story
[`chapterTokenThreshold`](#user-tunable-knobs) (default 24k) AND
`chapterAutoClose=true`, OR when the user manually triggers chapter
close at any time, the chapter-close pipeline fires.
[`data-model.md → Chapters / memory system`](./data-model.md#chapters--memory-system)
remains canonical for the trigger and atomic-commit shape; this
section details the phases.

Five phases under one `action_id` for atomic rollback. A single
CTRL-Z from the user reverses the entire chapter-close.

| Phase                           | Mode      | Drives                                                                                                      |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| **0. Catch-up classifier pass** | Both      | Bring periodic classifier current to chapter boundary                                                       |
| **1. Boundary selection**       | Auto only | LLM picks a natural ending entry within the open region                                                     |
| **2. Chapter metadata**         | Both      | LLM emits title / summary / theme / keywords for the `chapters` row                                         |
| **3. Lore management**          | Both      | Lore creation, identity compaction, stackable normalization, awareness pin tuning, happenings consolidation |
| **4. Lifecycle review**         | Both      | Demote `active → retired` on chapter-scope evidence                                                         |

### What chapter-close no longer owns

Per the cadence stratification, two responsibilities moved out:

- **Staged-entity promotion** — moved to the periodic classifier.
  Mid-chapter introduction is normal narrative pacing; chapter
  boundaries are the wrong cadence.
- **Per-turn state mutations** — entirely piggyback's territory.
  Chapter-close never touches `visual.*`, `current_location_id`,
  inventory, `worldTime`, etc.

Awareness compaction also reshapes: was eager
"summarization-and-delete" of low-salience awareness rows; is now
**enforced at write time** via a `UNIQUE(branch_id, character_id, happening_id)`
constraint on `happening_awareness` plus upsert semantics in the
classifier and user-edit paths. Embedding-driven retrieval lets the
bench grow without performance pressure, and duplicates can't
accumulate in the first place. The
[Top-K-by-salience parked entry](./parked.md#top-k-by-salience-retrieval--long-term-memory-implications)
flagged the cost of eager summarization losing detail; upsert is the
cleaner shape than chapter-close sweeps.

### Phase 0 — catch-up classifier pass

Before lore-mgmt and dedup phases run, the periodic classifier must
be current with the chapter boundary. Otherwise lore-mgmt operates
on a partial happening graph (recent turns un-classified) and dedup
can't find rows the classifier hasn't written yet.

Phase 0 runs the classifier synchronously over any unclassified
entries in the open region. Bounded by the cadence overlap window —
typically a few turns of un-classified content, fast.

**Concurrency.** The background classifier's
`'concurrent-allowed'` policy is **lifted to "blocked while
chapter-close is in flight"** for the duration of phases 0-5.
Chapter-close holds the gate per
[`architecture.md → Generation transactions and edit gating`](./architecture.md#generation-transactions-and-edit-gating);
the background classifier does not start a new pass while the gate
is held. One-direction lock — chapter-close blocks the background
classifier; piggyback's per-turn writes can't be in flight because
chapter-close runs between turns by construction.

### Phase 1 — boundary selection

**Auto mode only.** Manual user-triggered chapter close skips this
phase; the user-supplied entry is the boundary.

The boundary selection agent reads the open region's entries and
picks a natural ending — scene transition, time skip, arc-beat
resolution, or narrative pause.

**Prompt context:**

- The open region's entry titles, opening sentences, closing
  sentences (compact representation; full prose would blow context
  on long open regions).
- The chapter's accumulated token count and the threshold value.
- Active threads in the chapter's range.

**Output (structured trailing block, same pattern as piggyback):**

```
{
  end_entry_id: string,
  rationale: string  // one sentence explaining the choice
}
```

**Validation.** `end_entry_id` must satisfy
`previous_chapter.end_entry_id < end_entry_id <= current_head`.
Invalid output triggers one retry with a stricter prompt; persistent
failure falls back to "current head as end."

The chapter `start_entry_id` is automatically the entry after the
previous chapter's `end_entry_id` (or position 1 if first chapter).

### Phase 2 — chapter metadata

The metadata agent reads the closed range and emits structured
metadata for the `chapters` row.

**Prompt context:**

- All entries in the closed range (the chapter's content).
- The previous chapter's summary, if any, for narrative continuity.
- Active thread titles + statuses.

**Output (structured):**

```
{
  title: string,        // user-editable; LLM-suggested
  summary: string,      // 2-4 sentences distilling chapter content
  theme: string,        // short thematic tag — "betrayal" / "first contact" / etc.
  keywords: string[]    // 3-8 keywords for browse/navigation
}
```

The `keywords` here are **chapter-level browse keywords**, distinct
from `lore.keywords` retrieval keywords. Not load-bearing for v1
retrieval — embedding similarity over candidates is the retrieval
signal. They surface in the chapter list and browse rail.

**Failure mode:** parse failure or empty output produces placeholder
content (`title = "Chapter N"`, `summary = "[summary unavailable]"`,
empty `theme` and `keywords`) so the chapter row still creates. User
can edit afterward.

### Phase 3 — lore management

The substantive phase. Five sub-jobs share a single LLM call (or a
small number of structured calls — implementation detail).

**Prompt context shared across sub-jobs:**

- Closed range entries (the chapter's content).
- Existing lore rows — titles + bodies if budget allows, otherwise
  titles + first paragraphs.
- Cast roster — entities with `status='active'` that appeared in the
  range, with their current `traits` / `drives` / `agenda` /
  `stackables`.

#### 3a — lore creation

**Conservative bias** — old apps erred proactive and produced lore
spam. The criterion for emitting a new lore row:

> The chapter explicitly **establishes** a definitional world-rule,
> magic system, religion, faction-charter, cosmology, or IP-specific
> terminology. "Establishes" means the prose explains how something
> _works_ or _is_, not just _mentions_ it.

| Prose                                                                                                                                                     | Lore? | Why                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------- |
| "Aria visited the temple of Vael."                                                                                                                        | No    | Visit is an event (happening), not a world-rule.  |
| "The temple of Vael is a relic of the Eldritch covenants, where blood-bound priests once communed with the Forgotten Hour through ritual exsanguination." | Yes   | Definitional explanation of a religious practice. |
| "The Aetherium was acting up again."                                                                                                                      | No    | Mention without explanation.                      |
| "The Aetherium runs on the kinetic resonance of crystalline lattices; without daily harmonic tuning by the keepers, the entire grid faults within hours." | Yes   | Definitional mechanism explanation.               |

**Output per lore creation:**

```
{
  title: string,
  body: string,        // classifier-authored; user can edit
  category: string,    // freeform: "magic-system" / "religion" / etc.
  keywords: string[],  // initial keyword set for retrieval (user can edit)
  priority: number,    // default 50; agent can suggest higher for clearly load-bearing
  injection_mode: 'auto'   // default; user can change
}
```

**Discipline at the prompt level:**

- **Hard cap of 3 lore creates per chapter** by default (tunable in
  app settings). Prevents runaway generation when a chapter happens
  to introduce many world details.
- **Cited evidence required.** Each lore create must include a
  one-sentence justification citing the prose passage that
  established the rule. If the agent can't cite, it shouldn't
  create. Citation parsed at output validation time; uncited rows
  rejected.

#### 3b — identity compaction

For each entity active in the chapter, the agent reviews their
identity arrays — `traits`, `drives`, `agenda` (faction-only) —
against soft caps from
[`data-model.md → Soft caps`](./data-model.md#soft-caps--compaction-discipline)
(`traits ≤ 8`, `drives ≤ 6`, `agenda ≤ 4`).

**Operations the agent may emit:**

| Op          | Trigger                                                                                              | Discipline                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Add**     | Chapter prose evidences a new trait/drive/agenda                                                     | Subject to soft cap; if at cap, must replace not append        |
| **Replace** | Adding past soft cap, OR new entry supersedes old (e.g. drive resolved)                              | Drop one to make room; cite which                              |
| **Dedup**   | Two entries are synonyms ("brave" + "courageous")                                                    | Merge to one; pick the more general or more evidenced spelling |
| **Prune**   | Chapter explicitly contradicts an existing entry (e.g. "former alcoholic" 10 chapters past sobriety) | Remove only when contradiction is unambiguous                  |

**Discipline:** don't churn stable identity. "Brave" doesn't get
removed because the chapter happened not to show bravery; it gets
removed only when the chapter explicitly contradicts it.

**Cited evidence:** like lore creation, each compaction op requires
prose citation. Unsupported emissions are rejected at output parse.

#### 3c — stackable normalization

Across all character `state.stackables` records, find variant
spellings of the same fungible: `gold` / `Gold` / `gold pieces` /
`gp` → canonical lowercase `gold`. Per
[`data-model.md → Soft caps`](./data-model.md#soft-caps--compaction-discipline).

Mostly **algorithmic** — lowercase, strip pluralization suffix,
deduplicate by canonical form. LLM-driven semantic merging
(`gold` vs. `gold coins` vs. `coin`) is parked; if real usage shows
the algorithmic floor isn't enough, escalate.

#### 3d — awareness pin tuning

The agent reviews awareness rows from two sources:

- **Closed-chapter rows** — awareness extracted during the just-
  closed range. Standard review.
- **High-frequency rows from across the story** — awareness rows
  from any chapter whose `retrieval_count` puts them in the top-N
  retrieved across the story so far. Surfaces rows that the
  classifier originally severity-judged conservatively but that
  retrieval has been picking up consistently.

The agent does **not** see individual `retrieval_count` values —
just membership in the high-frequency set ("these rows have been
coming up a lot lately"). Removes the temptation to anchor on numeric
ranking; keeps the judgment narrative ("are these still load-bearing
for the current arc?") rather than data-analytical.

**Operations:**

- **Bump up** (toward 1) — for closed-chapter rows that turned out
  structurally load-bearing for chapter themes, OR for high-
  frequency rows the agent confirms are still load-bearing.
- **Bump down** (toward 0) — for closed-chapter rows that the
  classifier severity-judged high but turned out incidental.

**One-way frequency signal.** The frequency-driven candidate set
only triggers consider-bump decisions, never demote-on-frequency.
Demoting "frequent but irrelevant" rows revives the feedback-loop
concern (rows that fall out of retrieval get demoted, fall out
more, eventually invisible). User-driven demotion is the explicit
path; frequency-driven auto-demotion is not a v1 feature.

**Selection mechanism for high-frequency set:** **per-chapter
counter, reset at chapter close after phase 3d commits**. Counts
accumulate during a chapter via ranker-side increments (each
injected row gets its `retrieval_count` bumped, delta-logged under
the turn's `action_id` for rollback correctness). At chapter close,
top-N is selected from the chapter's accumulated counts; agent
reviews. After phase 3 commits any bumps, all counts reset to 0
(the reset is itself a delta under the chapter-close `action_id`).
Next chapter starts fresh.

**Why per-chapter reset, not lifetime accumulation.** Lifetime
counts create a Matthew-effect feedback loop — early-popular rows
ossify in the top-N because their accumulated count can't be caught
by late-emerging rows, even when the late ones are more relevant
to the current arc. Per-chapter reset breaks this: each chapter's
top-N reflects that chapter's retrieval activity. A row that's
_genuinely_ load-bearing across many chapters keeps re-entering
top-N at each chapter close (accumulating bumps over time, drifting
toward dr=1.0); a transiently-hot row gets bumped once and then
falls out as the arc moves on.

The agent self-regulates within each chapter close — it sees the
row's current `decay_resistance`, so a row already at dr=0.9 with
high frequency doesn't get re-bumped unnecessarily.

Conservative bias on closed-chapter rows — don't touch most.
Only adjust when chapter context makes the original
`decay_resistance` clearly wrong.

#### 3e — happenings consolidation

Happenings can drift toward over-granularity at scale (3-6k
happenings over 60 chapters projected per
[Scale assumptions](#scale-assumptions)). Sub-job 3e identifies
clusters that should merge.

**Candidate identification (algorithmic, no LLM):**

Cluster happenings within the closed chapter range by:

- Embedding similarity ≥ 0.80 (cosine).
- `happening_involvements` overlap ≥ 50% (same cast).
- `occurred_at_entry` proximity within ~3 entries.

All three criteria must hold for cluster membership. Clusters of
≥ 2 rows are passed to the LLM for judgment.

**LLM judgment per cluster:**

| Decision                 | When                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Merge into composite** | Same cast + close time + complementary semantics (sequential phases, one builds on the other, parallel aspects of one event)      |
| **Keep distinct**        | Antonymous narrative meaning ("Aria swore the oath" + "Aria broke it"), different awareness implications, distinct material beats |
| **Delete redundant**     | Same event extracted twice with different framings; keep the more detailed, delete the duplicate                                  |

**Lean toward merge** on tight clusters. Cost asymmetry: under-
merging carries duplication that compounds at scale; over-merging
loses some temporal precision but composite descriptions preserve
the substantive facts. The aggressive-merge default is right at v1's
projected volumes.

**Mechanical merge:**

- `description` — composite, LLM-authored ("X happened, then Y").
- `title` — pick the more general, or LLM-authored composite.
- `occurred_at_entry` — earliest of the cluster (the later events'
  precise timing is lost; acceptable v1 trade).
- `decay_resistance` on the surviving row — max of the cluster.
- Awareness rows merge per-character via the existing
  `UNIQUE(branch_id, character_id, happening_id)` upsert: max
  `decay_resistance`, earliest `learned_at_entry`, source strings
  concatenated where they differ.
- Deleted rows are delta-logged for rollback.

**Conservative override:** when the LLM is uncertain about cluster
membership, default to keep-distinct. The agent can also flag
clusters as "review needed" rather than auto-merging — surfaces in
the World panel for user review (similar to the
`name_collision_flag` recovery path).

### Phase 4 — lifecycle review

The agent reviews `active` entities that haven't appeared recently
and considers retirement on chapter-scope evidence:

- **Auto-retire** when the chapter contains explicit hard-finality
  signal that the periodic classifier may have missed on single-line
  ambiguity (a death scene the classifier read as injury, the
  chapter-scope context confirms otherwise).
- **Surface for user review** when a character's `lastSeenAt` is
  far back AND prose doesn't explicitly justify keeping them
  active. Doesn't auto-mutate; surfaces in the World panel as
  "stale active" via derived `lastSeenAt + worldTime` arithmetic
  (no schema column needed in v1).

Conservative bias: prefer surfacing over auto-retire on weak signal.
The only auto-retire path is hard-finality signal that the periodic
classifier should have caught but didn't.

### Failure modes and atomic rollback

The chapter-close transaction holds the gate per
[`architecture.md → Generation transactions and edit gating`](./architecture.md#generation-transactions-and-edit-gating).
User edits are blocked; pipeline phase failures cascade as follows:

| Phase                       | Failure mode                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** (catch-up classifier) | Retry once, then proceed with what's classified. Worse retrieval input for downstream phases but not catastrophic.                                                      |
| **1** (boundary selection)  | Retry once with stricter prompt; final fallback uses head-as-end.                                                                                                       |
| **2** (metadata)            | Placeholder content; chapter row still creates.                                                                                                                         |
| **3** (lore-mgmt)           | Per-emission validation; rejected emissions skipped, accepted ones commit. Phase as a whole may produce zero successful emissions on bad output — chapter still closes. |
| **4** (lifecycle review)    | Skip; not critical.                                                                                                                                                     |

**User abort** at any phase: the orchestrator reverse-replays the
`action_id`'s deltas and exits. UI returns to pre-chapter-close
state. Same path as any in-flight pipeline abort.

**Crash recovery** during chapter-close is the same as any
in-flight transaction — see
[`followups.md → Crash recovery for in-flight transactions`](./followups.md#crash-recovery-for-in-flight-transactions).

### Manual user-triggered close

User can manually trigger chapter close at any time, regardless of
threshold. The user picks the boundary entry explicitly (Phase 1
skipped). Phases 0, 2-5 run normally.

UX surface: a "Close chapter here" affordance on entries in the open
region. Clicking pre-flights the chapter-close pipeline with the
selected entry as boundary.

When `chapterAutoClose = false` AND the threshold is crossed, the
UI shows a "Ready to close" indicator near chapter management
controls, but doesn't auto-fire. User confirms the close manually.

---

## User-tunable knobs

Three orthogonal user-tunable settings per story. Defaults copied
from `app_settings.default_story_settings` at story creation.

| Knob                                         | Effect                                                                                      | Foot-shooting check                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `recentBuffer` (entries)                     | Last N entries verbatim in LLM context, regardless of chapter boundaries                    | None directly; interacts with classifier cadence                                                                          |
| `fullChapterInBuffer` (boolean)              | Current chapter always verbatim in LLM context, **in addition to** the `recentBuffer` slice | UI shows token cost at threshold ("at the chapter threshold this consumes ~X tokens")                                     |
| `classifierCadence` (turns or token trigger) | When the periodic classifier runs in the background                                         | UI warns when cadence > buffer eviction horizon for un-classified turns; cadence relaxes when `fullChapterInBuffer` is on |

The two buffer settings compose orthogonally. With
`fullChapterInBuffer = true` and `recentBuffer = 10`, the LLM gets
the entire current chapter verbatim plus the last 10 entries before
it (spillover from the previous chapter). With
`fullChapterInBuffer = false` and `recentBuffer = 10`, just the last
10 entries.

**Buffer-aware cadence indicator.** When `fullChapterInBuffer = false`,
the cadence has to keep pace with recent-buffer eviction so unclassified
turns don't fall out of LLM coverage before the classifier catches up.
Story Settings UI shows the relationship: "with current buffer = 10
entries and cadence = 8 turns, you have 2 turns of coverage overlap."
Drop overlap below zero, get a warning chip.

**fullChapterInBuffer relaxation.** When on, the classifier's urgency
drops to "before chapter close." Foot-shooting indicator hides because
the prose is always in LLM context regardless of cadence.

### Where these live

`stories.settings`:

```ts
{
  recentBuffer: number,           // entries; default 10
  fullChapterInBuffer: boolean,   // default false
  classifierCadence: { mode: 'turns' | 'token-trigger', value: number }
  // existing memory knobs continue: chapterTokenThreshold, chapterAutoClose
}
```

`compactionDetail` (a freeform user prose directive on
`stories.settings`) is **dropped** in this design pass. The original
"memory-compaction agent" it directed no longer exists — chapter-
close lore-mgmt subsumes it, and a one-line soft hint adds marginal
value at the cost of UX surface. Power users can author packs that
bias prompts more rigorously.

`chapterTokenThreshold` and `chapterAutoClose` stay alongside.

---

## Concurrency

The piggyback agent and the periodic classifier write to disjoint
field sets, even when they share row identifiers.

| Field                                                                    | Piggyback | Classifier                                           |
| ------------------------------------------------------------------------ | --------- | ---------------------------------------------------- |
| `story_entries.metadata` (current entry)                                 | ✓         | —                                                    |
| `entities.state.visual.*`                                                | ✓         | —                                                    |
| `entities.state` (location, equipped, inventory, stackables, lastSeenAt) | ✓         | —                                                    |
| `entities.status`                                                        | —         | ✓ (staged → active, active → retired)                |
| `entities.description`                                                   | —         | ✓ (first introduction only; see authorship contract) |
| `happenings`                                                             | —         | ✓                                                    |
| `happening_involvements`                                                 | —         | ✓                                                    |
| `happening_awareness`                                                    | —         | ✓                                                    |

The only shared row is `entities`, and field-level disjointness holds.
With **per-field UPDATEs** (no row-level read-modify-write cycles),
SQLite serializes the two writes without clobbering. The discipline at
the action layer:

```ts
// Yes — independent UPDATE statements:
db.execute('UPDATE entities SET status = ? WHERE id = ?', [...])
db.execute('UPDATE entities SET state = json_patch(state, ?) WHERE id = ?', [...])

// No — read-modify-write loses concurrent writes:
const entity = db.queryOne('SELECT * FROM entities WHERE id = ?', [id])
entity.status = 'active'
entity.state = { ...entity.state, ...patches }
db.execute('UPDATE entities SET status = ?, state = ? WHERE id = ?', [entity.status, entity.state, id])
```

Zustand actions enforce per-field-or-per-state-patch updates, so the
underlying SQLite UPDATEs are independent. Optimistic concurrency
(detect rare conflict, retry) covers the residual collision case.

### Single-writer-per-write-set in v1

The background classifier is the first agent that runs concurrent
with the per-turn pipeline. The user-edit gate (UI-side disabling of
controls during pipeline runs) does **not** relax — user edits already
operate at field granularity and respect the same write-set
boundaries.

`'concurrent-allowed'` was previously theoretical in
[`architecture.md`](./architecture.md); the periodic classifier is its
first real consumer and triggers documenting the value.

---

## Embedding infrastructure

### Runtime — provider OR local, user choice

User-pickable backend per story (or app-default), both producing the
same memory algorithm:

- **Provider embedding endpoint.** Self-hosted or cloud, depending on
  the user's configured provider. Anthropic doesn't expose
  embeddings; OpenAI, Voyage, Google do. The
  `app_settings.providers[].cachedModels[].capabilities` schema
  carries embedding capability per model.
- **Bundled local embedder.** A quantized small ONNX model
  (`all-MiniLM-L6-v2` or similar; selection lands at implementation),
  ~25MB bundle, ~384-dim, runs on CPU. Cross-platform via Electron on
  desktop and Expo on mobile.

The user picks one or the other in App Settings → Memory; both drive
identical retrieval behavior. The choice affects only the embedding
model, not the algorithm.

### Mode-3 fallback — story-creation regime

If a story is configured with neither a provider embedding nor the
local embedder available (or the user explicitly opts out), retrieval
degrades to **LLM-only mode** — a dedicated retrieval agent makes
per-turn LLM calls to pick what to inject from the candidate pool.
Slow, expensive, but works without embedding infrastructure.

Mode-3 is **set at story creation, no mid-story switching**. The two
regimes (embedding-driven vs. LLM-only) produce different memory
behavior — different cost-per-turn, different failure modes, different
retrieval-quality curve on long stories. Switching mid-story would
invalidate the prior memory model. The story remembers which mode it
ran in; the future memory-probe affordance (parked) becomes
load-bearing for debugging mode-3.

### Storage — `embeddings` table

Polymorphic FK shape mirroring the `translations` pattern:

```sql
embeddings {
  branch_id TEXT, id TEXT,                      -- composite PK; forks with branch
  target_kind TEXT,                             -- 'entity' | 'lore' | 'happening' | 'thread' | 'chapter'
  target_id TEXT,                               -- id in target_table
  field TEXT,                                   -- 'description' | 'body' | 'composite' | etc.
  model_id TEXT,                                -- canonical embedding model id
  dim INTEGER,                                  -- vector dimension
  vector BLOB,                                  -- packed float32 or float16
  source_hash TEXT,                             -- content hash of source fields at embed time
  updated_at INTEGER,
  PRIMARY KEY (branch_id, id),
  UNIQUE (branch_id, target_kind, target_id, field, model_id)
}
```

Embeddings are **not delta-logged** because they're deterministic
from source content — re-computing reproduces them losslessly. But
the source field can change without the embedding being aware
(manual edit, rollback reverting a prior edit, branch-fork drift,
schema migration). The fix is **hash-based lazy detection at
retrieval time**:

- `source_hash` stores the content hash of the embedded fields at
  embed time (`xxhash(title + description)` or similar).
- At retrieval, compute the candidate row's current content hash;
  compare to the stored `source_hash`.
- **Mismatch → re-embed before scoring**, persist with the new
  `source_hash`.

Uniform: handles rollback-induced staleness, manual edits, schema
migrations, anything that desyncs row content from its embedding.
Cost is microseconds per candidate per turn (`xxhash` is fast); re-
embed only fires when actually needed.

**Why not timestamps for staleness detection.** Rollback restores
a prior `row.updated_at` along with the rest of the row's state. So
`row.updated_at < embedding.updated_at` post-rollback — the "row
newer than embedding" check inverts, staleness goes undetected.
Hashes are content-aware and immune to timeline-direction games.

Branched (forks with the branch like every other branch-scoped table).
Multi-model coexistence supported (different `model_id` rows for the
same target — useful during model swaps).

### What gets embedded per type

| Type             | Field                                                | Stability                                             |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **Entity**       | `name + description`                                 | Stable; re-embed only on user edit of either          |
| **Lore**         | `title + body`                                       | Stable; re-embed on user edit                         |
| **Happening**    | `title + description`                                | Stable after creation; re-embed on user edit          |
| **Thread**       | `title + description`                                | Stable; re-embed on user edit                         |
| **Chapter**      | `summary + theme`                                    | Stable after Phase 2 generates; re-embed on user edit |
| **Scene digest** | composite of structural fields plus optional summary | Per-turn ephemeral; not stored                        |

**Entity state is excluded from embeddings.** `visual.*`,
`equipped_items`, etc. mutate per turn; including them in entity
embeddings would force per-turn re-embeds across the cast. State
mutations affect retrieval via the structural floor (active+in-scene
short-circuit) and via the entity's role in scene digests, not via the
entity embedding itself.

### Refresh / cadence

- **After turn:** embed everything the turn produced (new lore, new
  happenings, refreshed scene digest, edited descriptions). User is
  reading; idle window is ~5-30 seconds. Background-job-scheduled.
- **Before turn:** embed user action only. Short text; <20ms local,
  <100ms API.
- **Cache:** keyed by `(target_kind, target_id, field, model_id)`. If
  source field unchanged and model unchanged, reuse.

### Model swap UX

Model swap detected when `app_settings.embedding_model_id` changes
and the cached `embeddings.model_id` doesn't match. AlertDialog
surfaces with three options:

- **Re-index now.** Background job re-embeds existing rows under the
  new model. Progress visible; cancellable.
- **Re-index lazily.** Default. Re-embeds on demand as candidates are
  touched. UX-graceful, spreads cost.
- **Same model, different ID — skip re-index.** Escape hatch for
  canonical-id mismatches (`Snowflake/snowflake-arctic-embed-m` vs.
  `snowflake-arctic-embed-m`). Bulk-updates `embeddings.model_id`
  without re-computing. Disclaimer shown ("if the model is actually
  different, retrieval quality will silently degrade").

A standalone "Re-index now" button stays available in the same
settings panel for users who want to force a re-index without changing
the model.

---

## Query construction — three-vector stack

Each retrieval pass embeds three queries and ranks candidates against
each, blending the per-vector similarities into a final score per
candidate.

### Q1: User action

The user's action text for the current turn. Always available
(retrieval runs after the Pre phase commits the user-action delta).
Short, signal-dense, embeds fast.

### Q2: Structural digest

Code-template floor + optional piggyback enrichment:

```
{sceneEntities.names}, {currentLocation.name}.
Active threads: {activeThreads.titles}.
Era: {era_name}.
{summary}    -- optional, from piggyback trailing block
```

Structural fields are computed from existing data; deterministic,
free, always available. The summary line is **optional enrichment**
from the piggyback trailing block (one sentence, ~30 tokens). When the
trailing block parses, summary is included; when it doesn't, the
structural template stands alone.

The bet on enrichment-not-dependence: rich digests improve retrieval
ranking but the structural template is genuinely rich on its own
(names, location, arc context). Tying retrieval quality to "the model
emitted a clean structured block this turn" was rejected as too
fragile at narrative-generation temperatures.

### Q3: Heuristic prose extract

Sentence-level signal-density extraction from the last narrative
entry. Avoids embedding 400-1000 tokens of filler-heavy prose;
isolates the high-signal slices.

Per-sentence scoring:

| Signal                                                                                                         | Weight |
| -------------------------------------------------------------------------------------------------------------- | ------ |
| Named-entity hit (matches entity-name index)                                                                   | High   |
| Lore-keyword hit (matches `lore.keywords` index)                                                               | High   |
| Action-verb hit (drew, struck, said, killed, swore, revealed, named, refused, agreed, ran, fled, found, lost…) | Medium |
| Dialogue (quoted span)                                                                                         | Medium |
| Brevity bonus (short impactful sentences)                                                                      | Low    |

Top-K sentences (K=3-5) concatenated, embedded as one vector. Reuses
the entity-name and lore-keyword indexes already built for the
[hybrid retrieval](#hybrid-retrieval-per-type) pathway.

What this catches that pure structural digest misses: terminology in
dialogue, action cues, references the digest's structural fields
don't carry. What it still misses: pure thematic / emotional signal,
pronoun-mediated reference (genuinely needs an LLM-emitted digest or
coreference resolution; not chased in v1).

### Blending — weighted average

Each candidate scores against each query vector via cosine similarity.
Final score is the weighted average:

```
score(c) = w_action × sim(Q1, c) + w_digest × sim(Q2, c) + w_prose × sim(Q3, c)
```

Default weights (placeholder; user-tunable in advanced settings):

```
w_action = 0.35
w_digest = 0.35
w_prose  = 0.30
```

Weighted average over `max` because `max` lets a single strong signal
dominate, which is recall-favoring but noisy. Weighted average is the
consensus shape. Hybrid (`α × max + (1-α) × weighted_avg`) is reserved
for if real testing surfaces over-conservative retrieval.

### Cold start

Turn 1 has no prior user action AND no prior AI entry to embed
against. Fall back to:

- Q1: user's first action (available; retrieval runs after Pre).
- Q2: wizard-derived structural digest. No piggyback summary line yet.
- Q3: heuristic prose extract from the **opening** entry.

When a component is missing, weights re-normalize across the remaining
queries. No special cold-start logic beyond that.

---

## Candidate pools

The retrieval pool per type after the structural floor is satisfied.

### Structural floor — always inject

| Source                         | Notes                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Recent buffer                  | Last `recentBuffer` entries verbatim; with `fullChapterInBuffer=true`, current chapter is also verbatim in addition |
| Active + in-scene entities     | `entities.status='active' AND id ∈ sceneEntities` — short-circuits `injection_mode`                                 |
| Current location entity        | `currentLocationId` — same short-circuit                                                                            |
| Active threads                 | `threads.status='active'` — must-inject as structural framing                                                       |
| `injection_mode='always'` rows | Across entities / lore / threads — user-intent override                                                             |

### Chapter summaries pool

Closed `chapters` rows form a separate retrieval pool. Each chapter's
`summary` (plus `theme` and `keywords`) is the ranking content; the
pool is small (one row per closed chapter) and grows linearly with
story length.

A matched chapter — one that survives MMR + budget-fill and ends up
injected — is also used as a structural cue to boost happenings
within its range (see
[Chapter-match boost on happenings](#chapter-match-boost-on-happenings)).

**Why chapter summaries are real signal that happenings + lore don't
already cover:** chapter summaries are the **mid-level** "what was
this chapter ABOUT" layer. Happenings are atomic events; lore is
timeless reference. Neither captures meta-narrative — "Aria's arc in
this chapter shifted from solo journey to political conspirator" —
which is what a chapter summary expresses. When budget is tight on
long stories, one chapter summary at ~100 tokens covers ground that
5-10 happenings would take ~400 tokens to convey. Compression ratio
matters.

**Cold start:** pool is empty until the first chapter closes. Budget
allocated to chapter summaries goes unused (hard partitions; no
spillover). Acceptable.

### Three-sub-pool entity model

The retrieval pool for entities splits by status:

| Sub-pool             | Framing in prompt                                                        |
| -------------------- | ------------------------------------------------------------------------ |
| **Active off-scene** | "Currently elsewhere; available for retrieval reference"                 |
| **Staged**           | "Available to introduce when narratively appropriate"                    |
| **Retired**          | Default-excluded; opt-in via `injection_mode='always'` for ghosts/echoes |

All three compete for the entity-type token budget. Embedding
similarity to the current scene digest determines which staged
entities float up — a wizard-curated character "the queen who rules
the throne room" auto-surfaces when the scene digest mentions the
throne room.

### Pool exclusions

- **Common-knowledge happenings** with `common_knowledge=1` skip the
  awareness graph entirely; ranked directly off
  `happenings.decay_resistance` against the queries.
- **Pending / resolved / failed threads** join the ranker pool subject
  to `injection_mode`.
- **Same-name suppression** — staged entities whose names appear in
  recent un-classified buffer prose are suppressed from the current
  pool (see [Name collision](#name-collision-and-disambiguation)).

---

## Hybrid retrieval per type

Embedding similarity is the primary signal but not the only one.
Different types benefit from different signal blends.

| Type                  | Primary                         | Complement                                                                               |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Lore**              | Embedding (title + body)        | Keyword on `lore.keywords` — proper nouns, in-world terminology                          |
| **Entities**          | Embedding (name + description)  | Keyword on `name` — direct prose reference                                               |
| **Happenings**        | Embedding (title + description) | Keyword on `awareness.source` strings — verbatim names / places in awareness descriptors |
| **Threads**           | Embedding (title + description) | None                                                                                     |
| **Chapter summaries** | Embedding (summary + theme)     | Keyword on `chapters.keywords` — chapter-level browse keywords (Phase 2 output)          |

For lore particularly, the keyword pathway is load-bearing — embedding
models have no semantic prior on user-authored proper nouns
("Vael" / "the Aetherium" / "blood-bound"). Keyword matching catches
exact lexical hits that embeddings miss; embeddings catch thematic /
conceptual matches that keyword can't (synonym, paraphrase). Together
they cover.

### Keywords schema

| Type         | Keyword surface                   | Source                                                                  |
| ------------ | --------------------------------- | ----------------------------------------------------------------------- |
| `lore`       | `keywords TEXT` (JSON `string[]`) | User-authored at create time, OR lore-mgmt agent emits at chapter close |
| `entities`   | `name` field                      | Implicit                                                                |
| `happenings` | `awareness.source` strings        | Implicit (per-row, not per-happening)                                   |
| `threads`    | (none)                            | —                                                                       |

Lore's `keywords` field is added; `lore.tags` stays separate (tags are
user-meaningful labels; keywords are retrieval-targeted strings).

### `auto` injection mode

`injection_mode='keyword_llm'` is renamed to `'auto'` across entities,
lore, and threads. The `_llm` suffix was misleading once retrieval
became keyword + embedding (LLM is fallback only, not primary). `auto`
honestly describes the user contract: the system handles it via
whatever signals are available (keyword + embedding + LLM fallback
when both miss). Implementation can evolve without changing
user-facing semantics.

Schema migration: rename enum value across data-model and any code
references; UI copy updates accordingly.

---

## Pinning — `decay_resistance`

The "load-bearing despite dissimilar" signal that semantic similarity
will miss. Lives on awareness rows (and on common-knowledge
happenings) as an auxiliary attribute.

### Pinning Schema

```
happening_awareness {
  ... existing fields ...
  decay_resistance REAL DEFAULT 0   -- ∈ `[0, 1]`; scales decay rate
}
```

`decay_resistance = 0` means full decay (today's behavior). `1` means
no decay (effectively a hard pin). Fractional values for
"mostly persistent."

### Why on awareness only

Awareness is per-character; severity / importance is naturally
per-character ("Aria's mother died" is severity-95 to Aria, severity-10
to a stranger who heard rumors). Storing on `happening_awareness` lets
the per-character variance survive into retrieval ranking, which is
itself per-character via POV-awareness.

Common-knowledge happenings (`common_knowledge=1`) skip the awareness
graph entirely and **don't carry a `decay_resistance` signal**.
They're already pinned by being common knowledge — adding a per-row
pin would be redundant. The ranker scores them by relevance only
(see [Common-knowledge happenings — special case](#common-knowledge-happenings--special-case)).
Trade-off: user can't force-pin a load-bearing common-knowledge
happening that's consistently semantically dissimilar to scenes. v1
floor; rare in practice.

### Sources

| Source                                | Cadence                    | Signal                                                                                                                                                                     |
| ------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User explicit toggle**              | Any time                   | UI affordance on awareness rows in Plot / World panels. Sets `decay_resistance = 1`. Permanent until user toggles off.                                                     |
| **Classifier severity at extraction** | Periodic classifier writes | When emitting an awareness row, classifier judges severity ∈ `[0, 1]` from prose context. Subjective, model-judged. Becomes the default `decay_resistance` on the new row. |
| **Lore-mgmt housekeeping**            | Chapter close              | Reviews closed-chapter awareness rows; can adjust `decay_resistance` upward (recognized structural) or downward (turned out incidental). Conservative bias.                |

### Ranker semantics

The ranker uses `decay_resistance` to bias the budget queue: pinned
items get **preferred slots in the budget queue, ranked by recency
among themselves**, with the embedding-similarity-ranked tail filling
remaining budget. Pinned items do **not bypass the budget** — long
stories with hundreds of pinned rows still fall to budget pressure,
oldest-pinned-first. Absolute always-inject would break on long
stories.

Decay model: salience decays per chapter, scaled by
`(1 - decay_resistance)`. Exact math at the
[ranker design](#the-ranker).

### What doesn't drive `decay_resistance`

- **In-prose recall reinforcement** — the idea that "the model wrote
  about this happening, so it must be important; bump the pin" — was
  rejected as a positive feedback loop. Pinned items get retrieved
  more, prose references them more, pin grows, monopolizes budget. No
  clean cap. Dropped.
- **Common-knowledge auto-emission by classifier** — was rejected as
  too risky. "Is this widely known" requires social-spread reasoning
  the prose doesn't reliably encode. `common_knowledge` stays
  user-only; classifier never auto-emits. `happenings.decay_resistance`
  for those rows is therefore also user-driven only.

### Pin contradiction reconciliation

A `death` event auto-pinned at chapter 3 becomes obsolete when chapter
25 reveals "actually alive." Auto-detection of contradicting evidence
is parked for v1 — accept the cost (some stale-pin retrieval noise);
user can manually un-pin. Lore-mgmt eventually catches the most
egregious cases at chapter close.

---

## Per-type retrieval budgets

Token budget split across candidate types is user-configurable per
story. Gives explicit control over context allocation.

### Additive UI

User adjusts individual sliders for each type's allocation; the total
emerges as the sum. **No "set total budget, then assign percentages"
gymnastics** — sliders show absolute token counts, total appears
beneath them.

```
Entities:    [====      ]  1200 tokens
Lore:        [======    ]  1800 tokens
Happenings:  [=====     ]  1500 tokens
Threads:     [==        ]   400 tokens
                          ─────
Total:                    4900 tokens
```

The user feels the cost directly per type. Tuning is "I want more
lore in retrieval; drag the slider up" — not "I want lore at 35% of
an abstract whole."

### Hard partitions in v1

Unused tokens within a type's allocation stay empty. No cross-type
spillover. Trade: predictable behavior over slightly-better window
utilization. Spillover is post-v1; the schema supports adding it later
without breaking changes.

### Structural floor takes budget first

The numbers in per-type budgets apply to **what's left after the
structural floor seats**. Recent buffer + active+in-scene entities +
their location + active threads consume tokens unconditionally. Then
prompt-overhead reservation. Then the per-type retrieval budgets
allocate the remainder.

UI shows allocations as **"of remaining ~X tokens after structural
inject"**, not "of full window." Cast-heavy scenes shrink the
available pool dramatically; misleading the user about the relative
cost would let them paint into a corner.

### POV-awareness scope

Retrieval queries the awareness graph as the **union of all in-scene
characters' awareness rows** in both adventure and creative modes:

```sql
SELECT * FROM happening_awareness
WHERE character_id IN ({sceneEntities ∩ characters})
```

Lead-only filtering was considered for adventure mode and rejected.
Characters can feasibly acquire knowledge without the protagonist
present (detached-POV moments), and the `narration` setting
(`first | second | third`) is the lever for POV-constraint via
prompt, not retrieval. The risk of leakage (AI mentions things the
protagonist shouldn't know) is bounded by narration-mediated
prompting; the schema supports tightening to lead-only later if
real-world testing shows persistent leakage.

---

## Name collision and disambiguation

Two layers handle the case where the AI invents a character with the
same name as an existing (often staged) entity.

### Layer A — retrieval-time same-name suppression

Before injecting staged entities into the prompt, scan the recent
un-classified buffer prose for names matching staged-entity names. If
a staged entity's name appears in recent prose (signal: AI may have
just used or invented this name), **suppress that staged entity from
this turn's retrieval**.

The reasoning: surfacing a staged-namesake right after the prose used
the name creates collision risk in the LLM's next narrative. Safer to
keep the staged version off-context until the classifier resolves
whether the prose use is intentional (promote) or fresh (create new).

Reuses the entity-name index. Heuristic (text scan), not LLM.

### Layer B — code-side reconciliation at extraction

Per turn the classifier runs, when it extracts a "new character"
mention from prose:

1. **Name lookup** against the entity index. O(1).
2. **No name match** → genuinely novel character; create fresh.
3. **Name match found** → embedding similarity between extracted
   description and existing description.
   - **High** (`sim ≥ τ_high`) → promote staged → active OR treat as
     existing active mention. Update if the extract adds info.
   - **Low** (`sim < τ_low`) → create new entity, set
     `name_collision_flag = true`. Surfaces in the World panel for
     user review.
   - **Ambiguous** (`τ_low ≤ sim < τ_high`) → conservative create-new
     with the flag.

Tunable thresholds; defaults TBD empirically.

### Schema

```
entities {
  ... existing fields ...
  name_collision_flag INTEGER DEFAULT 0   -- 1 = review needed
}
```

Flag clears when the user resolves the collision (merge, rename, or
explicit "keep as distinct").

### Polymorphic naming — v1 limitation

Genuinely distinct same-name characters (multiple "Roberts" in a
story where both are intentional) require **manual user rename** of
one in the World panel. No schema-level support for two distinct
entities to coexist with the same name. Documented in
[`data-model.md → World-state storage`](./data-model.md#world-state-storage)
when this lands.

### The narrative-weirdness residual

Layer A suppresses most prompt-time collisions; Layer B cleans up
post-fact. The residual case where the AI sees both versions in the
same turn (rare with Layer A in place) and morphs one into the other
results in classifier-side reconciliation either promoting the staged
version (descriptions converge) or keeping them as distinct entities
with the flag for review. The narrative may have a brief inconsistency
("tavern keeper Eldrin became a noble Eldrin across two turns") but
the data layer stays consistent. User can rollback or merge to
resolve.

---

## Staged-entity promotion

Two paths to staged → active. Both converge on the same end state.

### Fast path — piggyback ID emission

When piggyback's `sceneEntities` includes an entity ID currently at
`status='staged'`, that's a strong signal of intentional introduction.
Piggyback processing auto-promotes inline:

1. Detect staged-ID in emitted `sceneEntities`.
2. Issue `UPDATE entities SET status='active'` with the same
   `action_id` as the turn's other writes.
3. Update `lastSeenAt` for the now-introduced character.

The wizard-authored description survives unchanged — first-introduction
description authorship is at the wizard, not the classifier.
[`data-model.md → Authorship contract`](./data-model.md#authorship-contract)
is preserved.

### Slow path — periodic classifier prose extraction

When prose introduces a character without piggyback emitting their
staged ID (model didn't pick up the available-staged hint, or the
user wrote the action introducing them):

1. Periodic classifier extracts the character mention from buffered
   prose.
2. Code-side reconciliation runs (see
   [Layer B](#layer-b--code-side-reconciliation-at-extraction)).
3. If the description matches a staged entity, classifier promotes via
   the standard status-flip path.

### Prompt framing

The retrieval inject for staged entities surfaces them with bracketed
ID handles:

```
Staged characters (introduce when narratively appropriate):
- [ent_lord_eldrin] Lord Eldrin: noble exiled to the marshes after political coup, seeks to reclaim his rightful place.
- [ent_queen_morwen] Queen Morwen: ruler of the eastern principality, secretly allied with the rebellion.
```

The narrative prompt instructs: "If you introduce any staged character,
include their bracketed ID in the trailing `<scene_entities>` block."
This gives the LLM the handle to drive the fast-path promotion.

---

## Retirement

### Hard signals only — periodic classifier

The periodic classifier retires `active → retired` only on
unambiguous prose evidence:

- Death (clearly final — "Kael's lifeless body" rather than "Kael was
  hurt").
- Explicit exile / banishment with no return-arc setup.
- Faction-disbanded / structural finality.

Conservative bias. Single-line ambiguous prose ("Kael wandered off")
does **not** trigger retirement.

### "Wandered off" stays active

Off-screen-but-alive characters stay `status='active'` with stale
`lastSeenAt`. Retrieval naturally deprioritizes them (off-scene means
subject to ranker, not structurally injected). World panel can dim
them at the display layer if desired. No fourth `inactive` status.

The `retired_reason` example list in
[`data-model.md → World-state storage`](./data-model.md#world-state-storage)
should be tightened to drop "wandered off" — that example contradicts
the hard-finality model and would mislead the design.

### Chapter-close lore-mgmt — deeper review

Across the closed range, can demote `active → retired` on chapter-scope
evidence ("character mentioned once in 50 turns; last seen leaving the
kingdom permanently") that single-prose-line periodic classifier would
(correctly) skip.

### Retired → active is user-only in v1

Resurrection / fake-death-reveal / return-from-exile are
story-significant moments where the user explicitly toggles via the
World panel. Agent-driven `retired → active` is parked-until-signal:
auto-resurrecting on weak prose has a much worse failure mode than
requiring a user click.

---

## Cutaways and multi-scene entries

A single entry whose prose includes a scene transition to a different
cast and location ("Meanwhile, in the throne room…") is a **v1
limitation**, not a feature.

The data shape carries one `currentLocationId` and one `sceneEntities`
per entry. The computed-location pattern assumes single-scene entries.
A meanwhile-cutaway entry produces:

- All off-scene characters retain prior `lastSeenAt` (they're not in
  this entry's `sceneEntities`), even though prose just placed them
  somewhere new.
- The new scene's location is captured in `currentLocationId` only if
  the model judges that the second scene is the entry's "primary"
  scene; otherwise the cutaway is invisible to the structural model.

Stories that lean heavily on cutaway can't fully use the
location / awareness graph regardless. Documented limitation; not
chased in v1.

For state changes inside a short cutaway: piggyback should guard
against state mutations from cutaway content. If the model emits
different `sceneEntities` for the cutaway portion, the piggyback rule
"compute lastSeenAt from scene-presence delta" applies cleanly. If the
cutaway is brief enough not to flip `sceneEntities`, treat it as
narrative texture without state implications.

---

## The ranker

The ranker turns per-type candidate pools into the actual injected
slice for each turn. **Inputs** are settled per the rest of this doc:
three query vectors with weighted-average blending, per-type candidate
pools with the three-sub-pool entity model, per-type token budgets
(additive sliders, hard partitions in v1), and per-row signals
(`decay_resistance` on awareness, `priority` on lore, recency
markers, `injection_mode='always'` overrides).

Independent ranker pass per type. Per-type budgets are hard
partitions, so types don't compete with each other; each type's
ranker fills its own slice.

### Scoring function

Per-candidate score combines four signals — multiplicative
integration for similarity × recency × pin, additive for the
keyword complement, with a high-similarity bypass for revival of
deeply-decayed rows:

```
score(c) = max(
    sim_blend(c) × recency_factor(c) + kw_boost(c),
    (sim_blend(c) − τ_revive) if sim_blend(c) ≥ τ_revive else 0
)

recency_factor(c) = exp(−λ_type × chapters_old(c) × (1 − pin_signal(c)))
```

Where:

- **`sim_blend(c)`** — weighted-avg of cosine similarities between `c`
  and each of the three query vectors (action / structural digest /
  prose extract). Already computed in the
  [query stack](#query-construction--three-vector-stack).
- **`pin_signal(c)`** — `decay_resistance` for awareness rows,
  `priority/100` for lore, `0` for entities and threads (no
  continuous pin signal in v1).
- **`λ_type`** — type-specific decay rate (table below).
- **`chapters_old(c)`** — chapters since `c` became relevant
  (`learned_at_entry` for awareness, `created_at` mapped to chapter
  for happenings without awareness, `updated_at` for entities and
  threads, effectively zero for lore since lore is timeless).
- **`kw_boost(c)`** — additive bonus when the keyword index hits
  (lore keywords, entity name, awareness `source` string). Default
  magnitude `0.10`. Zero if no keyword pathway exists for the type.

The multiplicative pin-into-recency integration is the key shape:

- `pin_signal = 1` flat-tops decay (item maintains full `sim_blend`
  forever).
- `pin_signal = 0` decays normally.
- Fractional values for "mostly persistent."

Pinned items naturally float higher in the ranker without a separate
tier; budget pressure still drops them when oversubscribed (see
[Budget-fill termination](#budget-fill-termination)). The
"long story with hundreds of pins" failure mode handles itself —
pins compete on similarity to current scene, only the
diverse-and-relevant ones survive MMR + budget.

### High-similarity bypass — revival of decayed memories

The decay model handles ageing well but creates a structural gap on
long-arc stories: a chapter-3 happening with `dr = 0.3` at chapter
60 has `recency_factor ≈ 0.06` even at perfect `sim_blend = 1.0`,
falling below the noise floor. Without intervention, decayed
memories are invisible to retrieval — they can never resurface even
when extremely relevant to the current scene.

The bypass term in the scoring function fixes this:

```
bypass_score(c) = sim_blend(c) − τ_revive   when sim_blend(c) ≥ τ_revive
                  0                          otherwise
```

A candidate whose embedding similarity to the current scene exceeds
`τ_revive` (default 0.85, tunable) gets a score floor of
`sim_blend - τ_revive`, ignoring the recency-and-pin decay. Old
rows that perfectly match a callback scene resurface; old rows
that match weakly or generically don't.

The semantics: "if this old thing matches the current scene that
closely, it's probably a real callback — surface it regardless of
age." Conservative threshold (0.85+) limits false positives from
generic prose-similarity matches.

**Interaction with other mechanisms:**

- **Retrieval-frequency tracking** still applies. Bypass-revived
  rows participate in the counter; if they keep getting revived
  turn after turn, they show up in phase 3d's high-frequency
  candidate set at next chapter close, where lore-mgmt can promote
  them to higher `decay_resistance` (or leave alone if marginal).
  Self-correcting.
- **Budget pressure** still gates inclusion. Revival doesn't
  bypass the budget; it only bypasses the score-threshold floor.
  An old row that bypasses can still lose to recent rows that
  out-score it within the budget.
- **MMR diversity** still applies. Multiple bypass-revived rows
  that semantically cluster will dedup against each other.

The risk — false-positive revivals where high embedding similarity
isn't load-bearing narrative connection — is bounded by `τ_revive`
height, by budget pressure, and by the lore-mgmt review path.
Worst residual case: user notices via [memory probe](#followups-generated)
that a row is being revived spuriously and manually unpins or
demotes via World panel.

### Chapter-match boost on happenings

When chapter summaries survive their own ranking pass and end up
injected, their content is contextually relevant — and the
happenings that occurred within those chapters' ranges inherit some
of that relevance. The happenings ranker applies a multiplier to
such candidates:

```
chapter_boost(h, matched_chapters) =
  if any(ch.range contains h.occurred_at_entry for ch in matched_chapters):
    1.3   # tunable; default range 1.2-1.5
  else:
    1.0

score(h) = (sim_blend × recency_factor + kw_boost) × chapter_boost(h, matched_chapters)
```

`matched_chapters` is the set of chapters that survived the
chapter-summary pool's MMR + budget-fill — actually injected, not
just ranked highly. The boost only fires for chapters whose content
the prompt will actually carry context about.

**Pipeline impact** — chapter-summary ranking must complete before
happenings ranking starts so `matched_chapters` is known. Other
types (entities, lore, threads) run independently in parallel.

**Why this matters.** Without the boost, happening retrieval is
"scattered" — top-K by similarity across the entire story, often
disconnected. With the boost, top-K tends to cluster around the
chapters most relevant right now: a more narratively coherent slice
of context for the LLM.

### Scale assumptions

Pool sizes grow substantially with story length. Realistic projection
for a story at `chapterTokenThreshold = 24k`, ~500 tokens/turn
(~48 turns/chapter), and 1-2 happenings extracted per turn:

| Metric                                                   | Per chapter | At 30 chapters | At 60 chapters |
| -------------------------------------------------------- | ----------- | -------------- | -------------- |
| Happenings                                               | 50-100      | 1.5-3k         | 3-6k           |
| Awareness rows (5-10× happenings depending on cast size) | 250-1000    | 7.5-30k        | 15-60k         |
| Embedding storage (~1.5KB per happening)                 | ~100-150KB  | ~3-5MB         | ~5-10MB        |

The decay-rate defaults below are **guesses calibrated for these
volumes** — calibrated in the sense of "λ=0.07 produces sensible-
looking ranking on toy data," not "λ=0.07 has been validated against
real stories." Real testing on real stories will move these numbers,
possibly by 2× or more in either direction. The
[empirical-tuning followup](#v1-blocking) covers the calibration
pass; until that lands, these are starting points exposed for
power-user override in advanced settings.

Architecturally, these volumes drove several choices we already
made: pre-filter to top-200 before MMR (otherwise ranking thousands
of candidates per turn gets expensive), per-type hard-partitioned
budgets (otherwise happenings drown out lore), and chapter-match
boost on happenings (otherwise top-K from thousands of candidates is
scattered rather than coherent).

### Per-type decay rates

Sensible starting defaults; tunable per story in advanced settings:

| Type                   | `λ`          | `recency_factor = 0.5` at | Rationale                                                                     |
| ---------------------- | ------------ | ------------------------- | ----------------------------------------------------------------------------- |
| Happenings (awareness) | 0.07         | ~10 chapters              | Events get stale, but not as fast as a 5-chapter half-life would imply        |
| Entities (off-scene)   | 0.025        | ~28 chapters              | Cast turnover is slow                                                         |
| Threads                | 0.025        | ~28 chapters              | Arc presence is slow                                                          |
| Lore                   | 0 (no decay) | —                         | Effectively timeless; ranks purely on `sim_blend × (priority/100) + kw_boost` |
| Chapter summaries      | 0 (no decay) | —                         | Mid-level historical record; ranks purely on `sim_blend + kw_boost`           |

Lore and chapter summaries don't decay — they're inherently long-arc
content. Lore is timeless reference; chapter summaries are factual
records of "what happened in chapter X." Both rank purely on
relevance to the current scene.

These defaults are starting guesses; the empirical-tuning followup
calibrates them against real story data.

### Common-knowledge happenings — special case

Common-knowledge happenings (`happenings.common_knowledge=1`) bypass
the awareness graph entirely; no awareness rows exist for them. They
score by:

```
score(c) = sim_blend(c) + kw_boost(c)
```

No recency decay, no pin signal. They're pinned by being common
knowledge; rank purely on relevance to current scene. If a
common-knowledge happening becomes irrelevant to current scene
context, it ranks low and falls out of budget naturally; if relevant,
it always gets considered for injection.

The small gap: a load-bearing common-knowledge happening that's
consistently semantically dissimilar to relevant scenes can't be
force-injected by the user (no `injection_mode` on happenings, no
`decay_resistance` per the simplification). v1 floor; rare in
practice. If real signal shows it bites, extend `injection_mode` to
happenings or add a `decay_resistance` column.

### Diversity — MMR

Pure top-K by raw score surfaces near-duplicate clusters (three
similar awareness rows about Aria's grief crowd out orthogonal
signals). Maximal Marginal Relevance penalizes redundancy:

```
mmr_score(c, S) = λ_div × score(c) − (1 − λ_div) × max(sim(c, c') for c' in S)
```

Where:

- `S` is the already-selected set (initially empty; `max(...)` is `0`).
- `sim(c, c')` is embedding similarity between candidates.
- `λ_div = 0.75` default — strong relevance preference, mild
  diversity. Tunable.

Iteratively pick the candidate with highest `mmr_score`, add to `S`,
recompute, pick next.

**Per-type MMR.** Diversity runs independently within each candidate
type. A happening shouldn't dedup against a lore entry; they're
different shapes carrying orthogonal signal.

**Cost.** O(N × K) per type. For typical pools (hundreds), sub-
millisecond. For long-running stories with thousands of awareness
rows, **pre-filter to top-200 by raw score before MMR**. Trade:
candidates ranking ~200th by raw score are unlikely to make it into
the budget anyway, so the pre-filter doesn't lose meaningful
selections.

### Budget-fill termination

Greedy fill within the per-type budget after MMR ranking:

```python
selected = []
remaining = type_budget

for c, mmr_score in mmr_ranked_candidates:
    if mmr_score < min_score_threshold:
        break              # entered noise territory; stop
    cost = token_estimate(c)
    if cost > remaining:
        continue           # too large for what's left; try smaller candidates
    selected.append(c)
    remaining -= cost

return selected
```

**Edge cases:**

- **Candidate larger than remaining budget** — skip and try next.
  Don't truncate (truncated candidates are noise).
- **Candidate larger than the entire type budget** — skip permanently.
  Surface in Story Settings as a warning ("your happenings budget is
  below the median happening size; consider raising it").
- **`min_score_threshold = 0.15`** (cosine baseline) — rows below
  this are essentially semantically unrelated to current scene;
  including them clutters the prompt with noise. Underutilized budget
  is fine; we don't backfill with low-relevance content.

No "must-fill-budget" mode. The user's expectation is "good context
or no context, not bad context."

### Token estimation

Tiktoken-based, computed at ranker time:

```
token_count(c) = tiktoken(c.rendered_field_text) + type_overhead(type_of(c))
```

Per-type overhead is a small constant for the Liquid macro / block
wrapping (entity character_block ≈ 30 tokens, lore block ≈ 10 tokens,
happening memory block ≈ 20 tokens, thread block ≈ 10 tokens).
Measured empirically once the macros are concrete; constant in code
thereafter.

**No stored column on candidate tables.** Tokenization is fast enough
(microseconds per row); per-turn cost is sub-millisecond total.
Ranker passes cache results in memory for reuse within the turn.

If real perf testing later shows tokenization is a bottleneck, add a
`token_count INTEGER` column per candidate table with cache
invalidation on row update. Don't pre-optimize.

### Per-turn cost budget

Dominant terms:

| Step                                        | Cost                                               |
| ------------------------------------------- | -------------------------------------------------- |
| Embedding three query vectors               | ~20ms local / ~50ms API (parallelized)             |
| Cosine similarity batch over candidate pool | <10ms for 1000s of candidates with vectorized math |
| MMR per type (after pre-filter to 200)      | <5ms per type                                      |
| Token estimation                            | <1ms total                                         |
| Budget fill                                 | <1ms                                               |

Target: <100ms total for typical stories on local embedder. Acceptable
even for the longest typical pools.

### Pseudocode

```python
def rank_per_type(candidates, queries, type_budget, λ_type, type_overhead, *, matched_chapters=None):
    # 1. Compute raw score per candidate
    scored = []
    for c in candidates:
        sim = blend_similarity(c, queries)
        kw  = keyword_boost(c, queries)
        if c.kind == 'happening' and c.common_knowledge:
            score = sim + kw
        else:
            pin = pin_signal(c)
            rec = exp(-λ_type * c.chapters_old * (1 - pin)) if λ_type > 0 else 1.0
            score = sim * rec + kw

        # High-similarity bypass — revival of decayed memories
        if sim >= τ_revive:
            score = max(score, sim - τ_revive)

        # Chapter-match boost on happenings
        if c.kind == 'happening' and matched_chapters:
            if any(ch.contains(c.occurred_at_entry) for ch in matched_chapters):
                score *= 1.3

        scored.append((c, score))

    # 2. Pre-filter for MMR efficiency on large pools
    if len(scored) > 200:
        scored = top_n_by_score(scored, 200)

    # 3. MMR-rank
    mmr_ranked = mmr(scored, λ_div=0.75)

    # 4. Greedy budget fill
    selected = []
    remaining = type_budget
    for c, mmr_score in mmr_ranked:
        if mmr_score < 0.15:
            break
        cost = tiktoken(c.rendered_text) + type_overhead
        if cost > remaining:
            continue
        selected.append(c)
        remaining -= cost

    return selected

def rank_all(pools, queries, budgets, type_config):
    # Chapters first — small pool, ranks fast, output feeds happenings
    matched_chapters = rank_per_type(
        pools['chapters'], queries, budgets['chapters'],
        type_config['chapters'].λ, type_config['chapters'].overhead
    )

    # Happenings depend on matched_chapters (chapter-match boost)
    happenings = rank_per_type(
        pools['happenings'], queries, budgets['happenings'],
        type_config['happenings'].λ, type_config['happenings'].overhead,
        matched_chapters=matched_chapters
    )

    # Other types run independently — no inter-type dependencies
    others = {
        type: rank_per_type(
            pools[type], queries, budgets[type],
            type_config[type].λ, type_config[type].overhead
        )
        for type in ('entities', 'lore', 'threads')
    }

    return {**others, 'chapters': matched_chapters, 'happenings': happenings}
```

### Tuning surface

Defaults are conservative; expose for power-user override in App
Settings → Memory → Advanced:

- Per-type `λ` decay rates.
- `λ_div` MMR diversity vs. relevance.
- `kw_boost` magnitude.
- `min_score_threshold` noise floor.
- `τ_revive` high-similarity bypass threshold (default 0.85;
  controls when decayed-but-extremely-similar rows resurface).
- Per-query weights (`w_action`, `w_digest`, `w_prose`) — already in
  the [query stack](#query-construction--three-vector-stack).

Real signal from testing tunes these. v1 ships with defaults; the
[Threshold tuning followup](#v1-blocking) covers the empirical
calibration pass once test stories exist.

---

## v1 limitations

Known limitations the design accepts and documents rather than chases:

- **Polymorphic naming** — two distinct same-name characters require
  manual rename.
- **Multi-scene / cutaway entries** — not first-class; meanwhile-style
  prose degrades the structural model gracefully.
- **Auto retired → active** — user-only in v1; agent-driven path is
  parked-until-signal.
- **Single-axis `decay_resistance`** — one number can't capture
  orthogonal relevance dimensions ("emotionally resonant" vs.
  "plot-relevant" vs. "character-defining"). v1 floor; multi-axis is
  the signal that drives a v1.x revisit.
- **Pin contradiction reconciliation** — manual user un-pin in v1;
  lore-mgmt eventually catches at chapter close.
- **Memory probe affordance** — debug UI to inspect "what did
  retrieval surface this turn and why" is parked.
- **Mode-3 (LLM-only retrieval)** — story-creation regime, no
  mid-story switch.

---

## Schema impact summary

Changes that need to land in [`data-model.md`](./data-model.md) for
this design to be implementable:

### `entities`

- Add `name_collision_flag INTEGER DEFAULT 0` for collision review.
- Existing authorship contract preserved (no change).

### `lore`

- Add `keywords TEXT` (JSON `string[]`) for the keyword retrieval
  pathway. User-authored at create; lore-mgmt agent emits at chapter
  close.

### `happening_awareness`

- Add `decay_resistance REAL DEFAULT 0` ∈ `[0, 1]`.
- Add `retrieval_count INTEGER DEFAULT 0` — incremented by the
  ranker when a row is injected (post budget-fill). Drives the
  high-frequency candidate set surfaced to lore-mgmt phase 3d.
  **Delta-logged** under each turn's `action_id` so rollback
  cleanly reverses retrieval-driven counter increments along with
  the prose-revert. Without this, counters would remember
  retrievals from rolled-back turns, inflating phase 3d's
  candidate set with phantom history.
- Add `UNIQUE(branch_id, character_id, happening_id)` constraint.
  Classifier and user-edit paths use upsert semantics — duplicate
  awareness rows can't accumulate at the database level.
- **Drop** `salience REAL` — replaced by the
  `sim_blend × recency_factor` model in the ranker, where
  `recency_factor` integrates `decay_resistance` for the ageing
  story. Old `salience` was a content-blind single number per row;
  the new model is content-aware (`sim_blend` recomputes per turn
  against the current scene). `decay_resistance` carries the
  "resistance to ageing" signal that `salience` implicitly bundled
  with everything else.

### Injection-mode enum

- Rename `keyword_llm` → `auto` across `entities.injection_mode`,
  `lore.injection_mode`, `threads.injection_mode`. Schema migration.

### New table — `embeddings`

- Polymorphic FK across `entity` / `lore` / `happening` / `thread`,
  per-`field`, per-`model_id`, with `vector` blob. Forks with branch.

### `stories.settings`

- Add `recentBuffer: number` (default 10).
- Add `fullChapterInBuffer: boolean` (default false).
- Add `classifierCadence: { mode, value }`.
- Add `embeddingBackend: 'provider' | 'local'`.
- Add `retrievalMode: 'embedding' | 'llm-only'` (set at creation,
  immutable).
- Add per-type budget fields:
  `retrievalBudgets: { entities, lore, happenings, threads, chapters }`.
- Add `piggybackMode: 'on' | 'off'` (capability-gated).
- **Drop** `compactionDetail` (was a freeform user prose directive
  for the deprecated memory-compaction agent; chapter-close lore-mgmt
  subsumes its role and the soft-hint UX was deemed marginal value).

### `app_settings`

- Add `embedding_model_id` (canonical id; selectable in App Settings →
  Memory).
- Mirror the new `stories.settings` fields into
  `default_story_settings`.

### Tightening — `retired_reason` example list

- Drop "wandered off" from the example set in the `entities` schema
  description; the example contradicts the hard-finality retirement
  model.

---

## Settings UX implications

The Memory section in Story Settings gets denser:

- Existing: `chapterTokenThreshold`, `chapterAutoClose`.
- Dropped: `compactionDetail`.
- New: `recentBuffer`, `fullChapterInBuffer`, `classifierCadence`,
  `piggybackMode`, `embeddingBackend`, `retrievalMode` (read-only
  after creation), per-type retrieval budget sliders (5 sliders:
  entities, lore, happenings, threads, chapter summaries).

Worth structuring into sub-sections (Recent context / Classifier /
Retrieval / Models) at the design pass for the Memory tab. App
Settings → Memory gets a parallel Story Defaults shape plus the
global `embedding_model_id` selector and the model swap re-index
dialog.

Wireframe and per-control affordance design land at the Story
Settings Memory tab pass.

---

## Followups generated

### v1-blocking

- **Threshold tuning** — empirical calibration pass for the ranker's
  defaults (`λ_type` per candidate type, `λ_div`, `kw_boost`,
  `min_score_threshold`, `chapter_boost` magnitude, `τ_revive`
  high-similarity bypass), for name-collision reconciliation
  (`τ_high`, `τ_low`), for the frequency-driven candidate set size
  (top-N), and for the consolidation cluster threshold (cosine
  similarity, involvements overlap percentage, time-proximity
  window). Lands once test stories exist to calibrate against;
  defaults ship for v1, advanced settings expose them.
- **Local embedder selection + bundling** — which ONNX model, bundle
  size impact on mobile, license review.
- **Background classifier UX** — pill (visible) vs. invisible; Story
  Settings affordance; manual "Run classifier now" override for users
  who want to force a pass.
- **Entity-merge UI** — for the residual collision-flag recovery path.
  Doesn't exist today. World-panel surface, design pass.
- **Memory probe affordance** — debug UI for "what was retrieved and
  why this turn." **Load-bearing for the empirical-tuning pass.**
  Decay rates, similarity thresholds, MMR diversity, chapter-boost
  magnitude all need testing against real stories at realistic
  scale (thousands of happenings, tens of thousands of awareness
  rows; see [Scale assumptions](#scale-assumptions)). Without the
  probe, tuning is guesswork. Surfaces rank scores and budget-fill
  decisions per turn so users can see what fell off and why.
- **Lore-creation cap tuning** — default 3 lore creates per chapter
  is a starting guess. Real usage will tune the right cap (might
  need to be lower for tight worlds, higher for first chapters of
  rich-worldbuilding stories). Belongs in the same empirical
  calibration pass as the threshold tuning.

### Cross-doc updates this design forces

These are integration-time changes to existing docs. Recommended to
land alongside (or before) the v1-blocking ranker design:

- **[`data-model.md`](./data-model.md)** — apply the
  [Schema impact summary](#schema-impact-summary). Tighten the
  `retired_reason` example list. Update the injection-mode enum. Add
  cross-references back to this doc from the
  [Chapters / memory system](./data-model.md#chapters--memory-system),
  [Happenings & character knowledge](./data-model.md#happenings--character-knowledge),
  and
  [Injection modes](./data-model.md#injection-modes--unified-enum--structural-invariant)
  sections.
- **[`architecture.md`](./architecture.md)** — adjust the pipeline
  phase model for piggyback-on-narrative; document the background
  classifier as a `concurrent-allowed` agent (the first real consumer
  of that declaration shape). Replace or shrink the
  [Retrieval / injection phase](./architecture.md#retrieval--injection-phase)
  section, linking to this doc as canonical.
- **[`followups.md`](./followups.md)** — substantially resolves the
  [Lore-management agent shape](./followups.md#lore-management-agent-shape)
  entry (move resolution narrative into this doc). Partially resolves
  the
  [Pipeline consolidation](./followups.md#next-turn-suggestions--design-pass)
  question (piggyback IS pipeline consolidation, with model-capability
  gating). Add the v1-blocking followups above.
- **[`parked.md`](./parked.md)** — the
  [Top-K-by-salience](./parked.md#top-k-by-salience-retrieval--long-term-memory-implications)
  parked entry partially resolves (multi-axis salience still parked,
  but `decay_resistance` answers the "pinned forever" override
  question and the "compaction philosophy" question). The
  [Concurrent pipeline / agent coordination](./parked.md#concurrent-pipeline--agent-coordination)
  parked entry is now answered (the periodic classifier is the first
  agent that uses the gate-declaration shape).

### Parked / post-v1

- **Multi-axis salience.** Single-number `decay_resistance` collapses
  orthogonal relevance dimensions. Real signal (long stories where
  retrieval misses load-bearing facts in scene-mismatched contexts)
  triggers the design.
- **Pin contradiction reconciliation.** Auto-detection that a `death`
  pin is invalidated by a later "actually alive" reveal. v1 floor:
  manual unpin.
- **Spillover policy on per-type budgets.** Hard partitions in v1;
  cross-type spillover when one type underfills lands post-v1.
- **Polymorphic naming support.** Schema-level support for two
  distinct entities with the same name (without one being renamed).
- **Auto-promotion `retired → active`.** Agent-driven path; v1 is
  user-only.
- **Per-type query pools.** Different queries per candidate type
  (e.g. lore retrieved against thematic queries vs. happenings against
  scene queries). v1 uses uniform query bundle.
- **Cutaway / multi-scene entries** — full structural support for
  meanwhile-style prose with multiple scenes per entry. v1 ships
  single-scene-per-entry.
- **Cross-chapter semantic dedup of happenings** — phase 3e handles
  the within-chapter case (clusters happenings by similarity + cast
  - time, agent decides merge / keep distinct / delete redundant;
    awareness rows merge as a side effect). The residual case is
    happenings that describe related events across chapter
    boundaries — phase 3e operates on the closed range only, so
    cross-chapter related happenings stay distinct. Probably rare;
    parked until signal.
- **Lore-mgmt cross-arc callback detection** — agent at chapter
  close identifies "this chapter calls back to chapter 3" patterns
  and re-pins relevant old rows. Powerful but expensive (agent
  needs wide context window) and hard to do reliably (LLM
  judgment on cross-chapter relationships at scale). v1 relies on
  the high-similarity bypass + retrieval-frequency feedback to
  surface revivals organically. Lands if real signal shows
  callbacks consistently miss.
- **Storage-tier triggers** — periodic stale pruning of cold
  awareness rows, per-character awareness volume cap, retrieval-
  frequency-driven pruning. Not in v1; levers if testing shows
  the awareness-graph long tail genuinely bites.

---

## Cross-references

Authoritative material in other docs that this doc depends on or
extends:

- [`data-model.md → World-state storage`](./data-model.md#world-state-storage)
  — `entities` shape, status lifecycle, authorship contract.
- [`data-model.md → Happenings & character knowledge`](./data-model.md#happenings--character-knowledge)
  — `happenings`, `happening_involvements`, `happening_awareness`
  shapes.
- [`data-model.md → Chapters / memory system`](./data-model.md#chapters--memory-system)
  — chapter trigger and atomic-commit shape.
- [`data-model.md → Entry mutability & rollback`](./data-model.md#entry-mutability--rollback)
  — delta log, reverse-replay.
- [`data-model.md → Injection modes`](./data-model.md#injection-modes--unified-enum--structural-invariant)
  — the structural invariant for active+in-scene; the unified enum
  this doc renames.
- [`architecture.md → Generation context and prompt templates`](./architecture.md#generation-context-and-prompt-templates)
  — the single-context principle and Liquid template model.
- [`architecture.md → Retrieval / injection phase`](./architecture.md#retrieval--injection-phase)
  — the structural floor and per-mode invariants.
- [`architecture.md → Generation transactions and edit gating`](./architecture.md#generation-transactions-and-edit-gating)
  — single-writer invariant and the gate-declaration shape this doc's
  background classifier consumes.
