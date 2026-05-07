# Aventuras — architecture

How the pieces fit together. `docs/data-model.md` tells you what's stored;
`docs/tech-stack.md` tells you what it's built with; this doc tells you
how code is organized and how data flows through it.

Living doc. Add sections as decisions solidify, update as implementations
settle.

---

## Pipeline principles

The core of the app is the **generation pipeline** — the sequence that
turns a user action (new message, regenerate) into an AI-generated
narrative reply + classified world-state changes + persisted deltas. The
old app's `src/lib/services/generation/GenerationPipeline.ts` is the
reference architecture; v2 adopts the shape and strips the ceremony.

### Phases are plain async-generator functions

Old app: each phase is a class instantiated with a `PipelineDependencies`
bundle threaded through constructors. V2: each phase is a standalone
async generator function that takes narrow, turn-specific inputs (narrative
content, `action_id`, abort signal, etc.).

```ts
// Old (verbose)
class ClassificationPhase {
  constructor(private deps: ClassificationDependencies) {}
  async *execute(input: ClassificationInput) { ... }
}

// V2 (lean) — zero parameters; everything read from Zustand
async function* classifyReply() {
  const { narrativeResult, abortSignal, actionId } = useGenerationStore.getState()
  const { entities, happenings } = useStoryStore.getState()
  if (!narrativeResult || abortSignal?.aborted) return { aborted: true }
  ...
}
```

No constructor, no `deps` bundle, no prop-drilling, **no function
parameters**. Phases read from the generation store (inputs,
intermediates, abort signal, action_id) and from the story store
(loaded narrative state) directly. If a phase genuinely needs a
per-call knob that doesn't belong in global state (e.g. a test
override), that's the rare exception — the norm is zero params.

### Zustand is the state access layer, not a prop

The major pain point in the old pipeline was wiring: every phase needed
world state, every phase needed the story, every phase needed a dozen
services — all of it had to pass through constructors and configs. V2
eliminates that: **any pipeline code that needs state reads directly from
Zustand.** No injection, no prop drilling.

Testability: Zustand stores are seedable per-test via `useStoryStore.setState(...)`.
Testing a phase = seed the store, run the generator, assert on emitted
events/deltas.

### Pipeline is functionally pure; orchestrator applies effects

Phases **emit events**; they don't mutate SQLite or the store directly.
An orchestrator layer consumes the event stream and calls Zustand actions
that do the persistence:

```
┌──────────────────────────────┐
│  GenerationPipeline (pure)   │ ── yields events + delta payloads
└──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  PipelineOrchestrator        │ ── consumes events
└──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Zustand actions             │ ── write SQLite + append delta + update store
└──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│  UI re-renders               │ ── subscribes to store
└──────────────────────────────┘
```

UI also subscribes to the pipeline event stream in parallel, for
progress indicators and streaming content render. State updates arrive
through Zustand; structural events (phase start/complete, errors) arrive
direct.

### AsyncGenerator event streams

Carry this pattern over from the old app — it works well. Each phase
yields structured events:

- `phase_start` / `phase_complete`
- `stream_chunk` (narrative tokens as they arrive)
- `delta_emitted` (a delta payload ready for orchestrator to apply)
- `error` (recoverable or fatal)

`AsyncGenerator<Event, PhaseResult>` gives us one construct that handles
streaming + progress + final result.

### AbortSignal threaded through everything

Every phase takes an optional `abortSignal`. User-initiated cancel
propagates to the LLM call, the retrieval query, the image request, etc.
Aborted runs produce a well-defined result with `aborted: true` — not
thrown exceptions.

### Generation transactions and edit gating

A pipeline run is a **transaction** on the live store. From
begin-transaction to commit (or abort), the orchestrator owns
writes; user-origin writes are blocked. The user-facing contract
(scope, affordance loci, tooltip copy) lives in
[`ui/principles.md → Edit restrictions during in-flight generation`](./ui/principles.md#edit-restrictions-during-in-flight-generation);
this section is the implementation contract.

**Transaction state lives in the generation store.**

```ts
type TransactionState =
  | { phase: 'idle' }
  | {
      phase: 'in-progress'
      kind: 'per-turn' | 'chapter-close'
      actionId: string
      abortController: AbortController
    }
```

Only the orchestrator transitions `phase`. User-origin actions
never set `in-progress` as a side effect of their own work.

**Lifecycle.**

1. **Begin.** Orchestrator calls
   `useGenerationStore.beginTransaction({ kind })`. State
   transitions `idle → in-progress`. A fresh `actionId` is generated;
   an `AbortController` is created and stored. Pipeline phases begin.
2. **Phase writes.** Each phase emits events; the orchestrator
   translates events to Zustand actions dispatched with
   `source: 'pipeline'`. Every dispatched action carries the
   transaction's `actionId`, which propagates to the delta log
   (per [Entry mutability & rollback](./data-model.md#entry-mutability--rollback)).
   The action layer admits these (gate bypassed for
   `source: 'pipeline'`).
3. **Commit.** Orchestrator calls
   `useGenerationStore.commitTransaction()` when the final phase
   completes. State transitions `in-progress → idle`. The
   `actionId`'s deltas are now permanent (subject to user CTRL-Z
   via the normal undo path).
4. **Abort.** Triggered by user cancel, navigation away from the
   story, or pipeline-level fatal error. Orchestrator calls
   `abortController.abort()` (every phase's `abortSignal.aborted`
   becomes true; LLM calls cancel; running generators return
   `{ aborted: true }`), then reverse-replays the `actionId`'s
   deltas against SQLite + the live store using the same `undo_payload`
   the delta log records for user CTRL-Z. Abort is conceptually
   identical to user CTRL-Z — just unrolled by the orchestrator
   on cancel/error instead of by the user on input. Then
   `useGenerationStore.abortTransaction()`. State transitions
   `in-progress → idle`. UI gate releases.

**Required-source action signature.**

Every mutation action takes a required `source: MutationSource`
field. No default; forgetting it is a TypeScript error.

```ts
type MutationSource = 'user' | 'pipeline'

const createEntity = (args: { data: EntityCreate; source: MutationSource }): MutationResult => {
  if (args.source === 'user' && useGenerationStore.getState().txState.phase === 'in-progress') {
    return { status: 'rejected', reason: 'pipeline-in-flight' }
  }
  // ... append delta with current actionId, write SQLite, update store
}
```

Required-source is the structural enforcement: drift is a
compile-time error, not a code-review concern. Tests bypass the
action layer via `setState` for setup; tests that exercise the
action layer pass `source: 'pipeline'` to act as the orchestrator.
The UI gate (disabled controls + tooltips, see principles.md) is
the user-facing path. The action-layer rejection is defense in
depth — catches programmatic edits, IPC actions, future MCP
exposure, mistakes in feature work. Never expected to fire in a
working UI flow.

**Streaming partial entries on abort.**

The narrative phase streams content into the AI entry's row as a
side-channel write (see
[Why intermediates aren't persisted](#why-intermediates-arent-persisted));
the `op=create` delta only commits at stream completion. On abort
mid-stream, no `op=create` delta exists yet — the live-store row
is dropped, SQLite never wrote it, no delta to reverse for the
entry itself. Classifier deltas (if any have already fired during
the same transaction) are reverse-replayed normally.

**Atomic chained transactions.**

When a per-turn commit triggers chapter-close (token-threshold
cross), the orchestrator chains the two transactions without
yielding to user input. The gate's UI state continues seamlessly:
per-turn pill transitions to chapter-close pill+banner. No window
for the user to slip an edit in between.

**Single-writer invariant.**

At most one pipeline transaction is in flight at a time. Chapter-
close is triggered only between turns, so concurrent transactions
don't arise in v1. Future relaxation (concurrent pipelines, or
background agents running alongside per-turn) requires the
coordination story below.

**Wizard creation transaction — exempt from the delta log.**

Story creation runs as its own atomic SQLite transaction, parallel
in shape to the per-turn / chapter-close pipelines but distinct in
two ways: (1) writes are **not** delta-logged (the rows are baked
in as the story's initial state), and (2) the orchestrator that
drives it is the wizard, not the pipeline orchestrator. Writes:

- `stories` row (identity columns + `definition` JSON +
  copy-at-creation `settings` JSON)
- initial `branches` row
- initial cast (`entities` rows incl. lead)
- world rules (`lore` rows, optional)
- opening (`story_entries[1]`, `kind='opening'`); for AI-assisted
  openings, the metadata fields are populated inline via structured
  output (see `## Agent orchestration → Classifier`)

All five succeed together or none. No `action_id` on the wizard
transaction (no deltas exist to group). Earliest possible
`action_id` in the log is the user's first turn after wizard commit.
See data-model.md → "Entry mutability & rollback" for the
delta-exemption rule and "Opening entry" for opening invariants.

**Background-agent declaration interface.**

Background agents (the periodic classifier; future style-review,
etc.) declare their gate behavior at their own design pass. The
principle here owns the declaration shape; the agent's design pass
picks values.

| Field            | Values                                                         |
| ---------------- | -------------------------------------------------------------- |
| `writeSet`       | Code-side enumeration of action types the agent dispatches.    |
| `gateBehavior`   | `'hard-gate'` \| `'scoped-gate'` \| `'no-gate'`                |
| `conflictPolicy` | `'abort-self'` \| `'block-pipeline'` \| `'concurrent-allowed'` |
| `affordance`     | `'invisible'` \| `'pill-only'` \| `'pill-and-banner'`          |

`'hard-gate'` triggers the same gate per-turn / chapter-close use
(banner content describes the agent). `'scoped-gate'` will gate
only the agent's `writeSet` (machinery lands when the first agent
uses it). `'no-gate'` runs without restricting user editing —
appropriate when `writeSet` is genuinely disjoint from anything
user-editable (the periodic classifier writes happenings + awareness

- status flips, all field-disjoint from per-turn user edits).
  `conflictPolicy` defines what happens when a per-turn or
  chapter-close pipeline starts while this agent is mid-run; no
  default — wrong choice either burns provider budget
  (`'abort-self'` on a long agent every turn) or blocks the user
  (`'block-pipeline'` on a slow agent).

**First real consumer: the periodic classifier** (per
[`docs/memory/classifier.md`](./memory/classifier.md)) declares
`gateBehavior: 'no-gate'`, `conflictPolicy: 'concurrent-allowed'`,
`affordance: 'pill-only'` (or `'invisible'`; UI surface design TBD).
`'concurrent-allowed'` works because the classifier's write set is
disjoint from piggyback's at field-level granularity (status +
description vs. visual + location + inventory) — see
[`docs/memory/cadence.md → Concurrency`](./memory/cadence.md#concurrency).
Chapter-close lifts the concurrency for its own duration: the
periodic classifier doesn't start a new pass while chapter-close is
in flight.

**Single-writer-per-write-set in v1.** With the periodic classifier
running concurrent with per-turn pipelines, the original
"single-writer" invariant relaxes — but only at the field-set
boundary the agents declare. User edits still respect the gate
during pipeline runs; piggyback can't be in flight during
chapter-close because chapter-close runs between turns by
construction. See
[`docs/memory/cadence.md → Single-writer-per-write-set`](./memory/cadence.md#single-writer-per-write-set-in-v1).

**`readSet` is intentionally absent.** Per
[The single-context principle](#the-single-context-principle),
every agent in a context group receives the full `promptContext`;
the Liquid template selects what it actually uses. Read-set is
template-determined, pack-editable, and dynamic — not
code-declarable. Future scoped-gate design must address read
consistency separately (Liquid AST analysis at template load is
one candidate; hard-gate fallback for unbound templates is
another).

---

## Generation context and prompt templates

The pipeline revolves around **one unified context object** that every
prompt template within a context group receives. Templates don't take
bespoke inputs — they pull what they need from that single shape, and
pipeline phases write intermediate results back to the same object so
later templates can read them. Reference architecture:
`src/lib/stores/story/generationContext.svelte.ts` +
`src/lib/services/templates/templateContextMap.ts` in the old app's
rewrite branch.

### The single-context principle

- **One shape per group, rendered to every template in that group.** No
  per-template input wiring; if a template needs the narrative result,
  it references `narrativeResult.content` from the same context that
  the narrative template used to receive `storyEntries`.
- **Pipeline intermediates flow through the context.** `retrievalResult`,
  `narrativeResult`, `classificationResult`, `translationResult`,
  `chapterAnalysis` are written by phases into the generation store and
  become available to later templates in the same run.
- **Pack variables (user-defined custom fields) sit alongside built-ins.**
  A pack author sees the same API surface a built-in template sees.
- **No prop-drilling between phases or templates.** Phases read via
  `useGenerationStore.getState().promptContext()`; templates render
  against that output.

### Formatting lives in Liquid, not in the context builder

A direct consequence of the single-context policy: **the unified
context carries relatively raw data, and prompt-specific formatting
happens inside the Liquid template.** The alternative — pre-formatted
variants for each consuming template — would bloat the context and
force every prompt to share identical text shape. Neither is
acceptable. And more importantly, this community tinkers — pack
authors and power users want real control over the prompts they're
shipping to the LLM. Liquid is the lever they pull.

In practice:

- The context carries structured data (entity arrays, happening sets,
  chapter lists, etc.) in close-to-native form
- Templates iterate, filter, conditionally render, and format using
  Liquid's built-in tags + filters
- **Custom Liquid filters** are the escape hatch for transforms that
  would be ugly in raw Liquid or get reused across templates; they're
  implemented in code once and exposed to every template

### Custom filters: the author's toolbox

Built-in filters are for **data shaping and utility**, not text
formatting. Text formatting happens in the template directly (via
variable rendering) or inside a macro (see below). A code-side
formatter would lock the text shape in code where authors can't
override it — that violates the north star. Two categories:

**Selectors** (filter or reshape arrays; return arrays):

- `by_kind: 'character'` — filter entity array by kind discriminator
- `active` / `staged` / `retired` — filter entities by status
- `known_to: pov_character` — filter happenings by the POV character's
  awareness links, so only facts the character knows appear
- `involving: entity_id` — filter happenings by involvement
- `recent: n` — last N entries
- `sorted_by: 'field'` — sort with a named key

**Utilities** (stateless transforms; return primitives):

- `tokens` — count tokens of a string or array (backed by
  `js-tiktoken`)
- `truncate_tokens: n` — truncate to N tokens, smart at sentence
  boundaries
- `prose_join` — `["A","B","C"]` → `"A, B, and C"`
- `json` — stringify for cases where the prompt embeds JSON literally
- `has_keyword: source_text` — truthy when any of the filter's
  keywords appear in source_text

Real list grows as templates demand. Implementation: each filter
registers with LiquidJS at app init via `engine.registerFilter(name,
fn)`. Filter function is TypeScript, typed end-to-end.

### Macros — reusable Liquid snippets, not code-side formatters

Text formatting — a character block, a happening rendered for memory
recall, an output-format directive — belongs in **macros**, not
filters. A macro is a `.liquid` snippet included from other templates
via `{% include 'macro-id' %}`. The old app had a `staticContent`
group for this but never really used it; v2 names the concept `macros`
and leans on it heavily.

Every macro is created with a **context group tag**. The group drives:

1. **Editor awareness** — the Liquid editor's autocomplete shows the
   group's variables when editing the macro (same registry that powers
   template autocomplete)
2. **Include compatibility** — a template in group G can only include
   macros tagged with G or `staticContent` (the zero-variable fallback
   for truly group-free macros like output-format directives). The
   editor flags mismatches at author time; a runtime validator catches
   them on pack load

Example built-in macros:

- `macros/character_block` (`promptContext`) — a character formatted as
  a description block
- `macros/happening_for_memory` (`promptContext`) — a happening
  formatted as it would appear in a POV character's memory, including
  the source descriptor
- `macros/output_format_narrative` (`staticContent`) — the output
  instruction block for narrative generation
- `macros/output_format_json` (`staticContent`) — generic JSON output
  directive

### The pack model: full replacement, not override

A **pack is a complete, self-contained bundle** of prompts + macros.
It contains the full required surface — every template the app
invokes, every macro the app's templates include — not a patch layer
on top of a default.

**Creation flow:** a user creating a custom pack starts with a **full
copy of the default pack**. Every prompt and macro is already there;
they edit whichever ones they want within their pack. Unchanged
prompts stay identical to default by virtue of being copied, not by
inheriting anything at runtime.

**Runtime model:** the active pack's version of any prompt/macro IS
what runs. There's no fallback chain, no "if missing, look in default"
cascade. This keeps the runtime simple and gives pack authors
unambiguous ownership of their pack's shape.

**Consequence to flag:** when an app update introduces a new required
prompt or macro, existing custom packs won't have it and will fail
that template's render. Pack migration tooling ("import new prompts
from default into your pack") becomes necessary once packs are a
real feature. Deferred with the pack system generally.

### Author extensibility — v1 and beyond

**V1 scope:**

- Users edit `.liquid` prompt files via the CodeMirror editor (desktop/web)
- Editor autocompletes variable names, filter names, and includable
  macro IDs (filtered by the current template's context group)
- Filters are code-defined and shipped with the app
- Pack authors work inside a full copy of the default pack, editing
  any prompt or macro within their pack. New macros are group-tagged
  on creation.

**Future directions** (not v1, but the architecture shouldn't foreclose
them):

- **Pack-defined custom filters** — sandboxed JS expressions or a
  safe DSL, registered per-pack. Lets pack authors add transforms
  without recompiling the app. Real risk is sandboxing; deferred.
- **Additional context variables exposed per pack** — pack-scoped
  variables (runtime variables mentioned in tech stack). Deferred
  with the pack system generally.
- **Filter composition** — allowing users to chain filters into named
  aliases for convenience.

The north star: **a pack author should be able to rebuild the entire
prompt shape if they want.** Nothing about "how prompts look" is
buried in code that isn't reachable from a template.

### Context groups

Different surfaces need different variable sets. The template registry
maps every `templateId` to exactly one group:

| Group             | Consumers                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promptContext`   | Pipeline + post-pipeline generation templates: classifier, narrative, suggestions, action-choices, chapter-analysis, chapter-summarization, translate-\*, style-reviewer, agentic-retrieval, image-prompt-analysis, ... |
| `wizard`          | Story-creation flow: setting expansion, character elaboration, opening generation, supporting characters                                                                                                                |
| `vault`           | Vault (reusable library) AI interactions                                                                                                                                                                                |
| `lore`            | Lore-management agent templates (at chapter close)                                                                                                                                                                      |
| `import`          | Character-card imports, vault imports, lorebook classifiers                                                                                                                                                             |
| `portrait`        | Character portrait generation                                                                                                                                                                                           |
| `translateWizard` | Translation-wizard flow                                                                                                                                                                                                 |
| `staticContent`   | Variable-free macros (output-format directives, boilerplate blocks) — includable from any group                                                                                                                         |

For v1 ship `promptContext` + `wizard` (likely — wizard lands with the
first "create a story" flow). The others land with their corresponding
features. The group system itself is day-one infrastructure; without it
the prompt editor can't provide autocomplete or validate references.

### Variable registry (for the prompt editor)

A registry file (`src/ai/prompts/templateContextMap.ts` in v2) exists
**specifically to give the prompt editor shape awareness** — autocomplete,
inline variable docs, display-group organization in the sidebar. It is
**not** the runtime source of truth for what gets injected into a
template; that's the actual `promptContext` object computed by code.

What the registry contains:

- **Variable definitions per group**: `name`, type, `category`,
  `description`, optional `infoFields` documenting nested structure,
  optional `enumValues`, `required` flag — consumed by CodeMirror's
  Liquid mode for autocomplete and hover docs
- **Template → group map**: every `.liquid` template ID mapped to
  exactly one group so the editor knows which variable set to show
- **Display groups**: UI-level semantic grouping (Story Config, Entities,
  World State, Generation Results, Time, ...) — powers sidebar/autocomplete
  organization in the prompt editor
- **Integrity validator**: test-accessible function that reports
  unmapped template IDs and display-group variables that don't match
  any defined variable. Catches obvious drift but does not enforce that
  the registry and the runtime shape agree — that discipline sits with
  the authors of both sides.

The runtime shape of `promptContext` is whatever the computed getter
returns; TypeScript types on the runtime side are the real safety net.
The registry mirrors that surface for authoring ergonomics.

### The generation store

Pipeline inputs + intermediates live in a Zustand store —
`useGenerationStore` — sibling to `useStoryStore`. Exact field shape
is for v2 to design clean; what matters is the conceptual separation
of what it holds:

- **Inputs** — the parameters of the current turn (user action,
  action type, abort signal, raw input). Set at turn start.
- **Loaded context** — data computed on story open and reused across
  turns (pack variables, style prompt). Persists until story switch.
- **Pipeline intermediates** — results written back by each phase as
  it completes (retrieval result, narrative result, classification
  result, translation result, ...). Readable by later phases and
  templates in the same turn.
- **Derived getters** — read across this store + `useStoryStore` +
  the settings stores to produce the unified `promptContext` object,
  plus token counts and other cached computations.
- **Lifecycle**
  - `clearIntermediates()` at turn start (new message, regenerate) —
    wipes inputs + intermediates but keeps loaded context
  - `clear()` on story switch — resets everything

The `promptContext` getter is where the merge happens: it reads static
story state from `useStoryStore.getState()`, LLM-relevant user settings
from their settings stores (see below), and combines those with the
generation store's inputs + intermediates into one object that every
template in the `promptContext` group renders against.

### Settings: strict types, defaults at load

The `promptContext.userSettings` slice exposes the LLM-relevant subset
of settings that prompt templates consume. Several shapes feed into it:

1. **App-level settings** (`useAppSettingsStore`) — global, persist
   across stories. Holds two distinct roles:
   - **"Default story settings"** — values that act as defaults for
     new stories (memory knobs, translation config, composer UX
     prefs, suggestions toggle, etc.). On story creation, these are
     copied into the new `stories.settings`; the story owns them
     thereafter. Changing the global does NOT propagate to existing
     stories. This is the **copy-at-creation scope pattern**.
   - **Global model defaults** (`defaultModels.narrative`,
     `defaultModels.classifier`, ...) — resolved live at render time
     via the models resolver (see below). This is the
     **override-at-render scope pattern**.
   - **App-only settings** — global concerns that never appear
     per-story (API keys, classifier truncation caps, diagnostics
     toggles).
2. **Story-level definition** (`stories.definition` JSON on the
   loaded story) — definitional content (`mode`, `leadEntityId`,
   `narration`, `genre`, `tone`, `setting`, calendar fields). Zod-
   parsed at story open via the `StoryDefinition` schema with
   defaults applied. Full shape in data-model.md → "Story settings
   shape."
3. **Story-level settings** (`stories.settings` JSON on the loaded
   story) — operational config (memory knobs, translation, models,
   pack). Zod-parsed at story open via the `StorySettings` schema.
4. **Story identity fields** (`stories` columns — title, tags,
   cover, accent, etc.) — not LLM-consumed directly; these are
   library-shaped metadata.

**Scope policy — two patterns:** See data-model.md → "Story settings
shape" for the authoritative version. Summary: copy-at-creation for
operational + UX defaults (`stories.settings`); override-at-render
for models only; wizard-authored with no global default for
everything in `stories.definition`; columns-on-stories for identity.

**Pattern to avoid (the old app's):** inline `??` fallbacks and hardcoded
defaults at every read site, scattered across the `promptContext` getter
— `settings.foo ?? 100`, `story.settings.bar ?? 'baz'`, etc. No single
place held "the real shape of user settings." Result: silent drift,
duplicated defaults, weakly-typed access at the consumer.

**V2 pattern:** settings are **zod-parsed on load** — app settings when
the settings store hydrates, story settings when the story opens — with
defaults applied at parse time. By the time any code reads them, every
field is guaranteed to be its declared type, every optional field has
its default filled in, and no `??` fallback should appear in the
`promptContext` getter or anywhere else. If a value is missing from the
persisted JSON, that's the parse's job to fix, not the reader's.

**The models resolver is the one deliberate exception** to "no `??` at
read sites" — because models use override-at-render, `promptContext`
calls a named `resolveModel(feature)` function that does
`story.settings.models[feature] ?? appSettings.defaultModels[feature]`.
Single, typed, named — not ambient `??` scattered everywhere. Every
other setting read is a direct property access off the parsed story
settings.

The generation store doesn't own settings storage — it reads via
`getState()` on the app-settings store and the loaded story's settings
slice, and surfaces them through `promptContext.userSettings` as a
clean, flat, typed shape for templates to consume.

### How phases consume and produce context

```ts
async function* classifyReply() {
  const ctx = useGenerationStore.getState().promptContext()
  const story = useStoryStore.getState()

  const classifier = getClassifier(story.story.settings.classifierModel)
  const rendered = renderTemplate('classifier', ctx)

  // ... call LLM, parse with zod, jsonrepair fallback ...

  const result = { classificationResult: { ... } }
  useGenerationStore.getState().setClassificationResult(result)
  yield { type: 'phase_complete', phase: 'classification', result }
}
```

Three things happen: phase reads unified context (no deps bundle), phase
writes its result back to the store (so later phases can read it), phase
yields an event (orchestrator applies derived deltas to SQLite +
`useStoryStore`).

### v2 shape of `promptContext` — what's carried over, what changes

| Old variable                                   | V2 replacement                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `characters` / `locations` / `items`           | Unified under `entities` discriminated by `kind`                                                                                              |
| `storyBeats`                                   | Renamed `threads`                                                                                                                             |
| `lorebookEntries`                              | Split: `lore` (timeless reference) + entities with `status='staged'` (pre-introduced actors)                                                  |
| `relevantWorldState`                           | Same concept; filtered slice of entities/happenings/lore driven by POV character's `happening_awareness`                                      |
| `timeTracker`                                  | Derived from latest entry's `metadata.worldTime` + `definition.worldTimeOrigin` (see data-model.md → "In-world time tracking")                |
| `genre` / `tone` (single-string fields)        | `definition.genre.{label,promptBody}` and `definition.tone.{label,promptBody}` — substantial preset+prose blocks (label + body)               |
| `setting` (no v1 equivalent in old context)    | New: `definition.setting` — freeform prose injected into generation context                                                                   |
| `translated_*` columns via `translationResult` | Reads through the `translations` table (polymorphic target) instead of per-column fields                                                      |
| Pipeline intermediates (narrativeResult, etc.) | Same — written to generation store, available to later templates                                                                              |
| `packVariables.runtimeVariables`               | Same pattern; deferred until pack system lands (see [`parked.md → Pack runtimeVariables surface`](./parked.md#pack-runtimevariables-surface)) |

Definitional fields (mode, lead, narration, genre, tone, setting,
calendar) are sourced from `story.definition`; operational fields
(memory knobs, translation, models, pack) from `story.settings`. The
two zod-parsed shapes feed `promptContext` through different
sub-getters but compose into one rendered context object per
[The single-context principle](#the-single-context-principle).

### Why intermediates aren't persisted

The generation store is a **scratchpad**, not history of record. What
gets persisted to SQLite is:

- The user's action as a `story_entries` row (via a delta created in the
  Pre phase)
- The narrative content accrues on the AI entry row as the stream
  progresses (text edit side-channel, per Entry Mutability decision);
  on stream completion, the entry's `op=create` delta commits
- Classification output becomes N deltas on the log (entity creates /
  updates, happening creates, awareness links, etc.), all under the same
  `action_id` as the narrative
- Translation writes become `translations` rows + their deltas, same
  `action_id`

The store's copies of these results exist only so later templates in
the same turn can reference them. Between turns, `clearIntermediates()`
wipes everything. The delta log carries the history.

---

## Agent orchestration

Memory-state writes split across three time scales per the cadence
stratification in [`docs/memory/cadence.md`](./memory/cadence.md):

| Layer                      | Trigger                                                                 | Scope                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Piggyback**              | Every AI reply, inline on the narrative call (capability-gated)         | Scene-local fast-mutating state — `sceneEntities`, `currentLocationId`, `worldTime`, visual mutations, item transfers    |
| **Periodic classifier**    | Background, configurable cadence (`stories.settings.classifierCadence`) | Multi-turn batch extractions — happenings, involvements, awareness, entity status flips, first-introduction descriptions |
| **Chapter-close pipeline** | Token threshold crossed OR user-triggered                               | 5-phase pipeline: catch-up classifier, boundary, metadata, lore-mgmt (5 sub-jobs), lifecycle review                      |

Two agents from the prior design were collapsed:

- **Memory-compaction agent** subsumed by chapter-close lore-mgmt
  (phase 3d awareness pin tuning + phase 3e happenings consolidation).
  Eager "summarize low-salience rows into summaries" was replaced by
  upsert-at-write (UNIQUE constraint on awareness rows) plus
  semantic-cluster consolidation at chapter close. See
  [`docs/memory/chapter-close.md → Phase 3`](./memory/chapter-close.md#phase-3--lore-management).
- **Per-reply classifier** split into piggyback (when
  `piggybackMode='on'` and the narrative model has structured-output
  capability) + periodic classifier (background; handles the larger
  multi-turn batch). Either path covers the same write set; mode
  toggle is at `stories.settings.piggybackMode`.

Detailed contracts for each layer in
[`docs/memory/piggyback.md`](./memory/piggyback.md),
[`docs/memory/classifier.md`](./memory/classifier.md), and
[`docs/memory/chapter-close.md`](./memory/chapter-close.md). The
periodic classifier is the first agent that exercises the
`'concurrent-allowed'` `conflictPolicy` declared in
[Generation transactions and edit gating](#generation-transactions-and-edit-gating).

**Classifier contract — `metadata` fields.** Alongside entity/happening/
awareness deltas, the classifier populates the new entry's metadata:

- `sceneEntities: string[]` — entity IDs (characters + items) present
  in the scene this entry depicts.
- `currentLocationId: string | null` — the singleton location entity
  that IS the current scene.
- `worldTime: number` — seconds delta (universal across calendars)
  added to the previous entry's `worldTime`. Monotonically
  non-decreasing. **For detected flashback / memory framing ("she
  remembered...", "25 years earlier..."), the classifier emits 0** —
  main-timeline clock doesn't advance during recalled scenes. Users
  can manually correct drift via metadata edit (delta-logged). v1
  doesn't model structural non-linear narrative — see data-model.md →
  "In-world time tracking" for the limitation.

**Classifier does NOT run on the opening entry** (`kind='opening'`).
Two paths populate opening metadata, both at wizard-commit time
rather than via a classifier pass:

- **AI-generated openings** emit minimal scene metadata inline as
  part of the wizard's structured-output generation call (prose +
  `sceneEntities` + `currentLocationId` + `worldTime: 0` in one
  call). The model is constrained to reference only wizard-curated
  cast entity ids in the metadata refs.
- **User-written openings** start with empty metadata
  (`worldTime: 0`, `sceneEntities: []`,
  `currentLocationId: null`). The first AI reply's prompt context
  includes the opening prose verbatim (recent buffer covers it),
  so turn-2 classifier picks up scene presence going forward.

A separate tagging pass for user-written openings is parked in
[`followups.md → Classifier-on-opening retrofit`](./parked.md#classifier-on-opening-retrofit)
— retrofit if entry-1 metadata becomes load-bearing for any
downstream feature. See
[`data-model.md → Opening entry`](./data-model.md#opening-entry) for
the full opening contract.

**Chapter-close** is its own sub-pipeline. Five phases under one
`action_id` (catch-up classifier, boundary selection, metadata,
lore-mgmt with five sub-jobs, lifecycle review). A single CTRL-Z
from the user reverses the entire chapter-close. Full design in
[`docs/memory/chapter-close.md`](./memory/chapter-close.md). The
chapter-close transaction holds the gate per
[Generation transactions and edit gating](#generation-transactions-and-edit-gating);
the periodic classifier is blocked from starting a new pass while
chapter-close is in flight (one-direction lock).

---

## Translation as a pipeline concern

Translation of LLM-generated user-facing content is a pipeline phase,
not a one-off feature. It runs in parallel with classification after
the narrative phase finishes. The `translations` table (see
`docs/data-model.md`) stores each translation as one row keyed by
`(branch_id, target_kind, target_id, field, language)`.

**What gets translated:**

- Narrative content (the AI reply itself)
- User action content (so the LLM-facing log is monolingual even when
  the UI shows the user's native tongue)
- Entity name + description + state-specific fields as they're created
  or modified
- Lore title + body when created or edited
- Thread title + description
- Happening title + description
- (Chapter title/summary on chapter close)

**Why centralize:**

- Old-app pattern of `translated_name` / `translated_description` columns
  per table led to column proliferation AND hard-coded "one target
  language" — lost prior translations on reconfig
- Single table scales to multiple target languages without schema changes
- Participates in the delta log uniformly (`deltas.target_table =
'translations'`) — rollback reverses translations alongside their
  source writes

**Runtime:** Zustand loads translations into a flat index for O(1)
render-time lookup. Components that render user-facing text call a
helper like `t(source, field)` that looks up the current language's
translation and falls back to source.

**Display-only invariant — translations never feed back into prompts.**
Translations are strictly one-way: `source → translated_text` for UI
rendering. The pipeline, classifier, retrieval, and narrative layers
always operate on the source-language content; the LLM-facing log is
monolingual regardless of UI language. Narrative is generated in the
source language; the classifier reads source-language entities;
retrieval filters source-language text.

Consequences:

- Switching `settings.translation.targetLanguage` does not invalidate
  narrative coherence — nothing the LLM ever saw changes.
- Translation of **user action content** (composed in the user's
  target language) is the exception that proves the rule: that
  translation runs in the OPPOSITE direction — target → source — so
  the LLM-facing log stays source-language. Same `translations`
  table, same phase, different translation direction.
- Re-translating an already-translated field looks up the existing
  row before calling the translation model, so translation memory
  is per-field-per-language and naturally consistent across a story.

**What translation CANNOT do:** change the language the AI writes in.
If a user wants the narrative generated in Spanish, that's a distinct
concept — a narrative-language / source-language setting — not
translation. Not currently modeled; flagged for later if demand
emerges. Translation is strictly a display-time surface.

---

## Retrieval / injection phase

Fills the prompt's entity / lore / happening / thread / chapter-
summary slices given token budget, injection modes, scene presence,
and POV-awareness. The full design — embedding infrastructure, query
construction, candidate pools, hybrid retrieval per type, the ranker
(scoring + MMR + budget-fill + bypass + chapter-match boost), and
pinning (`decay_resistance`) — lives in
[`docs/memory/retrieval.md`](./memory/retrieval.md). This section
captures the architecture-level invariants the rest of the pipeline
depends on.

### Structural floor — always inject

These structural injects bypass the ranker; they consume budget
unconditionally before per-type retrieval allocates the remainder:

- **Recent buffer.** Last `stories.settings.recentBuffer` entries
  verbatim, regardless of chapter boundaries. With
  `fullChapterInBuffer=true`, the current chapter is also verbatim
  in addition. See
  [`docs/memory/cadence.md → User-tunable knobs`](./memory/cadence.md#user-tunable-knobs).
- **Active + in-scene entities.** `entities.status='active' AND id ∈
metadata.sceneEntities` are ALWAYS injected, regardless of
  `injection_mode`. `currentLocationId` gets the same treatment.
- **Active threads.** `threads.status='active'` must-inject as
  structural framing.
- **`injection_mode='always'` rows** across entities / lore /
  threads — user-intent override.

Rationale for the active+in-scene invariant: the entity IS what the
current narrative revolves around. Excluding one on a user-set
`disabled` flag would produce broken prompts ("who is this person
the narrator keeps addressing?"). The mode setting is respected
everywhere the entity isn't structurally necessary.

### Injection mode — non-structural cases

After the structural floor seats, remaining candidate rows (lore,
non-scene entities, threads, chapter summaries, happenings via
awareness) are filtered by `injection_mode`:

- `always` — unconditional include in candidate pool.
- `auto` — let the retrieval pipeline decide via keyword + embedding
  - LLM-fallback. Default for new rows. Renamed from `keyword_llm`;
    see [`data-model.md → Injection modes`](./data-model.md#injection-modes--unified-enum--structural-invariant).
- `disabled` — skip entirely unless structurally required (which
  `disabled` cannot suppress).

Happenings don't carry `injection_mode` at all — the awareness graph
(`happening_awareness`) IS the injection rule. Common-knowledge
happenings (`happenings.common_knowledge=1`) bypass awareness
entirely and rank in their own pool by `sim_blend + kw_boost` only;
see
[`docs/memory/retrieval.md → Common-knowledge happenings`](./memory/retrieval.md#common-knowledge-happenings--special-case).

### POV-awareness — union, both modes

Retrieval queries the awareness graph as the **union of all in-scene
characters' awareness rows** in both adventure and creative modes,
not lead-only. Detached-POV moments (a non-lead character acquiring
knowledge in a side scene) need the wider scope; the `narration`
setting is the lever for POV-constraint via prompt, not retrieval.
See
[`docs/memory/retrieval.md → POV-awareness scope`](./memory/retrieval.md#pov-awareness-scope).

---

## What this doc does not yet cover

Flag for future sessions:

- **Concrete data flow trace** — the exact end-to-end path of one user
  turn through `Pre → Retrieval → Narrative → [Classification ‖ Translation] → Post`,
  including Zustand dispatch points and SQLite writes. Next up.
- **Module / folder layout** — concrete repo organization (`src/db/`,
  `src/store/`, `src/ai/pipeline/`, etc.)
- **Platform boundaries** — Electron main vs renderer, filesystem access
  patterns, IPC, what's RN-native-only, asset directory resolution per
  platform
- **Retrieval — ranking + scoring** — substantially designed in
  [`docs/memory/retrieval.md`](./memory/retrieval.md). What remains
  is empirical tuning (decay rates, similarity thresholds, MMR
  diversity, budget defaults) per the
  [v1-blocking threshold-tuning followup](./memory/followups.md#v1-blocking).
- **Streaming resilience** — mid-stream failure handling, partial-content
  persistence, retry strategy
- **Error handling** — recoverable vs fatal at each layer; user-facing
  error surfaces
- **Startup + migration flow** — first-boot initialization, schema
  migration on version bump, crash recovery, loading current story on
  app launch
- **Secrets storage** — API keys in SQLite (per data strategy), whether
  encrypted at rest, how they flow from settings UI into AI SDK calls
